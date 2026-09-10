import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const memoryStorage = vi.hoisted(() => new Map<string, string>());
const cloudSyncCheckInMock = vi.hoisted(() => vi.fn<
  (checkIn: any, explicitRoomId?: string | number | null) => Promise<any>
>(async checkIn => ({
  success: true,
  checkIn: { id: 501, clientId: checkIn.clientId },
})));

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
  cloudSyncCheckIn: cloudSyncCheckInMock,
  cloudSyncDiary: vi.fn(),
  cloudGetDiaries: vi.fn(),
  cloudDeleteDiary: vi.fn(),
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
  getCloudSyncState: vi.fn(),
}));

import {
  getAllCheckIns,
  getStableCheckInClientId,
  mergeCloudCheckInsIntoLocal,
  upsertCheckIn,
} from '../lib/storage';
import { resolveCheckInSyncIdentity } from '../server/checkin-sync-identity';

const ROOT = path.resolve(import.meta.dirname, '..');
const ROOM_ID = 'stable-room';

function serverRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 501,
    roomId: 7,
    authorUserId: 10,
    clientId: 'checkin_local_abc',
    date: '2026-09-09',
    morningDone: true,
    eveningDone: false,
    completedAt: '2026-09-09T12:00:00.000Z',
    ...overrides,
  };
}

describe('每日打卡稳定记录身份', () => {
  beforeEach(() => {
    memoryStorage.clear();
    cloudSyncCheckInMock.mockReset();
    cloudSyncCheckInMock.mockImplementation(async checkIn => ({
      success: true,
      checkIn: { id: 501, clientId: checkIn.clientId },
    }));
  });

  it('同一护理日的早间和晚间保存复用同一 local id 与 clientId', async () => {
    const morning = await upsertCheckIn({
      date: '2026-09-09',
      morningDone: true,
      morningNotes: '早间记录',
    }, ROOM_ID);
    const evening = await upsertCheckIn({
      date: '2026-09-09',
      eveningDone: true,
      eveningNotes: '晚间记录',
    }, ROOM_ID);

    expect(morning.clientId).toMatch(/^checkin_local_/);
    expect(evening.id).toBe(morning.id);
    expect(evening.clientId).toBe(morning.clientId);
    expect(evening.morningDone).toBe(true);
    expect(evening.eveningDone).toBe(true);

    await vi.waitFor(() => expect(cloudSyncCheckInMock).toHaveBeenCalledTimes(2));
    expect(cloudSyncCheckInMock.mock.calls[0][0].clientId).toBe(morning.clientId);
    expect(cloudSyncCheckInMock.mock.calls[1][0].clientId).toBe(morning.clientId);
  });

  it('旧本地记录会获得稳定兼容 clientId，而不是每次读取随机变化', async () => {
    memoryStorage.set(`daily_checkins_v2:${ROOM_ID}`, JSON.stringify([{
      id: 'legacy-local-id',
      date: '2026-09-08',
      morningDone: true,
      eveningDone: false,
    }]));

    const first = (await getAllCheckIns(ROOM_ID))[0];
    const second = (await getAllCheckIns(ROOM_ID))[0];
    expect(first.clientId).toBe('checkin_local_legacy-local-id');
    expect(second.clientId).toBe(first.clientId);
    expect(getStableCheckInClientId(second)).toBe(first.clientId);
  });

  it('云端返回同一 clientId 时保留本地 key，并回填 serverCheckInId', async () => {
    const local = await upsertCheckIn({
      date: '2026-09-09',
      morningDone: true,
    }, ROOM_ID);
    const merged = await mergeCloudCheckInsIntoLocal([
      serverRow({ clientId: local.clientId }),
    ], ROOM_ID);

    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe(local.id);
    expect(merged[0].clientId).toBe(local.clientId);
    expect(merged[0].serverCheckInId).toBe(501);
  });

  it('服务端身份解析优先 clientId，并拒绝跨家庭 server ID', () => {
    const clientMatch = serverRow();
    const wrongRoomServerMatch = serverRow({ id: 999, roomId: 99 });
    const dateMatch = serverRow({ id: 502, clientId: null });

    expect(resolveCheckInSyncIdentity({
      roomId: 7,
      clientId: 'checkin_local_abc',
      requestedServerCheckInId: 999,
      expectedDate: '2026-09-09',
      clientMatch,
      requestedMatch: wrongRoomServerMatch,
      dateMatch,
    })?.id).toBe(501);

    expect(resolveCheckInSyncIdentity({
      roomId: 7,
      clientId: 'checkin_local_new-device',
      requestedServerCheckInId: 999,
      expectedDate: '2026-09-09',
      clientMatch: null,
      requestedMatch: wrongRoomServerMatch,
      dateMatch,
    })?.id).toBe(502);

    const staleSameRoomServerMatch = serverRow({
      id: 503,
      clientId: 'checkin_local_other-day',
      date: '2026-09-08',
    });
    expect(resolveCheckInSyncIdentity({
      roomId: 7,
      clientId: 'checkin_local_new-device',
      requestedServerCheckInId: 503,
      expectedDate: '2026-09-09',
      clientMatch: null,
      requestedMatch: staleSameRoomServerMatch,
      dateMatch,
    })?.id).toBe(502);
  });

  it('数据库、客户端 payload 与表单目标均持久化稳定身份', () => {
    const schema = fs.readFileSync(path.join(ROOT, 'drizzle/schema.ts'), 'utf8');
    const db = fs.readFileSync(path.join(ROOT, 'server/db.ts'), 'utf8');
    const router = fs.readFileSync(path.join(ROOT, 'server/family-router.ts'), 'utf8');
    const cloud = fs.readFileSync(path.join(ROOT, 'lib/cloud-sync.ts'), 'utf8');
    const page = fs.readFileSync(path.join(ROOT, 'app/(tabs)/checkin.tsx'), 'utf8');

    expect(schema).toContain('clientId: varchar("clientId", { length: 100 })');
    expect(schema).toContain('uniqueIndex("uq_check_ins_room_client").on(table.roomId, table.clientId)');
    expect(db).toContain("column: 'clientId'");
    expect(router).toContain('resolveCheckInSyncIdentity({');
    expect(cloud).toContain('clientId: checkIn.clientId');
    expect(cloud).toContain('serverCheckInId: Number.isFinite');
    expect(page).toContain('clientId: formTarget.clientId');
    expect(page).toContain('serverCheckInId: formTarget.serverCheckInId');
  });
});

describe('公告评论导航可见性', () => {
  it('公告卡片在折叠和展开时都显示评论数量，但不预览最新评论正文', () => {
    const familyPage = fs.readFileSync(path.join(ROOT, 'app/(tabs)/family.tsx'), 'utf8');
    expect(familyPage).toContain('`${commentCount} 条评论${commentsOpen ? \' · 收起\' : \'\'}`');
    expect(familyPage).toContain('commentsOpen && roomId && announcementId ? (');
    expect(familyPage).not.toContain('commentPreview');
    expect(familyPage).not.toContain('latestComment');
  });
});
