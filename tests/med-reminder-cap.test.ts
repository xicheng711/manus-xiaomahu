/**
 * P1：iOS 64 条排期上限防护；P2：隔日提醒续排重锚 + 过期 ID 膨胀。
 *
 * - "每隔一天"每槽预排 10 条 DATE 触发器，多药多槽极易超 iOS 64 上限，
 *   超了会被系统静默丢弃。排期/续排前查已用额度，只排最近的 N 个（保近舍远）。
 * - renew 时若未来剂量全部耗尽，必须从锚点 anchor + 2k 推算下一批，
 *   不能从 now 重锚（否则奇偶翻转）；过期 ID 要剪掉，避免存储无限膨胀。
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────
const store = new Map<string, string>();
const scheduledDates: Date[] = [];
const cancelledIds: string[] = [];
let pendingCount = 0;

vi.mock("expo-notifications", () => ({
  setNotificationHandler: vi.fn(),
  cancelScheduledNotificationAsync: vi.fn(async (id: string) => {
    cancelledIds.push(id);
  }),
  scheduleNotificationAsync: vi.fn(async (req: any) => {
    if (req?.trigger?.date) scheduledDates.push(new Date(req.trigger.date));
    return `mock-id-${scheduledDates.length}`;
  }),
  getAllScheduledNotificationsAsync: vi.fn(async () =>
    Array.from({ length: pendingCount }, (_, i) => ({ identifier: `pending-${i}` })),
  ),
  getPermissionsAsync: vi.fn(async () => ({ status: "granted" })),
  SchedulableTriggerInputTypes: { DATE: "date", DAILY: "daily", WEEKLY: "weekly" },
  AndroidImportance: { HIGH: 4 },
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

vi.mock("../lib/storage", () => ({
  getCurrentUserIsCreator: vi.fn(async () => true),
  getFamilyProfile: vi.fn(async () => null),
  getCheckInByDate: vi.fn(async () => null),
}));

vi.mock("expo-constants", () => ({ default: {} }));

vi.mock("../lib/cloud-sync", () => ({
  cloudUpdatePushToken: vi.fn(async () => {}),
}));

import {
  scheduleMedicationReminder,
  renewEveryOtherDayReminders,
} from "../lib/notifications";

const SLOT = "@xiaomahuMedNotif_medA_0800";

beforeEach(() => {
  store.clear();
  scheduledDates.length = 0;
  cancelledIds.length = 0;
  pendingCount = 0;
  vi.clearAllMocks();
});

/** 锚点 YYYY-MM-DD 起第 k 个剂量日（anchor + 2k）。 */
function doseDay(anchor: string, k: number): Date {
  const [y, m, d] = anchor.split("-").map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0, 0);
  dt.setDate(dt.getDate() + k * 2);
  return dt;
}

describe("iOS 64 条上限防护", () => {
  it("额度充足时排满 10 个剂量日", async () => {
    pendingCount = 0;
    await scheduleMedicationReminder("medA_0800", "药A", "💊", "奶奶", 8, 0, "每隔一天", {
      anchorDateKey: "2026-09-28",
    });
    expect(scheduledDates.length).toBe(10);
    // 每个排期日都必须是锚点 + 2k（奇偶与锚点一致），且是未来最近的 10 个
    const anchorMs = new Date(2026, 8, 28).getTime();
    const sorted = [...scheduledDates].sort((a, b) => a.getTime() - b.getTime());
    for (let i = 0; i < sorted.length; i++) {
      const d = sorted[i];
      expect(d.getTime()).toBeGreaterThan(Date.now());
      const dayOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const diffDays = Math.round((dayOnly - anchorMs) / 86400000);
      expect(diffDays % 2).toBe(0);
      expect(d.getHours()).toBe(8);
      if (i > 0) {
        // 相邻剂量日相隔 2 天
        const prevDay = new Date(sorted[i - 1].getFullYear(), sorted[i - 1].getMonth(), sorted[i - 1].getDate()).getTime();
        expect(Math.round((dayOnly - prevDay) / 86400000)).toBe(2);
      }
    }
  });

  it("接近上限时只排最近的 N 个，保近舍远", async () => {
    pendingCount = 54; // 预算 56 - 54 = 2
    await scheduleMedicationReminder("medA_0800", "药A", "💊", "奶奶", 8, 0, "每隔一天", {
      anchorDateKey: "2026-09-28",
    });
    expect(scheduledDates.length).toBe(2);
    // 排的是最近的两个剂量日
    const sorted = [...scheduledDates].sort((a, b) => a.getTime() - b.getTime());
    expect(sorted[0].getTime()).toBeLessThan(sorted[1].getTime());
  });

  it("软预算耗尽但未到硬上限时至少排最近的 1 个，不让提醒断掉", async () => {
    pendingCount = 63; // 软预算 56 已超，但硬上限 64 还剩 1
    await scheduleMedicationReminder("medA_0800", "药A", "💊", "奶奶", 8, 0, "每隔一天", {
      anchorDateKey: "2026-09-28",
    });
    expect(scheduledDates.length).toBe(1);
  });

  it("硬上限 64 已满时一条都不排（系统会静默丢弃，排了也白排）", async () => {
    pendingCount = 64;
    const ret = await scheduleMedicationReminder("medA_0800", "药A", "💊", "奶奶", 8, 0, "每隔一天", {
      anchorDateKey: "2026-09-28",
    });
    expect(scheduledDates.length).toBe(0);
    expect(ret).toBeNull();
  });

  it("存储的 dates 只包含实际排了的剂量日", async () => {
    pendingCount = 54;
    await scheduleMedicationReminder("medA_0800", "药A", "💊", "奶奶", 8, 0, "每隔一天", {
      anchorDateKey: "2026-09-28",
    });
    const raw = store.get(SLOT);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.dates.length).toBe(scheduledDates.length);
    expect(parsed.ids.length).toBe(scheduledDates.length);
  });
});

