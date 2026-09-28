/**
 * ux-batch9-7：第五路审计（登录/游客/注销链路）7 个确认 bug 的回归测试。
 * 真实行为：草稿归属门、session-events 去重；其余走源码结构断言。
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

// ── Mocks（照抄 ux-batch1 的轻量方案） ─────────────────────────────
const store = new Map<string, string>();

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (k: string) => (store.has(k) ? store.get(k)! : null)),
    setItem: vi.fn(async (k: string, v: string) => { store.set(k, v); }),
    removeItem: vi.fn(async (k: string) => { store.delete(k); }),
    multiRemove: vi.fn(async (ks: string[]) => { ks.forEach(k => store.delete(k)); }),
  },
}));

vi.mock("../lib/cloud-sync", () => ({
  cloudUpdatePushToken: vi.fn(async () => {}),
}));

import {
  markDraftLoginInitiated,
  shouldKeepDraftAfterLogin,
} from "../lib/storage";

import {
  onSessionExpired,
  notifySessionExpired,
  resetSessionExpiredFlag,
} from "../lib/session-events";

const read = (p: string) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
  resetSessionExpiredFlag();
});

// ── #1 游客草稿归属门（真实行为） ────────────────────────────────────
describe("#1 游客草稿归属门：换人登录不串号", () => {
  it("存草稿并去登录后 30 分钟内登录 → 保留草稿", async () => {
    await markDraftLoginInitiated();
    expect(await shouldKeepDraftAfterLogin()).toBe(true);
  });

  it("没有打标记的登录（换人/隔天）→ 不保留，应清除草稿", async () => {
    expect(await shouldKeepDraftAfterLogin()).toBe(false);
  });

  it("标记一次性消费：第二次登录不再视为延续", async () => {
    await markDraftLoginInitiated();
    expect(await shouldKeepDraftAfterLogin()).toBe(true);
    expect(await shouldKeepDraftAfterLogin()).toBe(false);
  });

  it("超过 30 分钟的标记 → 不保留", async () => {
    await markDraftLoginInitiated();
    // 篡改时间为 31 分钟前
    const raw = store.get("@xiaomahuDraftLoginAt");
    store.set("@xiaomahuDraftLoginAt", String(Number(raw) - 31 * 60 * 1000));
    expect(await shouldKeepDraftAfterLogin()).toBe(false);
  });

  it("checkin 存草稿时打标记；登录成功后按门控决定清留", () => {
    const checkinSrc = read("app/(tabs)/checkin.tsx");
    expect(checkinSrc).toContain("await markDraftLoginInitiated()");
    const authSrc = read("lib/auth-providers.ts");
    // navigateAfterLogin：无延续标记时清除草稿
    expect(authSrc).toContain("shouldKeepDraftAfterLogin");
    expect(authSrc).toContain("clearCheckInDraft");
  });
});

// ── #6 session-events 去重（真实行为） ───────────────────────────────
describe("#6 会话过期通知：每个 token 只提醒一次", () => {
  it("notify 触发监听器", () => {
    const seen: string[] = [];
    const unsub = onSessionExpired((r) => seen.push(r));
    notifySessionExpired("expired");
    expect(seen).toEqual(["expired"]);
    unsub();
  });

  it("第二次 notify 被去重（防批量请求的 alert 风暴）", () => {
    const seen: string[] = [];
    const unsub = onSessionExpired((r) => seen.push(r));
    notifySessionExpired("expired");
    notifySessionExpired("expired");
    notifySessionExpired("deleted");
    expect(seen).toEqual(["expired"]);
    unsub();
  });

  it("reset 后可再提醒（重新登录后）", () => {
    const seen: string[] = [];
    const unsub = onSessionExpired((r) => seen.push(r));
    notifySessionExpired("expired");
    resetSessionExpiredFlag();
    notifySessionExpired("deleted");
    expect(seen).toEqual(["expired", "deleted"]);
    unsub();
  });

  it("取消订阅后不再收到", () => {
    const seen: string[] = [];
    const unsub = onSessionExpired((r) => seen.push(r));
    unsub();
    notifySessionExpired("expired");
    expect(seen).toEqual([]);
  });

  it("trpc fetch 包装检测 401/403 注销；api.ts 401 通知；setSessionToken 重置标记", () => {
    const trpcSrc = read("lib/trpc.ts");
    expect(trpcSrc).toContain("notifySessionExpired");
    expect(trpcSrc).toContain("response.status === 401");
    expect(trpcSrc).toContain("账号已注销");
    const apiSrc = read("lib/_core/api.ts");
    expect(apiSrc).toContain("notifySessionExpired");
    const authSrc = read("lib/_core/auth.ts");
    expect(authSrc).toContain("resetSessionExpiredFlag");
    const layoutSrc = read("app/_layout.tsx");
    expect(layoutSrc).toContain("onSessionExpired");
    expect(layoutSrc).toContain("登录已过期");
    expect(layoutSrc).toContain("账号已注销");
  });
});

// ── #2/#3 注销：墓碑 + 级联清理（源码结构） ──────────────────────────
describe("#2/#3 注销：墓碑防复活 + 孤儿数据清理", () => {
  it("deleted_users 墓碑表存在（schema + auto-migration）", () => {
    expect(read("drizzle/schema.ts")).toContain('mysqlTable("deleted_users"');
    expect(read("server/db.ts")).toContain("CREATE TABLE IF NOT EXISTS deleted_users");
  });

  it("deleteUserByOpenId：先立墓碑，再清成员身份和孤儿房间", () => {
    const dbSrc = read("server/db.ts");
    expect(dbSrc).toContain("deletedUsers");
    expect(dbSrc).toContain("DELETE FROM family_members WHERE userId");
    // 孤儿房间（无成员剩下）级联删房间数据
    expect(dbSrc).toContain("elder_profiles");
    expect(dbSrc).toContain("DELETE FROM family_rooms WHERE id");
  });

  it("authenticateRequest：墓碑存在时拒绝复活，不再自动 upsert", () => {
    const sdkSrc = read("server/_core/sdk.ts");
    expect(sdkSrc).toContain("isUserDeleted");
    expect(sdkSrc).toContain("账号已注销");
  });
});

// ── #4 加入家庭：服务端错误透出（源码结构） ──────────────────────────
describe("#4 加入家庭错误不再统一显示邀请码不正确", () => {
  it("cloudJoinRoom 返回服务端错误文案而不是 null", () => {
    const src = read("lib/cloud-sync.ts");
    expect(src).toContain("error: isTransportError");
  });

  it("joinFamilyRoom 返回 JoinFamilyResult，失败时带 message", () => {
    const src = read("lib/storage.ts");
    expect(src).toContain("JoinFamilyResult");
    expect(src).toContain("ok: false, message: serverMessage");
  });

  it("三个调用方都用 result.ok / result.message", () => {
    expect(read("app/(tabs)/family.tsx")).toContain("result.message");
    expect(read("app/profile.tsx")).toContain("setJoinError(result.message)");
    const obSrc = read("app/onboarding.tsx");
    expect(obSrc).toContain("!result.ok");
    expect(obSrc).toContain("result.message");
  });
});

// ── #5 OAuth 失败页出口 ──────────────────────────────────────────────
describe("#5 OAuth 失败页不再是死胡同", () => {
  it("有再试一次和返回登录按钮", () => {
    const src = read("app/oauth/callback.tsx");
    expect(src).toContain("再试一次");
    expect(src).toContain("返回登录");
    expect(src).toContain('router.replace("/login"');
  });
});

// ── #7 游客各 tab 登录引导 ───────────────────────────────────────────
describe("#7 游客在各 tab 有明确登录引导", () => {
  it("用药页：游客空状态是去登录，不是家庭成员文案", () => {
    const src = read("app/(tabs)/medication.tsx");
    expect(src).toContain("isGuest");
    expect(src).toContain("去登录 ›");
  });

  it("日记页：游客空状态给登录引导", () => {
    const src = read("app/(tabs)/diary.tsx");
    expect(src).toContain("登录后开始记录");
  });

  it("护理总结页：游客不显示永远失败的重新生成", () => {
    const src = read("app/assistant.tsx");
    expect(src).toContain("setIsGuest(true)");
  });

  it("日记发布 AUTH_REQUIRED 有去登录按钮", () => {
    const src = read("app/diary-edit.tsx");
    expect(src).toContain("AUTH_REQUIRED");
    // 同一 Alert 内有去登录按钮
    const idx = src.indexOf("AUTH_REQUIRED");
    const near = src.slice(idx, idx + 1200);
    expect(near).toContain("去登录");
  });
});
