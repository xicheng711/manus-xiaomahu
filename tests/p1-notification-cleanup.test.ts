import { describe, expect, it, vi, beforeEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────
const cancelledIds: string[] = [];
const store = new Map<string, string>();

vi.mock("expo-notifications", () => ({
  setNotificationHandler: vi.fn(),
  cancelScheduledNotificationAsync: vi.fn(async (id: string) => {
    cancelledIds.push(id);
  }),
  scheduleNotificationAsync: vi.fn(async () => "mock-id"),
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
}));

vi.mock("expo-constants", () => ({ default: {} }));

import { cancelAllMedicationReminders } from "../lib/notifications";

const MED1 = "@xiaomahuMedNotif_med1_morning";
const MED2 = "@xiaomahuMedNotif_med2_evening";
const MORNING = "@xiaomahuMorningNotifId";
const EVENING = "@xiaomahuEveningNotifId";

beforeEach(() => {
  store.clear();
  cancelledIds.length = 0;
  store.set(MED1, "notif-id-1");
  store.set(MED2, "notif-id-2");
  store.set(MORNING, "morning-id");
  store.set(EVENING, "evening-id");
  store.set("@xiaomahuProfile", "{}");
});

describe("cancelAllMedicationReminders (P1 fix)", () => {
  it("cancels every medication reminder id", async () => {
    await cancelAllMedicationReminders();
    expect(cancelledIds.sort()).toEqual(["notif-id-1", "notif-id-2"]);
  });

  it("removes only the @xiaomahuMedNotif_ keys", async () => {
    await cancelAllMedicationReminders();
    expect(store.has(MED1)).toBe(false);
    expect(store.has(MED2)).toBe(false);
    // 早晚打卡提醒与其它 key 必须保留
    expect(store.get(MORNING)).toBe("morning-id");
    expect(store.get(EVENING)).toBe("evening-id");
    expect(store.get("@xiaomahuProfile")).toBe("{}");
  });

  it("does not cancel morning/evening check-in reminders", async () => {
    await cancelAllMedicationReminders();
    expect(cancelledIds).not.toContain("morning-id");
    expect(cancelledIds).not.toContain("evening-id");
  });

  it("a single bad key does not block the rest", async () => {
    const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
    vi.mocked(AsyncStorage.getItem).mockImplementationOnce(async () => {
      throw new Error("boom");
    });
    await cancelAllMedicationReminders();
    // 两个 key 中至少其余逻辑继续；整体不抛错
    expect(store.size).toBeLessThanOrEqual(4);
  });

  it("is idempotent (second run is a no-op)", async () => {
    await cancelAllMedicationReminders();
    cancelledIds.length = 0;
    await cancelAllMedicationReminders();
    expect(cancelledIds).toEqual([]);
  });
});
