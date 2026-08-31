import { beforeEach, describe, expect, it, vi } from 'vitest';

const memoryStorage = vi.hoisted(() => new Map<string, string>());

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
  cloudSyncCheckIn: vi.fn(async () => ({ success: true })),
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
  mergeCloudCheckInsIntoLocal,
  type DailyCheckIn,
} from '../lib/storage';

const ROOM_ID = '123';
const CACHE_KEY = `daily_checkins_v2:${ROOM_ID}`;

function checkIn(overrides: Partial<DailyCheckIn> = {}): DailyCheckIn {
  return {
    id: 'local-1',
    date: '2026-08-28',
    sleepHours: 8,
    sleepQuality: 'good',
    morningNotes: '',
    morningDone: true,
    moodEmoji: '😊',
    moodScore: 9,
    medicationTaken: true,
    medicationNotes: '',
    mealNotes: '正常进食',
    eveningNotes: '晚上状态稳定',
    eveningDone: true,
    aiMessage: '',
    careScore: 90,
    completedAt: '2026-08-28T23:00:00.000Z',
    daytimeNap: true,
    napMinutes: 60,
    ...overrides,
  };
}

describe('跨日小睡持久化', () => {
  beforeEach(() => memoryStorage.clear());

  it('登录恢复遇到缺少小睡字段的旧云端行时保留本地小睡', async () => {
    memoryStorage.set(CACHE_KEY, JSON.stringify([checkIn()]));

    await mergeCloudCheckInsIntoLocal([
      {
        id: 77,
        date: '2026-08-28',
        sleepHours: 8,
        sleepQuality: 'good',
        morningDone: true,
        eveningDone: true,
        moodEmoji: '😊',
        moodScore: 9,
        mealNotes: '正常进食',
        eveningNotes: '晚上状态稳定',
        completedAt: '2026-08-28T23:00:00.000Z',
        // 模拟旧服务器响应：没有 daytimeNap / napMinutes / napDuration。
      },
    ], ROOM_ID);

    const reopened = await getAllCheckIns(ROOM_ID);
    expect(reopened[0].napMinutes).toBe(60);
    expect(reopened[0].daytimeNap).toBe(true);
    expect(reopened[0].eveningDone).toBe(true);
  });

  it('服务器明确保存零分钟时显示没有小睡，而不是恢复旧时长', async () => {
    memoryStorage.set(CACHE_KEY, JSON.stringify([checkIn()]));

    const merged = await mergeCloudCheckInsIntoLocal([
      {
        ...checkIn({ id: 'cloud-1' }),
        id: 78,
        daytimeNap: false,
        napMinutes: 0,
      },
    ], ROOM_ID);

    expect(merged[0].napMinutes).toBe(0);
    expect(merged[0].daytimeNap).toBe(false);
  });

  it('本地仍待同步时不允许较旧云端快照覆盖刚保存的小睡', async () => {
    memoryStorage.set(CACHE_KEY, JSON.stringify([
      checkIn({ napMinutes: 90, daytimeNap: true, syncPending: true }),
    ]));

    const merged = await mergeCloudCheckInsIntoLocal([
      {
        ...checkIn({ id: 'cloud-2' }),
        id: 79,
        napMinutes: 0,
        daytimeNap: false,
      },
    ], ROOM_ID);

    expect(merged[0].napMinutes).toBe(90);
    expect(merged[0].daytimeNap).toBe(true);
    expect(merged[0].syncPending).toBe(true);
  });

  it('云端分页没有返回的更早历史不会从图表缓存中被删除', async () => {
    const older = checkIn({ id: 'older', date: '2026-08-20', napMinutes: 30 });
    memoryStorage.set(CACHE_KEY, JSON.stringify([checkIn(), older]));

    const merged = await mergeCloudCheckInsIntoLocal([
      { ...checkIn(), id: 80 },
    ], ROOM_ID);

    expect(merged.map(item => item.date)).toContain('2026-08-20');
    expect(merged.find(item => item.date === '2026-08-20')?.napMinutes).toBe(30);
  });
});
