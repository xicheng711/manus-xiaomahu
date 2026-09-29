/**
 * 公告"待同步"自动重试：
 * 之前重试只发生在家人页 loadData 里——离线发的公告、之后没再进家人页，
 * 就会一直卡在"待同步"。现在：
 * 1. lib/storage.ts 新增 syncAllPendingAnnouncements()：遍历所有家庭重试
 * 2. app/_layout.tsx 新增 PendingSyncForegroundRetry：app 回到前台就触发
 * 3. app/(tabs)/index.tsx 首页 loadData 也顺手重试当前家庭（和打卡一样）
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

const root = resolve(__dirname, '..');
const readSrc = (path: string) => readFileSync(resolve(root, path), 'utf8');

const MEMBERSHIPS_KEY = 'family_memberships_v1';
const annKey = (roomId: string) => `family_announcements_v1:${roomId}`;

const pendingAnn = (id: string) => ({
  id,
  authorId: 'm1',
  authorName: '阿华',
  content: 'hello',
  emoji: '📣',
  type: 'daily',
  createdAt: new Date().toISOString(),
  date: '2026-09-29',
  localTimeStr: '00:26',
  syncPending: true,
});

function seedMemberships(roomIds: string[]) {
  memoryStorage.set(
    MEMBERSHIPS_KEY,
    JSON.stringify(roomIds.map(familyId => ({ familyId, role: 'creator' }))),
  );
}

function readAnns(roomId: string): any[] {
  const raw = memoryStorage.get(annKey(roomId)) ?? '[]';
  const parsed: unknown = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

describe('syncAllPendingAnnouncements', () => {
  beforeEach(() => {
    memoryStorage.clear();
    cloudPostAnnouncementMock.mockReset();
    cloudPostAnnouncementMock.mockImplementation(async () => ({
      success: true,
      announcement: { id: 9001 },
    }));
  });

  it('把所有家庭的待同步公告都发出去', async () => {
    const { syncAllPendingAnnouncements } = await import('../lib/storage');
    seedMemberships(['42', '43']);
    memoryStorage.set(annKey('42'), JSON.stringify([pendingAnn('a-1')]));
    memoryStorage.set(annKey('43'), JSON.stringify([pendingAnn('b-1')]));

    await syncAllPendingAnnouncements();

    expect(readAnns('42')[0].syncPending).toBe(false);
    expect(readAnns('43')[0].syncPending).toBe(false);
    expect(cloudPostAnnouncementMock).toHaveBeenCalledTimes(2);
    // clientId 幂等：传的是本地 id，服务端按 (roomId, clientId) 去重
    const clientIds = cloudPostAnnouncementMock.mock.calls.map(c => (c[0] as any).clientId).sort();
    expect(clientIds).toEqual(['a-1', 'b-1']);
  });

  it('没有待同步的家庭不触发网络请求', async () => {
    const { syncAllPendingAnnouncements } = await import('../lib/storage');
    seedMemberships(['42', '43']);
    memoryStorage.set(annKey('42'), JSON.stringify([{ ...pendingAnn('a-1'), syncPending: false }]));
    // 43 连公告列表都没有

    await syncAllPendingAnnouncements();

    expect(cloudPostAnnouncementMock).not.toHaveBeenCalled();
  });

  it('一个家庭失败不影响其他家庭', async () => {
    const { syncAllPendingAnnouncements } = await import('../lib/storage');
    seedMemberships(['42', '43']);
    memoryStorage.set(annKey('42'), JSON.stringify([pendingAnn('a-1')]));
    memoryStorage.set(annKey('43'), JSON.stringify([pendingAnn('b-1')]));
    cloudPostAnnouncementMock.mockImplementationOnce(async () => ({ success: false }));

    await syncAllPendingAnnouncements();

    // 42 失败保留待同步，43 仍成功发出
    expect(readAnns('42')[0].syncPending).toBe(true);
    expect(readAnns('43')[0].syncPending).toBe(false);
  });

  it('没有家庭时直接返回，不抛错', async () => {
    const { syncAllPendingAnnouncements } = await import('../lib/storage');
    seedMemberships([]);
    await expect(syncAllPendingAnnouncements()).resolves.toBeUndefined();
    expect(cloudPostAnnouncementMock).not.toHaveBeenCalled();
  });
});

describe('自动重试触发点（源码断言）', () => {
  it('_layout.tsx 回到前台时触发全家庭重试', () => {
    const src = readSrc('app/_layout.tsx');
    expect(src).toContain('function PendingSyncForegroundRetry()');
    expect(src).toContain('syncAllPendingAnnouncements');
    expect(src).toContain("<PendingSyncForegroundRetry />");
    // 只在回到前台时跑，且有并发守卫
    expect(src).toContain("AppState.addEventListener('change'");
    expect(src).toContain("state !== 'active'");
  });

  it('首页 loadData 顺手重试当前家庭的待同步公告', () => {
    const src = readSrc('app/(tabs)/index.tsx');
    expect(src).toContain('syncPendingAnnouncements(requestedFamilyId)');
  });
});
