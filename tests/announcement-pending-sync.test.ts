import { beforeEach, describe, expect, it, vi } from 'vitest';

const memoryStorage = vi.hoisted(() => new Map<string, string>());
const cloudPostAnnouncementMock = vi.hoisted(() =>
  vi.fn<(params: any) => Promise<any>>(async () => ({ success: true, announcement: { id: 9001 } })),
);

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => memoryStorage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      memoryStorage.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      memoryStorage.delete(key);
    }),
    multiGet: vi.fn(async () => []),
    multiSet: vi.fn(async () => undefined),
    getAllKeys: vi.fn(async () => [...memoryStorage.keys()]),
  },
}));

vi.mock('../lib/cloud-sync', () => ({
  cloudSyncCheckIn: vi.fn(),
  cloudSyncDiary: vi.fn(),
  cloudGetDiaries: vi.fn(),
  cloudDeleteDiary: vi.fn(),
  cloudSyncMedication: vi.fn(),
  cloudDeleteMedication: vi.fn(),
  cloudPostAnnouncement: cloudPostAnnouncementMock,
  cloudSaveBriefing: vi.fn(),
  cloudCreateRoom: vi.fn(),
  cloudJoinRoom: vi.fn(),
  cloudGetRoomDetail: vi.fn(),
  cloudLookupRoom: vi.fn(),
  cloudUpdateElderProfile: vi.fn(),
  cloudUpdateMemberProfile: vi.fn(),
  setCloudSyncState: vi.fn(),
  getCloudSyncState: vi.fn(async () => null),
}));

const ROOM_ID = '42';
const ANN_KEY = `family_announcements_v1:${ROOM_ID}`;

function seed(list: any[]) {
  memoryStorage.set(ANN_KEY, JSON.stringify(list));
}

function read(): any[] {
  const raw = memoryStorage.get(ANN_KEY) ?? '[]';
  const parsed: unknown = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

const base = (over: Record<string, any> = {}) => ({
  id: 'local-1',
  authorId: 'm1',
  authorName: '阿华',
  authorEmoji: '🐵',
  authorColor: '#f00',
  content: 'hello',
  type: 'daily',
  createdAt: new Date().toISOString(),
  date: '2026-09-29',
  localTimeStr: '00:26',
  ...over,
});

describe('syncPendingAnnouncements retry contract', () => {
  beforeEach(() => {
    memoryStorage.clear();
    cloudPostAnnouncementMock.mockReset();
    cloudPostAnnouncementMock.mockImplementation(async () => ({
      success: true,
      announcement: { id: 9001 },
    }));
  });

  it('clears syncPending and records server id when the post succeeds', async () => {
    const { syncPendingAnnouncements } = await import('../lib/storage');
    seed([base({ syncPending: true })]);
    await syncPendingAnnouncements(ROOM_ID);
    const [ann] = read();
    expect(ann.syncPending).toBe(false);
    expect(ann.serverAnnouncementId).toBe(9001);
    expect(cloudPostAnnouncementMock).toHaveBeenCalledTimes(1);
    expect(cloudPostAnnouncementMock.mock.calls[0][0]).toMatchObject({
      clientId: 'local-1',
      roomId: 42,
    });
  });

  it('keeps syncPending when the post fails so a later retry can pick it up', async () => {
    const { syncPendingAnnouncements } = await import('../lib/storage');
    cloudPostAnnouncementMock.mockImplementation(async () => null);
    seed([base({ syncPending: true })]);
    await syncPendingAnnouncements(ROOM_ID);
    const [ann] = read();
    expect(ann.syncPending).toBe(true);
    expect(ann.serverAnnouncementId).toBeUndefined();
  });

  it('leaves already-synced announcements alone', async () => {
    const { syncPendingAnnouncements } = await import('../lib/storage');
    seed([base({ syncPending: false, serverAnnouncementId: 7 })]);
    await syncPendingAnnouncements(ROOM_ID);
    expect(cloudPostAnnouncementMock).not.toHaveBeenCalled();
    const [ann] = read();
    expect(ann.syncPending).toBe(false);
    expect(ann.serverAnnouncementId).toBe(7);
  });

  it('a later successful retry clears a previously failed pending announcement', async () => {
    const { syncPendingAnnouncements } = await import('../lib/storage');
    cloudPostAnnouncementMock.mockImplementationOnce(async () => null);
    seed([base({ syncPending: true })]);
    await syncPendingAnnouncements(ROOM_ID);
    expect(read()[0].syncPending).toBe(true);
    await syncPendingAnnouncements(ROOM_ID);
    expect(read()[0].syncPending).toBe(false);
  });
});
