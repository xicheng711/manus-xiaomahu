import { beforeEach, describe, expect, it, vi } from 'vitest';

const memoryStorage = vi.hoisted(() => new Map<string, string>());
const cloudSyncDiaryMock = vi.hoisted(() => vi.fn<(entry: any, serverId?: number, roomId?: string) => Promise<any>>());
const cloudGetDiariesMock = vi.hoisted(() => vi.fn<(roomId?: number) => Promise<any[] | null>>());
const cloudPublishDiaryMock = vi.hoisted(() => vi.fn<(diaryId: number, roomId?: string) => Promise<any>>());
const cloudDeleteDiaryMock = vi.hoisted(() => vi.fn<(diaryId: number, roomId?: number) => Promise<any>>());
const cloudSyncStateMock = vi.hoisted(() => vi.fn<() => Promise<{ userId: number | null }>>());

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => memoryStorage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { memoryStorage.set(key, value); }),
    removeItem: vi.fn(async (key: string) => { memoryStorage.delete(key); }),
    multiGet: vi.fn(async () => []),
    multiSet: vi.fn(async () => undefined),
    multiRemove: vi.fn(async () => undefined),
    getAllKeys: vi.fn(async () => [...memoryStorage.keys()]),
  },
}));

vi.mock('../lib/cloud-sync', () => ({
  cloudSyncCheckIn: vi.fn(),
  cloudSyncDiary: cloudSyncDiaryMock,
  cloudPublishDiary: cloudPublishDiaryMock,
  cloudGetDiaries: cloudGetDiariesMock,
  cloudDeleteDiary: cloudDeleteDiaryMock,
  cloudSyncMedication: vi.fn(),
  cloudDeleteMedication: vi.fn(),
  cloudPostAnnouncement: vi.fn(),
  cloudSaveBriefing: vi.fn(),
  cloudCreateRoom: vi.fn(),
  cloudJoinRoom: vi.fn(),
  cloudGetRoomDetail: vi.fn(),
  cloudLookupRoom: vi.fn(),
  cloudUpdateElderProfile: vi.fn(),
  cloudUpdateMemberProfile: vi.fn(),
  setCloudSyncState: vi.fn(),
  getCloudSyncState: cloudSyncStateMock,
}));

import {
  getDiaryEntries,
  mergeCloudDiariesIntoLocal,
  syncDiaryEntryNow,
  getLastDiaryPublishFailure,
  deleteDiaryEntry,
  type DiaryEntry,
} from '../lib/storage';

const ROOM_ID = '701';
const CACHE_KEY = `diary_entries:${ROOM_ID}`;

function draft(overrides: Partial<DiaryEntry> = {}): DiaryEntry {
  return {
    id: 'local-draft-1',
    roomId: ROOM_ID,
    clientId: 'draft-client-1',
    date: '2026-09-01',
    content: '今天陪姥姥散步后，她的心情不错，但是我还想继续观察。',
    moodEmoji: '😊',
    moodLabel: '还不错',
    tags: ['散步'],
    createdAt: '2026-09-01T15:30:00.000Z',
    updatedAt: '2026-09-01T15:35:00.000Z',
    localTimeStr: '23:30',
    conversation: [
      { id: 'u1', role: 'user', text: '今天陪姥姥散步后，她的心情不错，但是我还想继续观察。', createdAt: '2026-09-01T15:30:00.000Z' },
      { id: 'a1', role: 'ai', text: '你观察得很细致，今晚可以继续留意她的精神状态。', createdAt: '2026-09-01T15:31:00.000Z' },
      { id: 'u2', role: 'user', text: '好的，我还会记录今晚的情况。', createdAt: '2026-09-01T15:32:00.000Z' },
    ],
    conversationFinished: true,
    syncPending: true,
    ...overrides,
  };
}

