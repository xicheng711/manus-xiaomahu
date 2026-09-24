import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

// UX batch3 结构回归测试：源码级断言，防止改版回退。
// 不渲染组件（RN 渲染依赖重），只校验关键结构真实存在。

const read = (p: string) =>
  fs.readFileSync(path.join(__dirname, "..", p), "utf8");

// emoji 区间（杂项符号 + 表情符号块），CJK 文字不在此区间内
const EMOJI_RE = /[☀-➿🌀-🙏🚀-🛿]/u;

describe("ux-batch3: PageHeader 不再用 emoji", () => {
  const src = read("components/page-header.tsx");

  it("PageTheme 用 AppIcon 图标名而非 emoji", () => {
    expect(src).toContain("icon: AppIconName");
    expect(src).toContain("@/components/app-icons");
    expect(src).toContain("<AppIcon");
  });

  it("四个主题图标映射到 AppIcon 名称", () => {
    for (const key of ["checkin", "medication", "diary", "family"]) {
      expect(src).toContain(key);
    }
    // 不再有 theme.emoji 字段
    expect(src).not.toContain("theme.emoji");
    expect(src).not.toContain("emoji: string");
  });

  it("header 文件里没有任何 emoji", () => {
    expect(EMOJI_RE.test(src)).toBe(false);
  });
});

describe("ux-batch3: 家庭页设置区不用 emoji", () => {
  const src = read("app/(tabs)/family.tsx");

  it("设置页用 AppIcon 图标", () => {
    expect(src).toContain("@/components/app-icons");
    expect(src).toContain("<AppIcon");
  });

  it("创建家庭空间按钮没有装饰 emoji", () => {
    expect(src).toContain("创建家庭空间</Text>");
    expect(src).not.toContain("✨ 创建家庭空间");
  });

  it("没有残留 setup.emoji 样式引用", () => {
    expect(src).not.toContain("setup.emoji}");
    expect(src).not.toContain("setup.emoji>");
  });

  it("公告删除按钮有无障碍标签", () => {
    expect(src).toContain("accessibilityLabel={deleteConfirm ?");
  });
});

describe("ux-batch3: 首页加载态不再白屏", () => {
  const src = read("app/(tabs)/index.tsx");

  it("未就绪时显示加载指示器而非 return null", () => {
    expect(src).toContain("ActivityIndicator");
    expect(src).toContain("正在准备小马虎");
    expect(src).not.toMatch(/if\s*\(!ready\)\s*return null;/);
  });

  it("家庭切换胶囊和设置按钮有无障碍标签", () => {
    expect(src).toContain('accessibilityLabel="切换家庭"');
    expect(src).toContain('accessibilityLabel="家庭设置"');
  });
});

describe("ux-batch3: 用药页云端刷新有错误处理", () => {
  const src = read("app/(tabs)/medication.tsx");

  it("Promise.all 包在 try/catch 里", () => {
    expect(src).toMatch(/try\s*\{\s*\n\s*const \[cloudMeds, cloudChanges/s);
    expect(src).toContain("云端刷新失败");
  });

  it("删除按钮有无障碍标签", () => {
    expect(src).toContain("accessibilityLabel={`删除用药");
  });
});

describe("ux-batch3: 打卡日历弹窗渲染 AI 简报", () => {
  const src = read("app/(tabs)/checkin.tsx");

  it("弹窗里渲染 selectedBriefing", () => {
    expect(src).toContain("selectedBriefing.summary");
    expect(src).toContain("selectedBriefing.encouragement");
    expect(src).toContain("当日简报");
  });
});

describe("ux-batch3: 日记页只有一个写日记入口", () => {
  const src = read("app/(tabs)/diary.tsx");

  it("移除了 FAB", () => {
    expect(src).not.toContain("styles.fab");
    expect(src).not.toContain("fabBreath");
  });

  it("保留顶部的写日记按钮", () => {
    expect(src).toContain("写日记</Text>");
  });

  it("删除按钮有无障碍标签", () => {
    expect(src).toContain('accessibilityLabel="删除这篇日记"');
  });
});
