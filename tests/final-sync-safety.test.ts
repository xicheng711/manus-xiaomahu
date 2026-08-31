import { beforeEach, describe, expect, it, vi } from 'vitest';

const memoryStorage = vi.hoisted(() => new Map<string, string>());

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
  cacheAnnouncementComments,
  getCachedAnnouncementComments,
  mergeCloudAnnouncementsIntoLocal,
  mergeCloudBriefingsIntoLocal,
  mergeCloudMedicationsIntoLocal,
  removeCachedAnnouncementComments,
} from '../lib/storage';

const ROOM_ID = '321';

describe('final family-scoped cache safety', () => {
  beforeEach(() => memoryStorage.clear());

  it('keeps an offline pending announcement when the server successfully returns an empty list', async () => {
    memoryStorage.set(`family_announcements_v1:${ROOM_ID}`, JSON.stringify([{
      id: 'local-ann-1',
      syncPending: true,
      authorId: '8',
      authorName: '小明',
      authorEmoji: '👩',
      authorColor: '#888',
      content: '明天复诊',
      type: 'medical',
      date: '2026-08-31',
      localTimeStr: '21:05',
      createdAt: '2026-08-31T13:05:00.000Z',
      reactions: [],
    }]));

    const merged = await mergeCloudAnnouncementsIntoLocal([], ROOM_ID);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('local-ann-1');
    expect(merged[0].syncPending).toBe(true);
  });

  it('matches a cloud announcement by clientId and keeps the stable local id', async () => {
    memoryStorage.set(`family_announcements_v1:${ROOM_ID}`, JSON.stringify([{
      id: 'local-ann-2',
      syncPending: true,
      authorId: '8',
      authorName: '小明',
      authorEmoji: '👩',
      authorColor: '#888',
      content: '已到医院',
      type: 'medical',
      date: '2026-08-31',
      localTimeStr: '09:15',
      createdAt: '2026-08-31T01:15:00.000Z',
      reactions: [],
    }]));

    const merged = await mergeCloudAnnouncementsIntoLocal([{
      id: 44,
      clientId: 'local-ann-2',
      authorId: '8',
      authorUserId: 99,
      authorName: '小明',
      authorEmoji: '👩',
      authorColor: '#888',
      content: '已到医院',
      type: 'medical',
      date: '2026-08-31',
      localTimeStr: '09:15',
      createdAt: '2026-08-31T01:15:00.000Z',
      reactions: [],
    }], ROOM_ID);

    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('local-ann-2');
    expect(merged[0].serverAnnouncementId).toBe(44);
    expect(merged[0].syncPending).toBe(false);
    expect(merged[0].authorId).toBe('8');
  });

  it('isolates cached announcement comments by both family and announcement while preserving author-local time', async () => {
    await cacheAnnouncementComments(ROOM_ID, 44, [{
      id: 501,
      announcementId: 44,
      clientId: 'comment-a',
      authorUserId: 99,
      authorName: '纽约家人',
      authorEmoji: '👩',
      content: '明天我来陪诊',
      date: '2026-08-31',
      localTimeStr: '21:18',
      createdAt: new Date('2026-09-01T01:18:00.000Z'),
      canDelete: true,
    }]);
    await cacheAnnouncementComments(ROOM_ID, 45, [{
      id: 502,
      announcementId: 45,
      clientId: 'comment-b',
      authorUserId: 100,
      authorName: '北京家人',
      authorEmoji: '👨',
      content: '已经取药',
      date: '2026-09-01',
      localTimeStr: '09:20',
      createdAt: '2026-09-01T01:20:00.000Z',
    }]);

    const firstAnnouncement = await getCachedAnnouncementComments(ROOM_ID, 44);
    expect(firstAnnouncement).toHaveLength(1);
    expect(firstAnnouncement[0].content).toBe('明天我来陪诊');
    expect(firstAnnouncement[0].date).toBe('2026-08-31');
    expect(firstAnnouncement[0].localTimeStr).toBe('21:18');
    expect(firstAnnouncement[0].createdAt).toBe('2026-09-01T01:18:00.000Z');
    expect(await getCachedAnnouncementComments('999', 44)).toEqual([]);

    await removeCachedAnnouncementComments(ROOM_ID, 44);
    expect(await getCachedAnnouncementComments(ROOM_ID, 44)).toEqual([]);
    expect(await getCachedAnnouncementComments(ROOM_ID, 45)).toHaveLength(1);
  });

  it('does not let a stale medication read overwrite a pending local dose change', async () => {
    memoryStorage.set(`medications:${ROOM_ID}`, JSON.stringify([{
      id: 'client-med-1',
      serverMedId: 12,
      name: '药物A',
      dosage: '10mg',
      frequency: '每天一次',
      times: ['08:00'],
      notes: '医生刚调整',
      icon: '💊',
      active: true,
      reminderEnabled: false,
      syncPending: true,
      pendingChanges: [{ eventId: 'event-1', changeType: 'updated', reason: '医嘱', changedAt: '2026-08-31T00:00:00.000Z' }],
    }]));

    const merged = await mergeCloudMedicationsIntoLocal([{
      id: 12,
      clientId: 'client-med-1',
      name: '药物A',
      dosage: '5mg',
      frequency: '每天一次',
      times: ['08:00'],
      notes: '旧数据',
      active: true,
      reminderEnabled: false,
    }], ROOM_ID);

    expect(merged[0].dosage).toBe('10mg');
    expect(merged[0].notes).toBe('医生刚调整');
    expect(merged[0].syncPending).toBe(true);
    expect(merged[0].pendingChanges?.[0]?.eventId).toBe('event-1');
  });

  it('does not let a stale cloud briefing overwrite a pending local briefing for the same date', async () => {
    memoryStorage.set(`care_briefings_v1:${ROOM_ID}`, JSON.stringify([{
      date: '2026-08-31',
      careScore: 93,
      summary: '刚刚离线生成的新简报',
      encouragement: '新的鼓励',
      generatedAt: '2026-08-31T13:00:00.000Z',
      checkInDate: '2026-08-31',
      syncPending: true,
    }]));

    const merged = await mergeCloudBriefingsIntoLocal([{
      date: '2026-08-31',
      careScore: 70,
      summary: '服务器旧简报',
      encouragement: '旧的鼓励',
      generatedAt: '2026-08-31T12:00:00.000Z',
      checkInDate: '2026-08-31',
    }], ROOM_ID);

    expect(merged[0].summary).toBe('刚刚离线生成的新简报');
    expect(merged[0].syncPending).toBe(true);
  });

  it('keeps a local briefing outside the cloud page while updating matching cloud dates', async () => {
    memoryStorage.set(`care_briefings_v1:${ROOM_ID}`, JSON.stringify([{
      date: '2026-08-20',
      careScore: 88,
      summary: '较早的本地简报',
      encouragement: '辛苦了',
      generatedAt: '2026-08-20T12:00:00.000Z',
      checkInDate: '2026-08-20',
    }]));

    const merged = await mergeCloudBriefingsIntoLocal([{
      date: '2026-08-31',
      careScore: 90,
      summary: '最新云端简报',
      encouragement: '继续加油',
      generatedAt: '2026-08-31T12:00:00.000Z',
      checkInDate: '2026-08-31',
    }], ROOM_ID);

    expect(merged.map(item => item.date)).toEqual(['2026-08-31', '2026-08-20']);
  });
});
