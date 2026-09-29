/**
 * 存储损坏防护：AsyncStorage 里的 JSON 坏掉时，读路径不抛、返回空，
 * 坏数据备份到 <key>:corrupt_backup_<时间戳>，不静默丢失。
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const store = new Map<string, string>();

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getAllKeys: vi.fn(async () => Array.from(store.keys())),
    getItem: vi.fn(async (k: string) => (store.has(k) ? store.get(k)! : null)),
    setItem: vi.fn(async (k: string, v: string) => { store.set(k, v); }),
    removeItem: vi.fn(async (k: string) => { store.delete(k); }),
    multiGet: vi.fn(async (ks: string[]) => ks.map(k => [k, store.has(k) ? store.get(k)! : null])),
    multiSet: vi.fn(async (pairs: [string, string][]) => { pairs.forEach(([k, v]) => store.set(k, v)); }),
    multiRemove: vi.fn(async (ks: string[]) => { ks.forEach(k => store.delete(k)); }),
  },
}));

// storage 顶层 import cloud-sync；本测试只验本地解析，直接 mock 掉整条链。
vi.mock("../lib/cloud-sync", () => ({}));

import { getAllCheckIns, getMedications, getAllMemberships, setActiveRoomIdCache } from "../lib/storage";

beforeEach(() => {
  store.clear();
  setActiveRoomIdCache(null);
});

describe("存储损坏防护", () => {
  it("打卡 JSON 损坏：getAllCheckIns 返回 [] 而不是抛错", async () => {
    store.set("daily_checkins_v2", "{bad json");
    const list = await getAllCheckIns();
    expect(list).toEqual([]);
  });

  it("损坏的打卡数据被备份，坏 key 被清除", async () => {
    store.set("daily_checkins_v2", "{bad json");
    await getAllCheckIns();
    expect(store.has("daily_checkins_v2")).toBe(false);
    const backupKeys = Array.from(store.keys()).filter(k => k.startsWith("daily_checkins_v2:corrupt_backup_"));
    expect(backupKeys).toHaveLength(1);
    expect(store.get(backupKeys[0])).toBe("{bad json");
  });

  it("损坏后写入新数据能正常读回（不被坏 key 卡死）", async () => {
    store.set("daily_checkins_v2", "{bad json");
    await getAllCheckIns();
    store.set("daily_checkins_v2", JSON.stringify([{ date: "2026-09-28" }]));
    const list = await getAllCheckIns();
    expect(list).toHaveLength(1);
    expect(list[0].date).toBe("2026-09-28");
  });

  it("用药 JSON 损坏：getMedications 返回 [] 而不是抛错", async () => {
    store.set("medications", "[1,2,");
    const list = await getMedications();
    expect(list).toEqual([]);
    expect(Array.from(store.keys()).some(k => k.startsWith("medications:corrupt_backup_"))).toBe(true);
  });

  it("家庭成员 JSON 损坏：getAllMemberships 返回 [] 而不是抛错", async () => {
    store.set("family_memberships_v1", "oops");
    const list = await getAllMemberships();
    expect(list).toEqual([]);
    expect(Array.from(store.keys()).some(k => k.startsWith("family_memberships_v1:corrupt_backup_"))).toBe(true);
  });

  it("正常数据不受影响", async () => {
    store.set("daily_checkins_v2", JSON.stringify([{ date: "2026-09-27", sleepHours: 7 }]));
    const list = await getAllCheckIns();
    expect(list).toHaveLength(1);
    expect(list[0].sleepHours).toBe(7);
    expect(Array.from(store.keys()).some(k => k.includes("corrupt_backup"))).toBe(false);
  });

  it("字符串 sleepHours 被归一为 number（趋势图 .toFixed 不崩）", async () => {
    store.set("daily_checkins_v2", JSON.stringify([{ date: "2026-09-27", sleepHours: "7.5", awakeHours: "1.2" }]));
    const list = await getAllCheckIns();
    expect(list).toHaveLength(1);
    expect(list[0].sleepHours).toBe(7.5);
    expect(list[0].awakeHours).toBe(1.2);
    expect(() => (list[0].sleepHours as number).toFixed(1)).not.toThrow();
  });

  it("非法字符串 sleepHours 归一为 0", async () => {
    store.set("daily_checkins_v2", JSON.stringify([{ date: "2026-09-27", sleepHours: "abc" }]));
    const list = await getAllCheckIns();
    expect(list[0].sleepHours).toBe(0);
  });
});
