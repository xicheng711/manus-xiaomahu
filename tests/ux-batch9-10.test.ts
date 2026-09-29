/**
 * 智能打卡提醒多家庭 key 隔离：
 * key 必须带 familyId，否则切到 B 家庭排提醒时会取消 A 家庭的提醒。
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const store = new Map<string, string>();
const scheduled: Array<{ id: string; content: any }> = [];
const cancelled: string[] = [];
let seq = 0;

vi.mock("expo-notifications", () => ({
  setNotificationHandler: vi.fn(),
  cancelScheduledNotificationAsync: vi.fn(async (id: string) => { cancelled.push(id); }),
  scheduleNotificationAsync: vi.fn(async (req: any) => {
    const id = `notif-${++seq}`;
    scheduled.push({ id, content: req.content });
    return id;
  }),
  getPermissionsAsync: vi.fn(async () => ({ status: "granted" })),
  SchedulableTriggerInputTypes: { DATE: "date" },
}));

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getAllKeys: vi.fn(async () => Array.from(store.keys())),
    getItem: vi.fn(async (k: string) => (store.has(k) ? store.get(k)! : null)),
    setItem: vi.fn(async (k: string, v: string) => { store.set(k, v); }),
    removeItem: vi.fn(async (k: string) => { store.delete(k); }),
    multiRemove: vi.fn(async (ks: string[]) => { ks.forEach(k => store.delete(k)); }),
  },
}));

vi.mock("expo-constants", () => ({ default: {} }));
vi.mock("../lib/cloud-sync", () => ({
  cloudUpdatePushToken: vi.fn(async () => {}),
}));

// 提醒时间设为几小时后，保证今天也能排上（确定性）
function futureTime(hoursAhead: number): string {
  const d = new Date(Date.now() + hoursAhead * 3600_000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
const T = futureTime(2);
const T2 = futureTime(3);

vi.mock("../lib/storage", () => ({
  getCurrentUserIsCreator: vi.fn(async () => true),
  // A/B 家庭用不同的提醒时间：旧 key（不带 familyId）下，
  // B 家庭排期会走到"时间变了→取消旧的"分支，误删 A 家庭的提醒
  getFamilyProfile: vi.fn(async (familyId?: string) => ({
    reminderMorning: familyId === "famB" ? T2 : T,
    reminderEvening: familyId === "famB" ? T2 : T,
  })),
  getCheckInByDate: vi.fn(async () => null),
}));

import { ensureTodayReminders, cancelReminderForDate, cancelAllReminders } from "../lib/notifications";

beforeEach(() => {
  store.clear();
  scheduled.length = 0;
  cancelled.length = 0;
  seq = 0;
});

function smartKeys() {
  return Array.from(store.keys()).filter(k =>
    k.startsWith("@xiaomahuMorningSmart_") || k.startsWith("@xiaomahuEveningSmart_")
  );
}

describe("智能提醒多家庭 key 隔离", () => {
  it("两个家庭的提醒 key 互不相同", async () => {
    await ensureTodayReminders("奶奶", "famA");
    await ensureTodayReminders("爷爷", "famB");
    const keys = smartKeys();
    expect(keys.some(k => k.includes("famA"))).toBe(true);
    expect(keys.some(k => k.includes("famB"))).toBe(true);
  });

  it("切家庭排提醒不取消另一家庭的提醒", async () => {
    await ensureTodayReminders("奶奶", "famA");
    const afterA = scheduled.length;
    expect(afterA).toBeGreaterThan(0);
    cancelled.length = 0;
    await ensureTodayReminders("爷爷", "famB");
    // B 家庭的排期不能取消 A 家庭已排的通知
    const cancelledA = cancelled.filter(id => scheduled.slice(0, afterA).some(s => s.id === id));
    expect(cancelledA).toEqual([]);
    // A 家庭的 key 还在
    expect(smartKeys().some(k => k.includes("famA"))).toBe(true);
  });

  it("提醒文案带各自家庭的老人名字", async () => {
    await ensureTodayReminders("奶奶", "famA");
    await ensureTodayReminders("爷爷", "famB");
    const bodies = scheduled.map(s => s.content.body as string);
    expect(bodies.some(b => b.includes("奶奶"))).toBe(true);
    expect(bodies.some(b => b.includes("爷爷"))).toBe(true);
  });

  it("打卡后只取消本家庭该日期的提醒", async () => {
    await ensureTodayReminders("奶奶", "famA");
    await ensureTodayReminders("爷爷", "famB");
    // 不假设"今天"一定有排期（临近午夜时 now+3h 会落在已过去的时间，源码会按设计跳过），
    // 直接取 famA 实际排上的第一个早提醒 key，从中解析出它所属的日期。
    const famAMorningKeys = smartKeys().filter(
      k => k.startsWith("@xiaomahuMorningSmart_") && k.includes("famA"),
    );
    expect(famAMorningKeys.length).toBeGreaterThan(0);
    const targetKey = famAMorningKeys[0];
    const dateKey = targetKey.match(/(\d{4}-\d{2}-\d{2})$/)?.[1];
    expect(dateKey).toBeTruthy();
    const famBKeysBefore = smartKeys().filter(k => k.includes("famB"));
    expect(famBKeysBefore.length).toBeGreaterThan(0);
    cancelled.length = 0;
    await cancelReminderForDate("morning", dateKey!, "famA");
    // famA 该日期早提醒的 key 没了
    expect(store.has(targetKey)).toBe(false);
    // famB 的提醒 key 一个都不少
    for (const k of famBKeysBefore) expect(store.has(k)).toBe(true);
  });

  it("cancelAllReminders 解析智能提醒的 JSON record 逐个取消（不是把 JSON 当 ID）", async () => {
    await ensureTodayReminders("奶奶", "famA");
    const keys = smartKeys();
    expect(keys.length).toBeGreaterThan(0);
    // 记下每个 key 里真正的通知 ID
    const realIds = keys.map(k => (JSON.parse(store.get(k)!) as { id: string }).id);
    cancelled.length = 0;
    await cancelAllReminders();
    // 每个真正的通知 ID 都被取消了
    for (const id of realIds) {
      expect(cancelled).toContain(id);
    }
    // 整个 JSON 字符串绝不能被当成通知 ID
    expect(cancelled.some(id => id.startsWith("{"))).toBe(false);
    // key 全清掉
    expect(smartKeys().length).toBe(0);
  });
});
