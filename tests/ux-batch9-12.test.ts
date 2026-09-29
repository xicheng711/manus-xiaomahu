/**
 * 用药提醒 M1（隔日续排）/ M2（奇偶锚点）回归测试。
 *
 * M2：编辑只改剂量时，重排必须沿用原来的周期锚点（anchor + 2k），
 *     不能按"排期当天"重算，否则服药奇偶日悄悄翻转。
 * M1：预排只覆盖约 20 天，用药页聚焦时必须把未来的剂量日补足，
 *     否则到期后提醒静默消失。
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const store = new Map<string, string>();
const scheduledDates: Date[] = [];
const scheduledRequests: Array<{ trigger: any; content: any }> = [];
const cancelled: string[] = [];
let seq = 0;

vi.mock("expo-notifications", () => ({
  setNotificationHandler: vi.fn(),
  cancelScheduledNotificationAsync: vi.fn(async (id: string) => { cancelled.push(id); }),
  scheduleNotificationAsync: vi.fn(async (req: any) => {
    if (req.trigger?.date) scheduledDates.push(new Date(req.trigger.date));
    scheduledRequests.push({ trigger: req.trigger, content: req.content });
    return `notif-${++seq}`;
  }),
  getPermissionsAsync: vi.fn(async () => ({ status: "granted" })),
  SchedulableTriggerInputTypes: { DATE: "date", DAILY: "daily", WEEKLY: "weekly" },
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
  },
}));

vi.mock("expo-constants", () => ({ default: {} }));

vi.mock("../lib/cloud-sync", () => ({
  cloudUpdatePushToken: vi.fn(async () => {}),
}));

vi.mock("../lib/storage", () => ({
  getCurrentUserIsCreator: vi.fn(async () => true),
  getFamilyProfile: vi.fn(async () => null),
}));

import {
  scheduleMedicationReminder,
  renewEveryOtherDayReminders,
} from "../lib/notifications";

const SLOT = "@xiaomahuMedNotif_med1_0800";

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

beforeEach(() => {
  store.clear();
  scheduledDates.length = 0;
  scheduledRequests.length = 0;
  cancelled.length = 0;
  seq = 0;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("M2: 每隔一天锚点奇偶", () => {
  it("服药日恒为 anchor + 2k：周一建（anchor=周一），剂量日全是偶数偏移", async () => {
    // 周一中午：今天 08:00 已过，第一剂是周三
    vi.setSystemTime(new Date(2026, 8, 28, 12, 0, 0)); // 2026-09-28 周一
    await scheduleMedicationReminder("med1_0800", "药", "💊", "奶奶", 8, 0, "每隔一天", {
      anchorDateKey: "2026-09-28",
    });
    expect(scheduledDates.length).toBe(10);
    const keys = scheduledDates.map(dateKey);
    // anchor 09-28 + 2k：09-30, 10-02, 10-04, ...
    expect(keys[0]).toBe("2026-09-30");
    expect(keys[1]).toBe("2026-10-02");
    for (const d of scheduledDates) {
      const offsetDays = Math.round((d.getTime() - new Date(2026, 8, 28, 12).getTime()) / 86400_000);
      expect(offsetDays % 2).toBe(0);
    }
    // 存储为新格式 { ids, dates }
    const raw = store.get(SLOT)!;
    const parsed = JSON.parse(raw);
    expect(Array.isArray(parsed.ids)).toBe(true);
    expect(parsed.ids.length).toBe(10);
    expect(parsed.dates.length).toBe(10);
  });

  it("周二编辑重排：沿用周一锚点，奇偶不翻转", async () => {
    vi.setSystemTime(new Date(2026, 8, 28, 12, 0, 0));
    await scheduleMedicationReminder("med1_0800", "药", "💊", "奶奶", 8, 0, "每隔一天", {
      anchorDateKey: "2026-09-28",
    });
    // 周二用户只改了剂量，触发重排：必须传原来的 anchor
    vi.setSystemTime(new Date(2026, 8, 29, 12, 0, 0)); // 2026-09-29 周二
    scheduledDates.length = 0;
    await scheduleMedicationReminder("med1_0800", "药", "💊", "奶奶", 8, 0, "每隔一天", {
      anchorDateKey: "2026-09-28",
    });
    const keys = scheduledDates.map(dateKey);
    // 仍然是周一锚点的偶数偏移（09-30, 10-02…），而不是周二锚点的 10-01, 10-03
    expect(keys[0]).toBe("2026-09-30");
    expect(keys[1]).toBe("2026-10-02");
    expect(keys).not.toContain("2026-10-01");
  });

  it("不传 anchor 时回退到今天（兼容老调用）", async () => {
    vi.setSystemTime(new Date(2026, 8, 28, 12, 0, 0));
    await scheduleMedicationReminder("med1_0800", "药", "💊", "奶奶", 8, 0, "每隔一天");
    expect(scheduledDates.map(dateKey)[0]).toBe("2026-09-30");
  });
});

describe("M3/M4: 每周一次可选星期", () => {
  it("按用户选定的星期排（M3）：选周二就排周二", async () => {
    vi.setSystemTime(new Date(2026, 8, 28, 12, 0, 0)); // 周一
    await scheduleMedicationReminder("medW_0800", "药", "💊", "奶奶", 8, 0, "每周一次", {
      weekday: 3, // 周二
    });
    expect(scheduledRequests.length).toBe(1);
    expect(scheduledRequests[0].trigger.weekday).toBe(3);
  });

  it("不传 weekday 时回退到当天（兼容老行为）", async () => {
    vi.setSystemTime(new Date(2026, 8, 28, 12, 0, 0)); // 周一 → weekday 2
    await scheduleMedicationReminder("medW_0800", "药", "💊", "奶奶", 8, 0, "每周一次");
    expect(scheduledRequests[0].trigger.weekday).toBe(2);
  });

  it("编辑后沿用选定星期，不漂到编辑当天（M4）", async () => {
    vi.setSystemTime(new Date(2026, 8, 28, 12, 0, 0)); // 周一创建，选周三
    await scheduleMedicationReminder("medW_0800", "药", "💊", "奶奶", 8, 0, "每周一次", { weekday: 4 });
    scheduledRequests.length = 0;
    vi.setSystemTime(new Date(2026, 8, 30, 12, 0, 0)); // 周三编辑（只改剂量）
    await scheduleMedicationReminder("medW_0800", "药", "💊", "奶奶", 8, 0, "每周一次", { weekday: 4 });
    expect(scheduledRequests[0].trigger.weekday).toBe(4);
  });
});

describe("L1: 通知 data 带 roomId", () => {
  it("排期时把 roomId 写进 data，点击通知可切回正确家庭", async () => {
    vi.setSystemTime(new Date(2026, 8, 28, 12, 0, 0));
    await scheduleMedicationReminder("medD_0800", "药", "💊", "奶奶", 8, 0, "每天一次", {
      roomId: "room-42",
    });
    expect(scheduledRequests[0].content.data).toMatchObject({
      screen: "medication",
      roomId: "room-42",
    });
  });

  it("续排的通知也带 roomId", async () => {
    vi.setSystemTime(new Date(2026, 8, 28, 12, 0, 0));
    await scheduleMedicationReminder("med1_0800", "药", "💊", "奶奶", 8, 0, "每隔一天", {
      anchorDateKey: "2026-09-28",
      roomId: "room-42",
    });
    const storedDates: string[] = JSON.parse(store.get(SLOT)!).dates;
    const thirdFromEnd = new Date(storedDates[storedDates.length - 3]);
    vi.setSystemTime(new Date(thirdFromEnd.getTime() - 3600_000));
    scheduledRequests.length = 0;
    await renewEveryOtherDayReminders([{
      id: "med1", times: ["08:00"], frequency: "每隔一天",
      active: true, reminderEnabled: true, name: "药", icon: "💊",
      everyOtherDayAnchor: "2026-09-28",
    }], "奶奶", "room-42");
    expect(scheduledRequests.length).toBeGreaterThan(0);
    for (const r of scheduledRequests) {
      expect(r.content.data.roomId).toBe("room-42");
    }
  });
});

describe("M1: 每隔一天续排", () => {
  it("未来剂量日充足（>=5）时不动", async () => {
    vi.setSystemTime(new Date(2026, 8, 28, 12, 0, 0));
    await scheduleMedicationReminder("med1_0800", "药", "💊", "奶奶", 8, 0, "每隔一天", {
      anchorDateKey: "2026-09-28",
    });
    const before = scheduledDates.length;
    await renewEveryOtherDayReminders([{
      id: "med1", times: ["08:00"], frequency: "每隔一天",
      active: true, reminderEnabled: true, name: "药", icon: "💊",
      everyOtherDayAnchor: "2026-09-28",
    }], "奶奶");
    expect(scheduledDates.length).toBe(before);
  });

  it("未来剂量日不足 5 个时，从最后一个剂量日往后每 2 天补足 10 个", async () => {
    vi.setSystemTime(new Date(2026, 8, 28, 12, 0, 0));
    await scheduleMedicationReminder("med1_0800", "药", "💊", "奶奶", 8, 0, "每隔一天", {
      anchorDateKey: "2026-09-28",
    });
    const storedDates: string[] = JSON.parse(store.get(SLOT)!).dates;
    const lastStored = new Date(storedDates[storedDates.length - 1]);

    // 快进到只剩 3 个未来剂量日
    const thirdFromEnd = new Date(storedDates[storedDates.length - 3]);
    vi.setSystemTime(new Date(thirdFromEnd.getTime() - 3600_000)); // 倒数第3个的前1小时
    scheduledDates.length = 0;

    await renewEveryOtherDayReminders([{
      id: "med1", times: ["08:00"], frequency: "每隔一天",
      active: true, reminderEnabled: true, name: "药", icon: "💊",
      everyOtherDayAnchor: "2026-09-28",
    }], "奶奶");

    // 续排从最后一个已排剂量日往后每 2 天
    expect(scheduledDates.length).toBeGreaterThan(0);
    const firstNew = scheduledDates[0];
    const expectedFirst = new Date(lastStored);
    expectedFirst.setDate(expectedFirst.getDate() + 2);
    expect(dateKey(firstNew)).toBe(dateKey(expectedFirst));

    // 续排后存储里未来剂量日回到 10 个，且奇偶仍对齐锚点
    const after: string[] = JSON.parse(store.get(SLOT)!).dates;
    const nowTs = Date.now();
    const future = after.filter(d => new Date(d).getTime() > nowTs);
    expect(future.length).toBe(10);
    for (const d of future) {
      const offsetDays = Math.round((new Date(d).getTime() - new Date(2026, 8, 28, 12).getTime()) / 86400_000);
      expect(offsetDays % 2).toBe(0);
    }
  });

  it("旧格式（只有 ID 数组）走整槽重排并转为新格式", async () => {
    vi.setSystemTime(new Date(2026, 8, 28, 12, 0, 0));
    store.set(SLOT, JSON.stringify(["legacy-1", "legacy-2"]));
    await renewEveryOtherDayReminders([{
      id: "med1", times: ["08:00"], frequency: "每隔一天",
      active: true, reminderEnabled: true, name: "药", icon: "💊",
      everyOtherDayAnchor: "2026-09-28",
    }], "奶奶");
    // 旧 ID 被取消（schedule 开头幂等取消），新排 10 个并转为 { ids, dates }
    expect(cancelled).toContain("legacy-1");
    expect(cancelled).toContain("legacy-2");
    const parsed = JSON.parse(store.get(SLOT)!);
    expect(parsed.ids.length).toBe(10);
    expect(parsed.dates.length).toBe(10);
  });

  it("非每隔一天 / 未激活 / 提醒关闭的药不续排", async () => {
    vi.setSystemTime(new Date(2026, 8, 28, 12, 0, 0));
    await renewEveryOtherDayReminders([
      { id: "a", times: ["08:00"], frequency: "每天一次", active: true, reminderEnabled: true },
      { id: "b", times: ["08:00"], frequency: "每隔一天", active: false, reminderEnabled: true },
      { id: "c", times: ["08:00"], frequency: "每隔一天", active: true, reminderEnabled: false },
    ], "奶奶");
    expect(scheduledDates.length).toBe(0);
  });
});
