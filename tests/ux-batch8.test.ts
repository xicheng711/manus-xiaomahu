/**
 * UX batch8: 打卡问题三件套
 * 1. 智能提醒：只在"没打卡且时间没过"时安排今日一次性提醒，打完即取消
 * 2. 家人页自动刷新：可见时每 60 秒静默拉云端
 * 3. 漏打卡可见：简报时间线里过去的日子明确标"未打卡"，照顾者可一键补
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ── Mocks ──────────────────────────────────────────────────────────
const scheduled: Array<{ id: string; content: any; trigger: any }> = [];
const cancelledIds: string[] = [];
const store = new Map<string, string>();
let mockCheckIn: any = null;
let mockProfile: any = null;

vi.mock('expo-notifications', () => ({
  setNotificationHandler: vi.fn(),
  getPermissionsAsync: vi.fn(async () => ({ status: 'granted' })),
  cancelScheduledNotificationAsync: vi.fn(async (id: string) => {
    cancelledIds.push(id);
  }),
  scheduleNotificationAsync: vi.fn(async (req: any) => {
    const id = `mock-${scheduled.length}`;
    scheduled.push({ id, content: req.content, trigger: req.trigger });
    return id;
  }),
  getAllScheduledNotificationsAsync: vi.fn(async () => []),
  SchedulableTriggerInputTypes: { DATE: 'date', DAILY: 'daily' },
  AndroidImportance: { HIGH: 'high' },
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getAllKeys: vi.fn(async () => Array.from(store.keys())),
    getItem: vi.fn(async (k: string) => (store.has(k) ? store.get(k)! : null)),
    setItem: vi.fn(async (k: string, v: string) => { store.set(k, v); }),
    removeItem: vi.fn(async (k: string) => { store.delete(k); }),
    multiRemove: vi.fn(async (ks: string[]) => { ks.forEach(k => store.delete(k)); }),
  },
}));

vi.mock('../lib/storage', () => ({
  getCurrentUserIsCreator: vi.fn(async () => true),
  getFamilyProfile: vi.fn(async () => mockProfile),
  getCheckInByDate: vi.fn(async () => mockCheckIn),
}));

vi.mock('../lib/shared-date-range', () => ({
  getCareDayKey: vi.fn(() => '2026-09-26'),
}));

vi.mock('expo-constants', () => ({ default: {} }));
vi.mock('../lib/cloud-sync', () => ({
  cloudUpdatePushToken: vi.fn(async () => {}),
}));

import {
  smartTodayKey,
  parseReminderTime,
  ensureTodayReminders,
  cancelTodayReminder,
} from '../lib/notifications';
import * as Notifications from 'expo-notifications';

const repo = path.resolve(__dirname, '..');
const notifSrc = fs.readFileSync(path.join(repo, 'lib/notifications.ts'), 'utf8');
const familySrc = fs.readFileSync(path.join(repo, 'app/(tabs)/family.tsx'), 'utf8');
const checkinSrc = fs.readFileSync(path.join(repo, 'app/(tabs)/checkin.tsx'), 'utf8');

beforeEach(() => {
  scheduled.length = 0;
  cancelledIds.length = 0;
  store.clear();
  mockCheckIn = null;
  mockProfile = null;
  vi.useRealTimers();
});

describe('ux-batch8.1: 智能提醒时间解析', () => {
  it('正常时间解析', () => {
    expect(parseReminderTime('08:00', 8)).toEqual({ hour: 8, minute: 0 });
    expect(parseReminderTime('21:30', 21)).toEqual({ hour: 21, minute: 30 });
  });

  it("'off' 返回 null（不提醒）", () => {
    expect(parseReminderTime('off', 8)).toBeNull();
  });

  it('非法时间回退到默认值', () => {
    expect(parseReminderTime('abc', 8)).toEqual({ hour: 8, minute: 0 });
    expect(parseReminderTime('25:00', 8)).toEqual({ hour: 8, minute: 0 });
    expect(parseReminderTime(undefined, 21)).toEqual({ hour: 21, minute: 0 });
  });

  it('smartTodayKey 是今日日期格式', () => {
    expect(smartTodayKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('ux-batch8.1: 智能提醒行为', () => {
  it('都没打卡、时间没过：早晚都安排', async () => {
    vi.setSystemTime(new Date(2026, 8, 26, 7, 0, 0)); // 07:00
    mockProfile = { reminderMorning: '08:00', reminderEvening: '21:00' };
    mockCheckIn = { morningDone: false, eveningDone: false };
    await ensureTodayReminders('奶奶', '1');
    expect(scheduled.length).toBe(2);
    // 都是今日一次性 DATE 触发
    for (const s of scheduled) {
      expect(s.trigger.type).toBe('date');
      expect(s.trigger.date).toBeInstanceOf(Date);
    }
    const titles = scheduled.map(s => s.content.title);
    expect(titles.some(t => t.includes('早安') || t.includes('早上好') || t.includes('晨间'))).toBe(true);
    expect(titles.some(t => t.includes('辛苦') || t.includes('晚安') || t.includes('小结'))).toBe(true);
  });

  it('早间已打卡：只安排晚间', async () => {
    vi.setSystemTime(new Date(2026, 8, 26, 7, 0, 0));
    mockProfile = { reminderMorning: '08:00', reminderEvening: '21:00' };
    mockCheckIn = { morningDone: true, eveningDone: false };
    await ensureTodayReminders('奶奶', '1');
    expect(scheduled.length).toBe(1);
    expect(scheduled[0].trigger.date.getHours()).toBe(21);
  });

  it('都打完了：一个都不安排', async () => {
    vi.setSystemTime(new Date(2026, 8, 26, 7, 0, 0));
    mockProfile = { reminderMorning: '08:00', reminderEvening: '21:00' };
    mockCheckIn = { morningDone: true, eveningDone: true };
    await ensureTodayReminders('奶奶', '1');
    expect(scheduled.length).toBe(0);
  });

  it('提醒时间已过：不安排（避免打开 app 瞬间弹通知）', async () => {
    vi.setSystemTime(new Date(2026, 8, 26, 9, 0, 0)); // 09:00，早间 08:00 已过
    mockProfile = { reminderMorning: '08:00', reminderEvening: '21:00' };
    mockCheckIn = { morningDone: false, eveningDone: false };
    await ensureTodayReminders('奶奶', '1');
    expect(scheduled.length).toBe(1); // 只有晚间
    expect(scheduled[0].trigger.date.getHours()).toBe(21);
  });

  it("设为 'off' 的不安排", async () => {
    vi.setSystemTime(new Date(2026, 8, 26, 7, 0, 0));
    mockProfile = { reminderMorning: 'off', reminderEvening: '21:00' };
    mockCheckIn = { morningDone: false, eveningDone: false };
    await ensureTodayReminders('奶奶', '1');
    expect(scheduled.length).toBe(1);
  });

  it('打卡完成后取消该时段未响的提醒', async () => {
    vi.setSystemTime(new Date(2026, 8, 26, 7, 0, 0));
    mockProfile = { reminderMorning: '08:00', reminderEvening: '21:00' };
    mockCheckIn = { morningDone: false, eveningDone: false };
    await ensureTodayReminders('奶奶', '1');
    expect(scheduled.length).toBe(2);
    const morningId = scheduled.find(s => s.trigger.date.getHours() === 8)!.id;

    await cancelTodayReminder('morning');
    expect(cancelledIds).toContain(morningId);
    // 晚间的不受影响
    expect(cancelledIds.length).toBe(1);
  });

  it('重复调用 ensure 不会重复安排', async () => {
    vi.setSystemTime(new Date(2026, 8, 26, 7, 0, 0));
    mockProfile = { reminderMorning: '08:00', reminderEvening: '21:00' };
    mockCheckIn = { morningDone: false, eveningDone: false };
    await ensureTodayReminders('奶奶', '1');
    await ensureTodayReminders('奶奶', '1');
    expect(scheduled.length).toBe(2);
  });
});

describe('ux-batch8.1: 打卡页 hook', () => {
  it('打卡保存成功后取消该时段提醒', () => {
    expect(checkinSrc).toContain("cancelTodayReminder(mode === 'morning' ? 'morning' : 'evening')");
  });

  it('打卡页聚焦时重新评估今日提醒', () => {
    expect(checkinSrc).toContain('ensureTodayReminders(elderNickname, requestedFamilyId)');
  });
});

describe('ux-batch8.2: 家人页自动刷新', () => {
  it('可见时每 60 秒静默拉取云端', () => {
    expect(familySrc).toMatch(/setInterval\(\(\) => \{[\s\S]*?loadData\(true\)[\s\S]*?\}, 60_000\)/);
  });

  it('只在 App 前台时刷新', () => {
    expect(familySrc).toContain("AppState.currentState === 'active'");
  });

  it('失焦时清理定时器', () => {
    expect(familySrc).toMatch(/return \(\) => clearInterval\(timer\)/);
  });
});

describe('ux-batch8.3: 漏打卡可见', () => {
  it('过去的日子明确显示"未打卡"', () => {
    expect(familySrc).toMatch(/\$\{item\.label\}未打卡/);
  });

  it('漏打卡用警示 emoji 区分', () => {
    expect(familySrc).toMatch(/isToday \? '🌙' : '⚠️'/);
  });

  it('照顾者在漏打卡日子看到"去补打卡"', () => {
    expect(familySrc).toContain('去补打卡 →');
    expect(familySrc).toMatch(/backfillDate: item\.date/);
  });

  it('家人看到"主照顾者昨日没有打卡"', () => {
    expect(familySrc).toMatch(/主照顾者\$\{item\.label\}没有打卡/);
  });
});
