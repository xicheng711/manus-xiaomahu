import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

// UX batch4 结构回归测试：功能型 emoji 统一为 AppIcon 线条图标 + 死代码清理。
// 不渲染组件（RN 渲染依赖重），只校验关键结构真实存在。

const read = (p: string) =>
  fs.readFileSync(path.join(__dirname, "..", p), "utf8");

describe("ux-batch4: app-icons 新增图标名", () => {
  const src = read("components/app-icons.tsx");

  it("新增的图标名都在类型联合里", () => {
    for (const name of [
      "clock", "bell", "pencil", "trash", "chat",
      "link", "megaphone", "sun", "alert", "calendar", "zap", "copy", "plus",
    ]) {
      expect(src).toContain(`'${name}'`);
    }
  });

  it("每个新增图标名都有对应的 case 分支", () => {
    for (const name of [
      "clock", "bell", "pencil", "trash", "chat",
      "link", "megaphone", "sun", "alert", "calendar", "zap", "copy", "plus",
    ]) {
      expect(src).toContain(`case '${name}':`);
    }
  });
});

describe("ux-batch4: medication 页功能图标去 emoji", () => {
  const src = read("app/(tabs)/medication.tsx");

  it("用药时间/备注/提醒/修改/删除用 AppIcon", () => {
    for (const icon of ["clock", "note", "bell", "pencil", "trash", "pill"]) {
      expect(src).toContain(`name="${icon}"`);
    }
  });

  it("不再用目标功能 emoji", () => {
    for (const e of ["🕐", "📝", "🔔", "✏️", "🗑️", "🔕"]) {
      expect(src).not.toContain(e);
    }
  });

  it("用户自选药物图标 MED_ICONS 保留", () => {
    expect(src).toContain("MED_ICONS");
    expect(src).toContain("💊");
  });

  it("删除了无引用的旧样式", () => {
    expect(src).not.toContain("formEmoji");
    expect(src).not.toContain("deleteBtnText");
    expect(src).not.toContain("reminderToggleEmoji");
  });
});

describe("ux-batch4: checkin 页功能图标去 emoji", () => {
  const src = read("app/(tabs)/checkin.tsx");

  it("弹窗与落地页用 AppIcon 行组件", () => {
    expect(src).toContain("PopupIconRow");
    expect(src).toContain("PopupSectionTitle");
  });

  it("不再用目标功能 emoji（SLEEP_RANGE_ICONS / 题目 emoji 圆圈除外）", () => {
    // 🌙🛌/🍽️🥢🚫 在用户可选图标集合中；📝💊🍽️ 在题目配置 emoji 字段（独立视觉模式），均保留
    for (const e of ["📅", "🌅", "⏰", "📊", "⚡️"]) {
      expect(src).not.toContain(e);
    }
    expect(src).toContain("SLEEP_RANGE_ICONS");
    // 草稿横幅已改为图标行
    expect(src).not.toContain("📝 已恢复");
  });

  it("死 import JoinerLockedScreen 已删除", () => {
    expect(src).not.toContain("JoinerLockedScreen");
  });
});

describe("ux-batch4: diary 页功能图标去 emoji", () => {
  const src = read("app/(tabs)/diary.tsx");

  it("删除/阅读/留言/AI 回复用 AppIcon", () => {
    for (const icon of ["trash", "eye", "chat", "heart", "clock"]) {
      expect(src).toContain(`name="${icon}"`);
    }
    // calendar / pencil 以动态表达式使用
    expect(src).toContain("'calendar'");
    expect(src).toContain("'pencil'");
  });

  it("不再用目标功能 emoji", () => {
    for (const e of ["⏳", "🗑️", "👀", "💬", "🩺", "📅"]) {
      expect(src).not.toContain(e);
    }
  });

  it("死代码 JoinerDiaryReadOnly 与 jStyles 已删除", () => {
    expect(src).not.toContain("JoinerDiaryReadOnly");
    expect(src).not.toContain("jStyles");
  });

  it("用户数据 emoji 常量保留", () => {
    // 心情选项是用户记录数据，不应被替换
    expect(src).toContain("moodEmoji");
  });
});

describe("ux-batch4: family 页功能图标去 emoji", () => {
  const src = read("app/(tabs)/family.tsx");

  it("邀请码/公告/简报/复制/设置按钮用 AppIcon", () => {
    for (const icon of ["link", "megaphone", "note", "copy", "book"]) {
      expect(src).toContain(`name="${icon}"`);
    }
    // plus / link 以动态表达式使用
    expect(src).toContain("'plus'");
    expect(src).toContain("'link'");
  });

  it("UI 层不再用目标功能 emoji", () => {
    // 📢 家庭公告 仅保留在外发分享文本中（text +=），UI 标题已改为图标行
    for (const e of ["📢 公告</Text>", "📋 简报</Text>", "📢 发布公告", "📋 今日打卡", "📋 复制邀请链接", "📋 查看简报", "创建 🎉", "加入 🔗"]) {
      expect(src).not.toContain(e);
    }
    // 邀请码胶囊的 🔗 已替换为 link 图标
    expect(src).not.toContain("<Text style={styles.heroCodeIcon}>🔗</Text>");
  });

  it("用户数据与外发文本不受影响", () => {
    // 成员头像 emoji 是用户数据
    expect(src).toContain("authorEmoji");
    // 公告类型 emoji 是内容分类
    expect(src).toContain("ANNOUNCEMENT_TYPES");
    // 外发分享文本保留原样
    expect(src).toContain("📢 家庭公告");
  });
});

describe("ux-batch4: 死代码清理", () => {
  it("index 页删除死 import 与死 state", () => {
    const src = read("app/(tabs)/index.tsx");
    expect(src).not.toContain("getSessionToken");
    expect(src).not.toContain("fadeInUp");
    expect(src).not.toContain("latestCheckIn");
    expect(src).not.toContain("getYesterdayCheckIn");
  });

  it("share 页删除死 handleCopy 相关代码", () => {
    const src = read("app/share.tsx");
    expect(src).not.toContain("handleCopy");
    expect(src).not.toContain("setCopied");
    expect(src).not.toContain("copiedBtn");
    expect(src).not.toContain("expo-clipboard");
  });

  it("reanimated 版本符合要求", () => {
    const pkg = JSON.parse(read("package.json"));
    const ver: string = pkg.dependencies["react-native-reanimated"];
    // 期望 4.1.0 或更高（当前 ~4.1.6）
    expect(ver).toMatch(/4\.(1\.[0-9]+|[2-9])/);
  });
});
