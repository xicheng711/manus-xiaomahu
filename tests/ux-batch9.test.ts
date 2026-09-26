/**
 * UX Batch9 测试：补打卡选择器
 *
 * 用户反馈：点"补打卡"直接自动进入昨晚表单，应该先让用户选日期+选早/晚。
 *
 * 本批次：
 * 1. "补打卡"按钮走 backfillPick=1，不再直接带 backfillDate 自动进表单
 * 2. 打卡页收到 backfillPick=1 时弹出选择器：最近 7 天 × 早间/晚间状态
 * 3. 用户选了某天某时段后，才带 backfillDate + backfillPeriod 进表单
 * 4. backfillPeriod 让补录支持早间（之前写死 evening）；标题按日期+时段显示
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO = path.resolve(__dirname, '..');
const CHECKIN = fs.readFileSync(path.join(REPO, 'app/(tabs)/checkin.tsx'), 'utf8');
const FAMILY = fs.readFileSync(path.join(REPO, 'app/(tabs)/family.tsx'), 'utf8');

describe('补打卡入口走选择器（不再自动进表单）', () => {
  it('打卡页"昨天还没打卡"卡片的补打卡按钮用 backfillPick=1', () => {
    expect(CHECKIN).toContain("params: { backfillPick: '1' }");
  });

  it('打卡页不再用 backfillDate 直接跳转（旧的自动进表单入口已移除）', () => {
    // onBackfillYesterday 里不再出现 backfillDate: yesterdayKey
    const m = CHECKIN.match(/onBackfillYesterday=\{[\s\S]*?\}\}/);
    expect(m).toBeTruthy();
    expect(m![0]).not.toContain('backfillDate');
  });

  it('家人页"去补打卡"按钮也走 backfillPick=1', () => {
    expect(FAMILY).toContain("params: { backfillPick: '1' }");
    expect(FAMILY).not.toMatch(/params: \{ backfillDate: item\.date \}/);
  });
});

describe('补打卡选择器 UI', () => {
  it('有 showBackfillPicker 状态和 Modal', () => {
    expect(CHECKIN).toContain('showBackfillPicker');
    expect(CHECKIN).toContain('<Modal');
    expect(CHECKIN).toContain('visible={showBackfillPicker}');
  });

  it('选择器展示最近 7 天，每行有日期 label 和早间/晚间状态', () => {
    expect(CHECKIN).toContain('backfillStatus');
    expect(CHECKIN).toContain('morningDone');
    expect(CHECKIN).toContain('eveningDone');
    // 7 天循环
    expect(CHECKIN).toMatch(/for \(let i = 0; i < 7; i\+\+\)/);
  });

  it('已完成的时段显示 ✅ 且不可点，缺失的时段显示"补早间/补晚间"按钮', () => {
    expect(CHECKIN).toContain('补{periodLabel}');
    expect(CHECKIN).toContain('✅');
  });

  it('选中后带 backfillDate + backfillPeriod 进表单', () => {
    expect(CHECKIN).toContain('backfillDate: day.date, backfillPeriod: period');
  });

  it('收到 backfillPick=1 后清掉参数，避免返回时重复弹出', () => {
    expect(CHECKIN).toContain('backfillPick');
    expect(CHECKIN).toContain("router.setParams({ backfillPick: undefined }");
  });
});

describe('backfillPeriod：补录支持早间', () => {
  it('params 声明了 backfillPeriod', () => {
    expect(CHECKIN).toContain('backfillPeriod?: string');
  });

  it('补录表单 mode 不再写死 evening，用 backfillPeriod', () => {
    expect(CHECKIN).toContain('mode: backfillPeriod');
    // 旧的写死 evening 已移除
    expect(CHECKIN).not.toMatch(/date: targetDate,\n\s*mode: 'evening',/);
  });

  it('setMode 也用 backfillPeriod（之前写死 evening）', () => {
    expect(CHECKIN).toContain('backfillDate ? backfillPeriod :');
  });

  it('标题按日期+时段显示（补昨日早间 / 补昨日晚间 / 补9月23日晚间）', () => {
    expect(CHECKIN).toContain('backfillTitle');
    expect(CHECKIN).toContain('补${dateLabel}${periodLabel}');
  });
});