describe('reopened diary draft publish recovery', () => {
  beforeEach(() => {
    memoryStorage.clear();
    cloudSyncDiaryMock.mockReset();
    cloudGetDiariesMock.mockReset();
    cloudPublishDiaryMock.mockReset();
    cloudDeleteDiaryMock.mockReset();
    cloudSyncStateMock.mockReset();
    cloudSyncStateMock.mockResolvedValue({ userId: 42 });
  });

  it('publishes a reopened draft directly by durable clientId without a blocking list request', async () => {
    const localDraft = draft({ serverDiaryId: undefined });
    memoryStorage.set(CACHE_KEY, JSON.stringify([localDraft]));
    cloudSyncDiaryMock.mockResolvedValue({ success: true, diaryId: 77 });
    cloudPublishDiaryMock.mockResolvedValue({ success: true, diaryId: 77 });

    await expect(syncDiaryEntryNow(localDraft.id, ROOM_ID)).resolves.toBe(true);
    expect(cloudGetDiariesMock).not.toHaveBeenCalled();
    expect(cloudSyncDiaryMock).toHaveBeenCalledTimes(1);
    expect(cloudSyncDiaryMock.mock.calls[0]).toMatchObject([expect.objectContaining({
      clientId: localDraft.clientId,
      content: localDraft.content,
      conversation: localDraft.conversation,
      // 最终发布复用已验证可达的 syncDiary 链路，并在同一写入中提交完整对话与发布状态。
      conversationFinished: true,
    }), undefined, ROOM_ID]);
    expect(cloudPublishDiaryMock).not.toHaveBeenCalled();

    const [published] = await getDiaryEntries(ROOM_ID);
    expect(published).toMatchObject({
      id: localDraft.id,
      clientId: localDraft.clientId,
      serverDiaryId: 77,
      conversationFinished: true,
      syncPending: false,
    });
    expect(published.conversation).toEqual(localDraft.conversation);
  });

  it('gives a legacy reopened draft a durable clientId before creating exactly one cloud record', async () => {
    const localDraft = draft({ id: 'legacy-local-draft', clientId: undefined, serverDiaryId: undefined });
    memoryStorage.set(CACHE_KEY, JSON.stringify([localDraft]));
    cloudGetDiariesMock.mockResolvedValue([]);
    cloudSyncDiaryMock.mockResolvedValue({ success: true, diaryId: 88 });
    cloudPublishDiaryMock.mockResolvedValue({ success: true, diaryId: 88 });

    await expect(syncDiaryEntryNow(localDraft.id, ROOM_ID)).resolves.toBe(true);
    expect(cloudSyncDiaryMock).toHaveBeenCalledTimes(1);
    const sentDraft = cloudSyncDiaryMock.mock.calls[0][0];
    expect(sentDraft.clientId).toEqual(expect.any(String));
    expect(sentDraft.clientId.length).toBeGreaterThan(0);

    const [published] = await getDiaryEntries(ROOM_ID);
    expect(published).toMatchObject({
      id: localDraft.id,
      clientId: sentDraft.clientId,
      serverDiaryId: 88,
      conversationFinished: true,
      syncPending: false,
    });
  });

  it('keeps the full local draft and exposes an exact authentication failure instead of waiting forever', async () => {
    const localDraft = draft({ serverDiaryId: undefined });
    memoryStorage.set(CACHE_KEY, JSON.stringify([localDraft]));
    cloudSyncDiaryMock.mockResolvedValue({
      success: false,
      errorCode: 'AUTH_REQUIRED',
      errorMessage: '登录状态已失效，请重新登录后再发布。',
    });

    await expect(syncDiaryEntryNow(localDraft.id, ROOM_ID)).resolves.toBe(false);
    expect(getLastDiaryPublishFailure(localDraft.id, ROOM_ID)).toEqual({
      code: 'AUTH_REQUIRED',
      message: '登录状态已失效，请重新登录后再发布。',
    });
    const [stillLocal] = await getDiaryEntries(ROOM_ID);
    expect(stillLocal).toMatchObject({
      id: localDraft.id,
      conversationFinished: true,
      syncPending: true,
      content: localDraft.content,
    });
    expect(stillLocal.conversation).toEqual(localDraft.conversation);
  });

  it('keeps the full local draft pending when the verified publish request times out', async () => {
    const localDraft = draft({ serverDiaryId: 77 });
    memoryStorage.set(CACHE_KEY, JSON.stringify([localDraft]));
    cloudSyncDiaryMock.mockResolvedValue({
      success: false,
      errorCode: 'TIMEOUT',
      errorMessage: '连接家庭云端超时，请检查网络后重试。',
    });

    await expect(syncDiaryEntryNow(localDraft.id, ROOM_ID)).resolves.toBe(false);
    expect(getLastDiaryPublishFailure(localDraft.id, ROOM_ID)).toEqual({
      code: 'TIMEOUT',
      message: '连接家庭云端超时，请检查网络后重试。',
    });
    expect(cloudPublishDiaryMock).not.toHaveBeenCalled();
    const [stillLocal] = await getDiaryEntries(ROOM_ID);
    expect(stillLocal).toMatchObject({
      id: localDraft.id,
      serverDiaryId: 77,
      conversationFinished: true,
      syncPending: true,
    });
    expect(stillLocal.conversation).toEqual(localDraft.conversation);
  });

  it('uses a legacy cloud_ local id as the same positive server id for publish and delete', async () => {
    const restored = draft({ id: 'cloud_128', serverDiaryId: undefined });
    memoryStorage.set(CACHE_KEY, JSON.stringify([restored]));
    cloudSyncDiaryMock.mockResolvedValue({ success: true, diaryId: 128 });

    await expect(syncDiaryEntryNow(restored.id, ROOM_ID)).resolves.toBe(true);
    expect(cloudSyncDiaryMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'cloud_128', conversationFinished: true }),
      128,
      ROOM_ID,
    );

    memoryStorage.set(CACHE_KEY, JSON.stringify([{
      ...restored,
      conversationFinished: true,
      syncPending: false,
    }]));
    cloudDeleteDiaryMock.mockResolvedValue({ success: true });
    await expect(deleteDiaryEntry('cloud_128', ROOM_ID)).resolves.toBeUndefined();
    expect(cloudDeleteDiaryMock).toHaveBeenCalledWith(128, Number(ROOM_ID));
    await expect(getDiaryEntries(ROOM_ID)).resolves.toEqual([]);
  });

  it('merges a restarted local draft and its cloud copy by clientId without creating a duplicate card', async () => {
    const localDraft = draft({ serverDiaryId: undefined, conversationFinished: false });
    const fullConversation = localDraft.conversation ?? [];
    memoryStorage.set(CACHE_KEY, JSON.stringify([localDraft]));

    const merged = await mergeCloudDiariesIntoLocal([{
      id: 99,
      roomId: Number(ROOM_ID),
      authorUserId: 42,
      clientId: localDraft.clientId,
      date: localDraft.date,
      content: localDraft.content,
      moodEmoji: localDraft.moodEmoji,
      conversation: fullConversation.slice(0, 2),
      conversationFinished: false,
      localTimeStr: localDraft.localTimeStr,
      createdAt: localDraft.createdAt,
      updatedAt: localDraft.updatedAt,
    }], ROOM_ID);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      id: localDraft.id,
      serverDiaryId: 99,
      clientId: localDraft.clientId,
    });
    expect(merged[0].conversation).toEqual(fullConversation);
  });
});
