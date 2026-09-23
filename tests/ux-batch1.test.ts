import { describe, expect, it, vi, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

// ── Mocks ──────────────────────────────────────────────────────────
const store = new Map<string, string>();

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (k: string) => (store.has(k) ? store.get(k)! : null)),
    setItem: vi.fn(async (k: string, v: string) => { store.set(k, v); }),
    removeItem: vi.fn(async (k: string) => { store.delete(k); }),
  },
}));

vi.mock("expo-notifications", () => ({
  setNotificationHandler: vi.fn(),
  getPermissionsAsync: vi.fn(async () => ({ status: "granted" })),
  requestPermissionsAsync: vi.fn(async () => ({ status: "granted" })),
  getExpoPushTokenAsync: vi.fn(async () => ({ data: "ExponentPushToken[test]" })),
  setNotificationChannelAsync: vi.fn(async () => {}),
}));

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

vi.mock("expo-constants", () => ({ default: {} }));

// 避免 notifications.ts 把真云同步拖进来
vi.mock("../lib/cloud-sync", () => ({
  cloudUpdatePushToken: vi.fn(async () => {}),
}));

// storage.ts 体积大且依赖多，这里只测草稿三个纯存取函数，
// 用源码级导入需要完整模块——直接 import 真模块并 mock 其外部依赖太重，
// 改走"导入真 storage"的轻量方式：storage 仅依赖 AsyncStorage（已 mock）。
import {
  saveCheckInDraft,
  readCheckInDraft,
  clearCheckInDraft,
} from "../lib/storage";

import {
  getPermissionsAsync,
  requestPermissionsAsync,
  getExpoPushTokenAsync,
} from "expo-notifications";
import { syncPushTokenSilently } from "../lib/notifications";
import { cloudUpdatePushToken } from "../lib/cloud-sync";

const read = (p: string) =>
  fs.readFileSync(path.join(__dirname, "..", p), "utf8");

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
  // 默认：已授权
  vi.mocked(getPermissionsAsync).mockResolvedValue({ status: "granted" } as any);
});

describe("游客打卡草稿（存取）", () => {
  it("save → read 往返一致", async () => {
    await saveCheckInDraft({
      targetDate: "2026-09-23",
      mode: "morning",
      fields: { morningNotes: "睡得不错", nightWakings: 1 },
      savedAt: Date.now(),
    });
    const d = await readCheckInDraft();
    expect(d?.targetDate).toBe("2026-09-23");
    expect(d?.mode).toBe("morning");
    expect(d?.fields.morningNotes).toBe("睡得不错");
  });

  it("clear 后读不到", async () => {
    await saveCheckInDraft({ targetDate: "2026-09-23", mode: "evening", fields: {}, savedAt: Date.now() });
    await clearCheckInDraft();
    expect(await readCheckInDraft()).toBeNull();
  });

  it("超过 48 小时的草稿视为过期并清理", async () => {
    await saveCheckInDraft({
      targetDate: "2026-09-20",
      mode: "morning",
      fields: {},
      savedAt: Date.now() - 49 * 3600 * 1000,
    });
    expect(await readCheckInDraft()).toBeNull();
    expect(store.has("@xiaomahuCheckinDraft")).toBe(false);
  });

  it("损坏的 JSON 不抛异常、返回 null", async () => {
    store.set("@xiaomahuCheckinDraft", "{not-json");
    expect(await readCheckInDraft()).toBeNull();
  });
});

describe("启动时静默同步 push token", () => {
  it("已授权时只查权限、不弹窗申请，直接注册 token", async () => {
    const token = await syncPushTokenSilently();
    expect(token).toBe("ExponentPushToken[test]");
    expect(getPermissionsAsync).toHaveBeenCalled();
    expect(requestPermissionsAsync).not.toHaveBeenCalled();
    expect(getExpoPushTokenAsync).toHaveBeenCalled();
    expect(cloudUpdatePushToken).toHaveBeenCalled();
  });

  it("未授权时直接返回 null，绝不弹窗", async () => {
    vi.mocked(getPermissionsAsync).mockResolvedValue({ status: "denied" } as any);
    expect(await syncPushTokenSilently()).toBeNull();
    expect(requestPermissionsAsync).not.toHaveBeenCalled();
    expect(getExpoPushTokenAsync).not.toHaveBeenCalled();
  });
});

describe("UX 修复源码断言", () => {
  it("启动页用静默同步代替直接申请权限", () => {
    const layout = read("app/_layout.tsx");
    expect(layout).toContain("syncPushTokenSilently");
    // 启动定时器里不再调用会弹窗的 registerPushToken
    expect(layout).not.toMatch(/setTimeout\(\(\) => \{ registerPushToken/);
  });

  it("onboarding 先解释用途再申请权限", () => {
    const ob = read("app/onboarding.tsx");
    expect(ob).toContain("askNotificationPermission");
    expect(ob).toContain("开启每日提醒吗？");
  });

  it("打卡表单三个退出入口都走防丢确认", () => {
    const checkin = read("app/(tabs)/checkin.tsx");
    expect(checkin).toContain("function requestCloseForm()");
    expect(checkin).toContain("confirmDiscardChanges");
    // refocus 时不清空已填写的内容
    expect(checkin).toContain("keepUserInput");
    // 游客草稿：保存 / 恢复 / 提示
    expect(checkin).toContain("saveCheckInDraft");
    expect(checkin).toContain("readCheckInDraft");
    expect(checkin).toContain("已恢复你登录前填写的内容");
  });

  it("用药提醒开关先确认权限、排期失败如实提示", () => {
    const med = read("app/(tabs)/medication.tsx");
    expect(med).toContain("handleToggleReminder");
    expect(med).toContain("requestNotificationPermissions");
    expect(med).toContain("提醒未能开启");
  });

  it("首页恢复显示照护建议并附免责声明", () => {
    const index = read("app/(tabs)/index.tsx");
    expect(index).toContain("{motivation}");
    expect(index).toContain("不构成医疗建议");
  });

  it("登录页协议勾选在 Apple 按钮上方", () => {
    const login = read("app/login.tsx");
    const agreementPos = login.indexOf("styles.agreementRow");
    const applePos = login.indexOf("AppleAuthenticationButton");
    expect(agreementPos).toBeGreaterThan(-1);
    expect(applePos).toBeGreaterThan(-1);
    expect(agreementPos).toBeLessThan(applePos);
  });
});
