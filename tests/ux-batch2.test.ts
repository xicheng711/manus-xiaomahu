import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

// UX batch2 结构回归测试：源码级断言，防止改版回退。
// 不渲染组件（RN 渲染依赖重），只校验关键结构真实存在。

const read = (p: string) =>
  fs.readFileSync(path.join(__dirname, "..", p), "utf8");

// emoji 区间（杂项符号 + 表情符号块），CJK 文字不在此区间内
const EMOJI_RE = /[☀-➿🌀-🙏🚀-🛿]/u;

describe("ux-batch2: 底部 Tab 不再用 emoji", () => {
  const src = read("app/(tabs)/_layout.tsx");

  it("TabIcon 用 AppIcon 渲染", () => {
    expect(src).toContain("from \"@/components/app-icons\"");
    expect(src).toContain("<AppIcon");
  });

  it("layout 文件里没有任何 emoji", () => {
    expect(EMOJI_RE.test(src)).toBe(false);
  });

  it("五个 tab 都有 TAB_CONFIG 配置", () => {
    const icons = read("components/app-icons.tsx");
    for (const key of ["index:", "checkin:", "medication:", "diary:", "family:"]) {
      expect(icons).toContain(key);
    }
  });
});

describe("ux-batch2: 首页未打卡只有一个主 CTA", () => {
  const src = read("app/(tabs)/index.tsx");

  it("智能摘要卡只在 morningDone 后渲染", () => {
    // EnhancedSmartCard 的渲染被 {morningDone && ( 包裹，未打卡时不出现
    expect(src).toMatch(/\{morningDone && \(\s*<EnhancedSmartCard/s);
  });

  it("打卡横幅始终是主 CTA", () => {
    expect(src).toContain("<EnhancedCheckinBanner");
  });
});

describe("ux-batch2: 登录页", () => {
  const src = read("app/login.tsx");

  it("使用原生 Apple 登录按钮（审核要求）", () => {
    // 用户要求：必须用原生 AppleAuthenticationButton，否则苹果审核不通过
    expect(src).toContain("AppleAuthentication.AppleAuthenticationButton");
    expect(src).toContain("AppleAuthenticationButtonType.CONTINUE");
    expect(src).toContain("AppleAuthenticationButtonStyle.BLACK");
  });

  it("非 iOS 时提示仅支持 iOS 设备", () => {
    expect(src).toContain("仅支持 iOS 设备");
    expect(src).toContain("appleUnavailableText");
  });

  it("协议整行热区 ≥44pt", () => {
    expect(src).toMatch(/agreementHit:\s*\{\s*minHeight:\s*44/);
    expect(src).toMatch(/style=\{styles\.agreementHit\}[\s\S]{0,200}onPress=\{handleCheckToggle\}/);
  });

  it("协议链接仍可分别打开", () => {
    expect(src).toContain("xtdtinthemorning.cn/terms.html");
    expect(src).toContain("xtdtinthemorning.cn/privacy.html");
  });
});

describe("ux-batch2: joiner 用药只读页有真实下一步", () => {
  const src = read("app/(tabs)/medication.tsx");

  it("只读提示是可点的，跳到家庭页", () => {
    expect(src).toContain("去家庭页联系主照顾者");
    expect(src).toMatch(/<TouchableOpacity[\s\S]{0,300}style=\{styles\.joinerNotice\}/);
  });

  it("空状态也有家庭页入口", () => {
    const pushes = src.match(/router\.push\('\/\(tabs\)\/family'/g) ?? [];
    expect(pushes.length).toBeGreaterThanOrEqual(2);
  });

  it("没有假的联系按钮（不假设手机号）", () => {
    expect(src).not.toMatch(/tel:|Linking\.openURL\(['"]tel/);
  });
});

describe("ux-batch2: 日记空状态去重", () => {
  const src = read("app/(tabs)/diary.tsx");

  it("空列表时右上角'写日记'按钮隐藏", () => {
    expect(src).toMatch(/\{!editMode && hasAnyContent && \(/);
  });

  it("空状态保留唯一的'开始第一篇日记'主操作", () => {
    expect(src).toContain("开始第一篇日记");
  });
});

describe("ux-batch2: 家庭页次按钮弱化", () => {
  const src = read("app/(tabs)/family.tsx");

  it("'加入已有空间'是透明底描边按钮", () => {
    expect(src).toMatch(/secondaryBtn:\s*\{[^}]*backgroundColor:\s*['"]transparent['"]/);
  });

  it("次按钮去掉 emoji", () => {
    expect(src).toContain(">加入已有空间</Text>");
    expect(src).not.toContain("🔗 加入已有空间");
  });
});

describe("ux-batch2: 图标库", () => {
  const src = read("components/app-icons.tsx");

  it("导出 AppIcon", () => {
    expect(src).toContain("export function AppIcon");
  });

  it("C 版线条风格：stroke 圆头、无填充", () => {
    expect(src).toContain('strokeLinecap="round"');
    expect(src).toContain('fill="none"');
  });
});
