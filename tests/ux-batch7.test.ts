/**
 * UX batch7: 昨日漏打卡提醒 + 一键补打卡
 * 1. getYesterdayCareDayKey：返回昨天护理日的 key（凌晨 00:00–04:59 仍属前一护理日）
 * 2. 打卡页检测昨日是否漏打卡，landing 显示提醒卡（新用户不打扰、补录模式不显示）
 * 3. 点击走现有 backfillDate 补录流程
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { getYesterdayCareDayKey, getCareDayKey } from '../lib/shared-date-range';

const repo = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(repo, 'app/(tabs)/checkin.tsx'), 'utf8');

describe('ux-batch7: getYesterdayCareDayKey', () => {
  it('返回昨天护理日的 key', () => {
    // 2026-09-25 中午：护理日是 09-25，昨天护理日是 09-24
    const noon = new Date(2026, 8, 25, 12, 0, 0);
    expect(getCareDayKey(noon)).toBe('2026-09-25');
    expect(getYesterdayCareDayKey(noon)).toBe('2026-09-24');
  });

  it('凌晨 2 点：护理日仍是前一天，昨天护理日再往前一天', () => {
    // 2026-09-25 凌晨 2 点：护理日是 09-24，昨天护理日是 09-23
    const lateNight = new Date(2026, 8, 25, 2, 0, 0);
    expect(getCareDayKey(lateNight)).toBe('2026-09-24');
    expect(getYesterdayCareDayKey(lateNight)).toBe('2026-09-23');
  });

  it('月初边界：9月1日 的昨天护理日是 8月31日', () => {
    const first = new Date(2026, 8, 1, 12, 0, 0);
    expect(getYesterdayCareDayKey(first)).toBe('2026-08-31');
  });
});

describe('ux-batch7: 漏打卡检测逻辑', () => {
  it('检测昨天护理日是否有打卡记录', () => {
    expect(src).toContain('getYesterdayCareDayKey()');
    expect(src).toContain('yesterdayDone');
  });

  it('新用户（无任何打卡）不显示提醒', () => {
    expect(src).toMatch(/all\.length > 0 && !yesterdayDone/);
  });

  it('补录模式下不显示提醒（避免自己打扰自己）', () => {
    expect(src).toMatch(/!backfillDate && all\.length > 0/);
  });
});

describe('ux-batch7: 提醒卡片 UI', () => {
  it('landing 显示"昨天还没打卡"提醒卡', () => {
    expect(src).toContain('昨天还没打卡');
    expect(src).toContain('missedCard');
  });

  it('卡片上有"补打卡"按钮', () => {
    expect(src).toContain('补打卡');
  });

  it('点击走补打卡选择器（batch9 起用 backfillPick，不再直接 backfillDate）', () => {
    expect(src).toContain("params: { backfillPick: '1' }");
    expect(src).not.toMatch(/backfillDate:\s*yesterdayKey/);
  });

  it('CheckinLanding 接收 missedYesterday 相关 props', () => {
    expect(src).toContain('missedYesterday={missedYesterday}');
    expect(src).toContain('onBackfillYesterday');
  });
});
