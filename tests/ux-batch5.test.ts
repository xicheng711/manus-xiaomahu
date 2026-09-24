/**
 * UX batch5: batch4 遗留的三个视觉/代码问题修复
 * 1. family.tsx: 活跃 Tab 去掉双层 padding（活跃态曾比非活跃态高 22px）
 * 2. checkin.tsx: 睡眠时长徽标在"时间有误"时背景/边框同步变红（曾红字配绿底）
 * 3. checkin.tsx: PopupIconRow textStyle 从 any 收紧为 StyleProp<TextStyle>
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const repo = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(repo, p), 'utf8');

describe('ux-batch5: family section tab padding', () => {
  const src = read('app/(tabs)/family.tsx');

  it('sectionTabGradient 不再自带 paddingVertical（避免活跃态双层 padding）', () => {
    const m = src.match(/sectionTabGradient:\s*\{([^}]*)\}/);
    expect(m).toBeTruthy();
    expect(m![1]).not.toContain('paddingVertical');
  });

  it('sectionTabInner 保留 paddingVertical，保证两态高度一致', () => {
    const m = src.match(/sectionTabInner:\s*\{([^}]*)\}/);
    expect(m).toBeTruthy();
    expect(m![1]).toContain('paddingVertical');
  });
});

describe('ux-batch5: checkin 睡眠时长错误态', () => {
  const src = read('app/(tabs)/checkin.tsx');

  it('新增 segmentDurationBadgeError 红色系样式', () => {
    expect(src).toContain('segmentDurationBadgeError');
    // 红色系背景 + 边框，与绿色默认态区分
    expect(src).toMatch(/segmentDurationBadgeError:\s*\{\s*backgroundColor:\s*'#FEF2F2',\s*borderColor:\s*'#FECACA'\s*\}/);
  });

  it('时长有误时徽标应用错误样式', () => {
    expect(src).toContain('isErr && styles.segmentDurationBadgeError');
  });

  it('默认徽标仍是绿色系（正常态不受影响）', () => {
    expect(src).toMatch(/segmentDurationBadge:\s*\{\s*alignSelf:\s*'center',\s*backgroundColor:\s*'#F0FDF4'/);
  });
});

describe('ux-batch5: PopupIconRow 类型收紧', () => {
  const src = read('app/(tabs)/checkin.tsx');

  it('textStyle 不再是 any', () => {
    expect(src).not.toMatch(/textStyle:\s*any/);
  });

  it('使用 StyleProp<TextStyle>', () => {
    expect(src).toContain('textStyle: StyleProp<TextStyle>');
  });
});
