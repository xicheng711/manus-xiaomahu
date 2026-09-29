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
let mockCheckInByDate: Record<string, any> | null = null;
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
  // 返回"当前还排着"的通知（已取消的不算），供 areRemindersScheduled 做 ground truth 检查
  getAllScheduledNotificationsAsync: vi.fn(async () =>
    scheduled
      .filter(s => !cancelledIds.includes(s.id))
      .map(s => ({ identifier: s.id })),
  ),
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
  // 按日期返回打卡状态；mockCheckInByDate 为 null 时回退到统一的 mockCheckIn
  getCheckInByDate: vi.fn(async (dateStr: string) =>
    mockCheckInByDate ? (mockCheckInByDate[dateStr] ?? null) : mockCheckIn),
}));

vi.mock('../lib/shared-date-range', () => ({
  getCareDayKey: vi.fn(() => '2026-09-26'),
  localDateKey: vi.fn((d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`),
}));

vi.mock('expo-constants', () => ({ default: {} }));
vi.mock('../lib/cloud-sync', () => ({
  cloudUpdatePushToken: vi.fn(async () => {}),
}));

import {
  smartTodayKey,
  parseReminderTime,
  ensureTodayReminders,
  cancelReminderForDate,
  areRemindersScheduled,
  cancelAllReminders,
} from '../lib/notifications';
import * as Notifications from 'expo-notifications';

const repo = path.resolve(__dirname, '..');
const notifSrc = fs.readFileSync(path.join(repo, 'lib/notifications.ts'), 'utf8');
const familySrc = fs.readFileSync(path.join(repo, 'app/(tabs)/family.tsx'), 'utf8');
const checkinSrc = fs.readFileSync(path.join(repo, 'app/(tabs)/checkin.tsx'), 'utf8');
const profileSrc = fs.readFileSync(path.join(repo, 'app/profile.tsx'), 'utf8');
const familyCtxSrc = fs.readFileSync(path.join(repo, 'lib/family-context.tsx'), 'utf8');
const layoutSrc = fs.readFileSync(path.join(repo, 'app/_layout.tsx'), 'utf8');

beforeEach(() => {
  scheduled.length = 0;
  cancelledIds.length = 0;
  store.clear();
  mockCheckIn = null;
  mockCheckInByDate = null;
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
  it('都没打卡、时间没过：今天+未来2天早晚都安排', async () => {
    vi.setSystemTime(new Date(2026, 8, 26, 7, 0, 0)); // 07:00
    mockProfile = { reminderMorning: '08:00', reminderEvening: '21:00' };
    mockCheckIn = { morningDone: false, eveningDone: false };
    await ensureTodayReminders('奶奶', '1');
    // 3 天窗口 × 早晚 = 6 条一次性提醒（用户某天不打开 app 当天仍有提醒）
    expect(scheduled.length).toBe(6);
    // 都是 DATE 一次性触发
    for (const s of scheduled) {
      expect(s.trigger.type).toBe('date');
      expect(s.trigger.date).toBeInstanceOf(Date);
    }
    // 覆盖 3 个不同日期
    const days = new Set(scheduled.map(s => s.trigger.date.getDate()));
    expect(days.size).toBe(3);
    const titles = scheduled.map(s => s.content.title);
    expect(titles.some(t => t.includes('早安') || t.includes('早上好') || t.includes('晨间'))).toBe(true);
    expect(titles.some(t => t.includes('辛苦') || t.includes('晚安') || t.includes('小结'))).toBe(true);
  });

  it('早间已打卡：每天只安排晚间', async () => {
    vi.setSystemTime(new Date(2026, 8, 26, 7, 0, 0));
    mockProfile = { reminderMorning: '08:00', reminderEvening: '21:00' };
    mockCheckIn = { morningDone: true, eveningDone: false };
    await ensureTodayReminders('奶奶', '1');
    expect(scheduled.length).toBe(3);
    for (const s of scheduled) {
      expect(s.trigger.date.getHours()).toBe(21);
    }
  });

  it('都打完了：一个都不安排', async () => {
    vi.setSystemTime(new Date(2026, 8, 26, 7, 0, 0));
    mockProfile = { reminderMorning: '08:00', reminderEvening: '21:00' };
    mockCheckIn = { morningDone: true, eveningDone: true };
    await ensureTodayReminders('奶奶', '1');
    expect(scheduled.length).toBe(0);
  });

  it('提醒时间已过：当天不安排，未来两天正常安排', async () => {
    vi.setSystemTime(new Date(2026, 8, 26, 9, 0, 0)); // 09:00，早间 08:00 已过
    mockProfile = { reminderMorning: '08:00', reminderEvening: '21:00' };
    mockCheckIn = { morningDone: false, eveningDone: false };
    await ensureTodayReminders('奶奶', '1');
    // 当天只有晚间 + 未来两天早晚 = 5
    expect(scheduled.length).toBe(5);
    const todayMorning = scheduled.filter(
      s => s.trigger.date.getDate() === 26 && s.trigger.date.getHours() === 8,
    );
    expect(todayMorning.length).toBe(0);
  });

  it("设为 'off' 的不安排", async () => {
    vi.setSystemTime(new Date(2026, 8, 26, 7, 0, 0));
    mockProfile = { reminderMorning: 'off', reminderEvening: '21:00' };
    mockCheckIn = { morningDone: false, eveningDone: false };
    await ensureTodayReminders('奶奶', '1');
    // 3 天晚间
    expect(scheduled.length).toBe(3);
  });

  it('打卡完成后取消该时段未响的提醒', async () => {
    vi.setSystemTime(new Date(2026, 8, 26, 7, 0, 0));
    mockProfile = { reminderMorning: '08:00', reminderEvening: '21:00' };
    mockCheckIn = { morningDone: false, eveningDone: false };
    await ensureTodayReminders('奶奶', '1');
    expect(scheduled.length).toBe(6);
    const morningId = scheduled.find(s => s.trigger.date.getHours() === 8)!.id;

    await cancelReminderForDate('morning', '2026-09-26', '1');
    expect(cancelledIds).toContain(morningId);
    // 晚间的不受影响
    expect(cancelledIds.length).toBe(1);
  });

  it('补打卡只取消补打卡日期的提醒，不碰今日提醒', async () => {
    // 9-27 早上安排好提醒（含 9-27/9-28/9-29 三天）
    vi.setSystemTime(new Date(2026, 8, 27, 7, 0, 0));
    mockProfile = { reminderMorning: '08:00', reminderEvening: '21:00' };
    mockCheckIn = { morningDone: false, eveningDone: false };
    await ensureTodayReminders('奶奶', '1');
    const yesterdayMorningId = scheduled.find(
      s => s.trigger.date.getDate() === 27 && s.trigger.date.getHours() === 8,
    )!.id;
    const todayMorningId = scheduled.find(
      s => s.trigger.date.getDate() === 28 && s.trigger.date.getHours() === 8,
    )!.id;

    // 9-28 07:35 补 9-27 的早间打卡：只取消 9-27 的提醒
    vi.setSystemTime(new Date(2026, 8, 28, 7, 35, 0));
    await cancelReminderForDate('morning', '2026-09-27', '1');
    expect(cancelledIds).toEqual([yesterdayMorningId]);
    // 今日（9-28）的早间提醒还在排期里
    const pending = await Notifications.getAllScheduledNotificationsAsync();
    expect(pending.some(p => p.identifier === todayMorningId)).toBe(true);
  });

  it('凌晨 2 点：按日历日查打卡状态并安排今日提醒', async () => {
    // 旧实现用护理日 key（09-25）查状态、安排的是日历日（09-26）的提醒，
    // 凌晨补 09-25 的打卡会误删 09-26 的提醒。新实现统一用日历日。
    vi.setSystemTime(new Date(2026, 8, 26, 2, 0, 0)); // 09-26 02:00
    mockProfile = { reminderMorning: '08:00', reminderEvening: '21:00' };
    mockCheckInByDate = { '2026-09-26': null, '2026-09-27': null, '2026-09-28': null };
    await ensureTodayReminders('奶奶', '1');
    expect(scheduled.length).toBe(6);
    // 09-26 当天的 08:00/21:00 都在
    const todayTriggers = scheduled.filter(s => s.trigger.date.getDate() === 26);
    expect(todayTriggers.length).toBe(2);
  });

  it('凌晨补前一护理日的打卡：不取消新一天的提醒', async () => {
    // 9-25 晚上安排好提醒（含 9-25 晚间 + 9-26/9-27 两天）
    vi.setSystemTime(new Date(2026, 8, 25, 20, 0, 0));
    mockProfile = { reminderMorning: '08:00', reminderEvening: '21:00' };
    mockCheckIn = { morningDone: false, eveningDone: false };
    await ensureTodayReminders('奶奶', '1');
    const nextMorningId = scheduled.find(
      s => s.trigger.date.getDate() === 26 && s.trigger.date.getHours() === 8,
    )!.id;

    // 9-26 02:00 补 9-25（前一护理日）的晚间打卡：只取消 9-25 的 key
    vi.setSystemTime(new Date(2026, 8, 26, 2, 0, 0));
    await cancelReminderForDate('evening', '2026-09-25', '1');
    expect(cancelledIds.length).toBe(1);
    // 9-26 当天的早间提醒还在排期里
    const pending = await Notifications.getAllScheduledNotificationsAsync();
    expect(pending.some(p => p.identifier === nextMorningId)).toBe(true);
  });

  it('改提醒时间后：旧提醒被取消、新时间重排', async () => {
    vi.setSystemTime(new Date(2026, 8, 26, 7, 0, 0));
    mockProfile = { reminderMorning: '08:00', reminderEvening: '21:00' };
    mockCheckIn = { morningDone: false, eveningDone: false };
    await ensureTodayReminders('奶奶', '1');
    const oldMorningIds = scheduled
      .filter(s => s.trigger.date.getHours() === 8)
      .map(s => s.id);
    expect(oldMorningIds.length).toBe(3);

    // 用户把早间提醒改到 09:00
    mockProfile = { reminderMorning: '09:00', reminderEvening: '21:00' };
    await ensureTodayReminders('奶奶', '1');
    // 旧的 3 条 08:00 都被取消
    for (const id of oldMorningIds) {
      expect(cancelledIds).toContain(id);
    }
    // 新的 3 条 09:00 已安排
    const newMornings = scheduled.filter(s => s.trigger.date.getHours() === 9);
    expect(newMornings.length).toBe(3);
    // 晚间的不受影响（没重排）
    expect(scheduled.filter(s => s.trigger.date.getHours() === 21).length).toBe(3);
  });

  it("设为 'off' 后：已安排的提醒被取消", async () => {
    vi.setSystemTime(new Date(2026, 8, 26, 7, 0, 0));
    mockProfile = { reminderMorning: '08:00', reminderEvening: '21:00' };
    mockCheckIn = { morningDone: false, eveningDone: false };
    await ensureTodayReminders('奶奶', '1');
    expect(scheduled.length).toBe(6);

    mockProfile = { reminderMorning: 'off', reminderEvening: '21:00' };
    await ensureTodayReminders('奶奶', '1');
    // 3 条早间提醒被取消
    expect(cancelledIds.length).toBe(3);
    // 晚间提醒还在排期里
    const pending = await Notifications.getAllScheduledNotificationsAsync();
    expect(pending.length).toBe(3);
    expect(pending.every(p =>
      scheduled.find(s => s.id === p.identifier)!.trigger.date.getHours() === 21,
    )).toBe(true);
  });

  it('areRemindersScheduled 以系统实际排期为准', async () => {
    vi.setSystemTime(new Date(2026, 8, 26, 7, 0, 0));
    mockProfile = { reminderMorning: '08:00', reminderEvening: '21:00' };
    mockCheckIn = { morningDone: false, eveningDone: false };
    expect(await areRemindersScheduled()).toBe(false);
    await ensureTodayReminders('奶奶', '1');
    expect(await areRemindersScheduled()).toBe(true);
    await cancelAllReminders();
    expect(await areRemindersScheduled()).toBe(false);
  });
});

describe('ux-batch8.1: 打卡页 hook', () => {
  it('打卡保存成功后按记录日期取消该时段提醒（补打卡不误删今日）', () => {
    expect(checkinSrc).toContain(
      "cancelReminderForDate(formTarget.mode === 'morning' ? 'morning' : 'evening', formTarget.date, familyId)",
    );
  });

  it('打卡页聚焦时重新评估今日提醒', () => {
    expect(checkinSrc).toContain('ensureTodayReminders(elderNickname, requestedFamilyId)');
  });
});

describe('ux-batch8.1: 提醒生命周期（登出/切家庭/前台）', () => {
  it('退出登录和注销账号时清理智能打卡提醒', () => {
    // cancelAllReminders 必须在 clearAllLocalData 之前调用
    const signOutIdx = profileSrc.indexOf('async function handleSignOut');
    const cancelIdx = profileSrc.indexOf('await cancelAllReminders()', signOutIdx);
    const clearIdx = profileSrc.indexOf('await clearAllLocalData()', signOutIdx);
    expect(cancelIdx).toBeGreaterThan(signOutIdx);
    expect(clearIdx).toBeGreaterThan(cancelIdx);
  });

  it('切换家庭时取消旧提醒并按新家庭重排', () => {
    expect(familyCtxSrc).toContain('await cancelAllReminders()');
    expect(familyCtxSrc).toContain('ensureTodayReminders(target.room.elderName');
  });

  it('App 回到前台时刷新提醒窗口', () => {
    expect(layoutSrc).toContain('ReminderForegroundSync');
    expect(layoutSrc).toContain("AppState.addEventListener(\"change\"");
  });
});

describe('ux-batch8.2: 家人页自动刷新', () => {
  it('可见时每 60 秒静默拉取云端（经 ref 转发，保证调到最新的 loadData）', () => {
    expect(familySrc).toMatch(/setInterval\(\(\) => \{[\s\S]*?loadDataRef\.current\(true\)[\s\S]*?\}, 60_000\)/);
    // F1: loadData 是普通函数（闭包捕获当时的 activeMembership），interval 必须经 ref
    // 转发，否则切家庭后轮询永远调旧闭包、新家庭的自动刷新静默死亡。
    expect(familySrc).toContain('loadDataRef.current = loadData;');
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

  it('照顾者在漏打卡日子看到"去补打卡"（batch9 起走选择器 backfillPick）', () => {
    expect(familySrc).toContain('去补打卡 →');
    expect(familySrc).toContain("params: { backfillPick: '1' }");
    expect(familySrc).not.toMatch(/backfillDate: item\.date/);
  });

  it('家人看到"主照顾者昨日没有打卡"', () => {
    expect(familySrc).toMatch(/主照顾者\$\{item\.label\}没有打卡/);
  });
});
