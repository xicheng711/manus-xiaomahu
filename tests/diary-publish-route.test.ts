import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrpcContext } from '../server/_core/context';

const mocks = vi.hoisted(() => ({
  getMemberByUserId: vi.fn(),
  getDiaryEntryForInteraction: vi.fn(),
  getDiaryEntriesByRoom: vi.fn(),
  updateDiaryEntry: vi.fn(),
  getRoomMembers: vi.fn(),
  getUsersByIds: vi.fn(),
}));

vi.mock('../server/family-db', () => ({
  createFamilyRoom: vi.fn(),
  getFamilyRoomByCode: vi.fn(),
  getFamilyRoomById: vi.fn(),
  getUserFamilyRooms: vi.fn(),
  updateFamilyRoom: vi.fn(),
  addFamilyMember: vi.fn(),
  getRoomMembers: mocks.getRoomMembers,
  getMemberByUserId: mocks.getMemberByUserId,
  updateFamilyMember: vi.fn(),
  removeFamilyMember: vi.fn(),
  deleteFamilyRoom: vi.fn(),
  upsertElderProfile: vi.fn(),
  getElderProfile: vi.fn(),
  upsertCheckIn: vi.fn(),
  getCheckInsByRoom: vi.fn(),
  getCheckInByDate: vi.fn(),
  createDiaryEntry: vi.fn(),
  updateDiaryEntry: mocks.updateDiaryEntry,
  deleteDiaryEntryById: vi.fn(),
  getDiaryEntriesByRoom: mocks.getDiaryEntriesByRoom,
  getDiaryEntryByClientId: vi.fn(),
  getDiaryEntryForInteraction: mocks.getDiaryEntryForInteraction,
  markDiaryRead: vi.fn(),
  getDiaryInteractions: vi.fn(),
  addDiaryComment: vi.fn(),
  deleteDiaryCommentByAuthor: vi.fn(),
  getDiaryInteractionSummaries: vi.fn(),
  createAnnouncement: vi.fn(),
  getAnnouncementByClientId: vi.fn(),
  getAnnouncementsByRoom: vi.fn(),
  getAnnouncementById: vi.fn(),
  getAnnouncementComments: vi.fn(),
  addAnnouncementComment: vi.fn(),
  deleteAnnouncementCommentByAuthor: vi.fn(),
  deleteAnnouncement: vi.fn(),
  toggleReaction: vi.fn(),
  createBriefing: vi.fn(),
  getBriefingsByRoom: vi.fn(),
  getBriefingByDate: vi.fn(),
  upsertMedication: vi.fn(),
  getMedicationsByRoom: vi.fn(),
  deleteMedication: vi.fn(),
  recordMedicationChange: vi.fn(),
  getMedicationChangesByRoom: vi.fn(),
}));

vi.mock('../server/db', () => ({
  updatePushToken: vi.fn(),
  getUsersByIds: mocks.getUsersByIds,
}));

vi.mock('../server/storage', () => ({
  ossUploadAvatar: vi.fn(),
  storagePut: vi.fn(),
}));

import { familyRouter } from '../server/family-router';

const ROOM_ID = 21;
const AUTHOR_ID = 4280;

function context(userId = AUTHOR_ID): TrpcContext {
  return {
    user: {
      id: userId,
      openId: `user-${userId}`,
      email: null,
      name: '测试照顾者',
      loginMethod: 'apple',
      role: 'user',
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      pushToken: null,
    },
    req: { protocol: 'https', headers: {} } as TrpcContext['req'],
    res: {} as TrpcContext['res'],
  };
}

function cloudDraft(overrides: Record<string, unknown> = {}) {
  return {
    id: 128,
    roomId: ROOM_ID,
    authorUserId: AUTHOR_ID,
    content: '完整日记正文',
    conversation: [
      { id: 'u1', role: 'user', text: '完整日记正文' },
      { id: 'a1', role: 'ai', text: '完整的小马虎回复' },
      { id: 'u2', role: 'user', text: '后续对话也必须保留' },
    ],
    conversationFinished: false,
    ...overrides,
  };
}

describe('family.publishDiary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getMemberByUserId.mockResolvedValue({ id: 1, roomId: ROOM_ID, userId: AUTHOR_ID });
    mocks.getRoomMembers.mockResolvedValue([{ id: 1, roomId: ROOM_ID, userId: AUTHOR_ID, name: '测试照顾者' }]);
    mocks.getUsersByIds.mockResolvedValue([]);
    mocks.updateDiaryEntry.mockResolvedValue(undefined);
  });

  it('publishes the author-owned synced draft with only roomId and diaryId', async () => {
    mocks.getDiaryEntryForInteraction.mockResolvedValue(cloudDraft());
    const caller = familyRouter.createCaller(context());

    await expect(caller.publishDiary({ roomId: ROOM_ID, diaryId: 128 })).resolves.toEqual({
      success: true,
      diaryId: 128,
    });
    expect(mocks.getDiaryEntryForInteraction).toHaveBeenCalledWith(ROOM_ID, 128);
    expect(mocks.updateDiaryEntry).toHaveBeenCalledTimes(1);
    expect(mocks.updateDiaryEntry).toHaveBeenCalledWith(128, { conversationFinished: true });
  });

  it('acknowledges an already-published retry without changing content again', async () => {
    mocks.getDiaryEntryForInteraction.mockResolvedValue(cloudDraft({ conversationFinished: true }));
    const caller = familyRouter.createCaller(context());

    await expect(caller.publishDiary({ roomId: ROOM_ID, diaryId: 128 })).resolves.toEqual({
      success: true,
      diaryId: 128,
    });
    expect(mocks.updateDiaryEntry).not.toHaveBeenCalled();
  });

  it('keeps the draft private before publishing and exposes the complete entry to another member afterward', async () => {
    let stored = cloudDraft();
    mocks.getDiaryEntryForInteraction.mockImplementation(async () => stored);
    mocks.getDiaryEntriesByRoom.mockImplementation(async () => [stored]);
    mocks.updateDiaryEntry.mockImplementation(async (_id, patch) => {
      stored = { ...stored, ...patch };
    });

    const author = familyRouter.createCaller(context());
    const viewer = familyRouter.createCaller(context(5000));
    await expect(author.getDiaries({ roomId: ROOM_ID, limit: 100 })).resolves.toEqual([stored]);
    await expect(viewer.getDiaries({ roomId: ROOM_ID, limit: 100 })).resolves.toEqual([]);

    await author.publishDiary({ roomId: ROOM_ID, diaryId: 128 });
    const visible = await viewer.getDiaries({ roomId: ROOM_ID, limit: 100 });
    expect(visible).toHaveLength(1);
    expect(visible[0]).toMatchObject({
      id: 128,
      conversationFinished: true,
      content: '完整日记正文',
      conversation: stored.conversation,
    });
  });

  it('rejects attempts to publish another family member’s draft', async () => {
    mocks.getDiaryEntryForInteraction.mockResolvedValue(cloudDraft({ authorUserId: 9999 }));
    const caller = familyRouter.createCaller(context());

    await expect(caller.publishDiary({ roomId: ROOM_ID, diaryId: 128 })).rejects.toThrow('只能发布自己正在编辑的日记');
    expect(mocks.updateDiaryEntry).not.toHaveBeenCalled();
  });
});