describe("renewEveryOtherDayReminders 续排", () => {
  it("未来剂量全部耗尽时从锚点推算下一批，不从 now 重锚（奇偶不变）", async () => {
    // 存的全是过去的剂量日
    const past = [0, 1, 2].map(k => {
      const d = doseDay("2026-09-01", k);
      d.setHours(8, 0, 0, 0);
      return d.toISOString();
    });
    store.set(SLOT, JSON.stringify({ ids: ["a", "b", "c"], dates: past }));
    pendingCount = 0;

    await renewEveryOtherDayReminders(
      [{ id: "medA", times: ["08:00"], frequency: "每隔一天", active: true, everyOtherDayAnchor: "2026-09-01" }],
      "奶奶",
    );

    // 重排出的剂量日必须都是 anchor + 2k（奇偶与锚点一致）
    expect(scheduledDates.length).toBeGreaterThan(0);
    const anchorMs = new Date(2026, 8, 1).getTime();
    for (const d of scheduledDates) {
      const dayOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const diffDays = Math.round((dayOnly - anchorMs) / 86400000);
      expect(diffDays % 2).toBe(0);
      expect(d.getTime()).toBeGreaterThan(Date.now());
    }
  });

  it("过期 ID 被剪掉并取消，不无限膨胀", async () => {
    const now = Date.now();
    const pastISO = new Date(now - 86400000).toISOString();
    const futureISO = new Date(now + 86400000).toISOString();
    // 5 个未来剂量 → 不触发续排，但过期 ID 应该被清理
    const futures = Array.from({ length: 5 }, (_, i) => new Date(now + (i + 1) * 86400000).toISOString());
    void futureISO;
    store.set(SLOT, JSON.stringify({
      ids: ["expired-1", "f1", "f2", "f3", "f4", "f5"],
      dates: [pastISO, ...futures],
    }));

    await renewEveryOtherDayReminders(
      [{ id: "medA", times: ["08:00"], frequency: "每隔一天", active: true, everyOtherDayAnchor: "2026-09-01" }],
      "奶奶",
    );

    expect(cancelledIds).toContain("expired-1");
    const raw = store.get(SLOT)!;
    const parsed = JSON.parse(raw);
    expect(parsed.ids).not.toContain("expired-1");
    expect(parsed.ids.length).toBe(5);
    expect(parsed.dates.length).toBe(5);
  });

  it("续排补量也受 64 条预算限制", async () => {
    // 只剩 2 个未来剂量 → 会续排；但额度只剩 1
    const now = Date.now();
    const futures = [new Date(now + 86400000).toISOString(), new Date(now + 3 * 86400000).toISOString()];
    store.set(SLOT, JSON.stringify({ ids: ["f1", "f2"], dates: futures }));
    pendingCount = 55; // 预算 56 - 55 = 1

    await renewEveryOtherDayReminders(
      [{ id: "medA", times: ["08:00"], frequency: "每隔一天", active: true, everyOtherDayAnchor: "2026-09-01" }],
      "奶奶",
    );

    expect(scheduledDates.length).toBe(1);
  });
});
