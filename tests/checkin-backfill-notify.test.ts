/**
 * 补打卡家人通知
 *
 * 用户需求：补上前一天/之前的打卡后，家人要收到通知 "xx补上了xx天的打卡"，
 * 而不是含糊的"完成了打卡"（家人会误会成今天的）。
 *
 * 实现：server/family-router.ts 的 syncCheckIn 里，用 server/care-day.ts 的
 * isBackfillDate（05:00 护理日口径，与客户端一致）判断。仍只在完成状态首次
 * false→true 时通知，断网重试/资料补写不会重复打扰。
 * 时区缺失/非法时保守不判补录，绝不回退 UTC 误判。
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { careDayStrInTimeZone, isBackfillDate } from '../server/care-day';

const REPO = path.resolve(__dirname, '..');
const ROUTER = fs.readFileSync(path.join(REPO, 'server/family-router.ts'), 'utf8');

describe('补打卡家人通知', () => {
  it('仍只在完成状态首次 false→true 时通知（断网重试/补写不重复打扰）', () => {
    expect(ROUTER).toContain('newlyFinishedEvening');
    expect(ROUTER).toContain('newlyFinishedMorning');
    expect(ROUTER).toContain('只在完成状态首次 false→true 时通知');
  });

  it('补打卡标题带日期："xx补上了M月d日的X间打卡"', () => {
    expect(ROUTER).toContain('补上了${dateLabel}的${period}打卡');
  });

  it('用 isBackfillDate（护理日口径）判断，而非自然日', () => {
    expect(ROUTER).toContain('isBackfillDate(safeInput.date, safeInput.creatorTimeZone)');
    expect(ROUTER).not.toContain('todayStrInTimeZone');
  });

  it('补打卡兜底文案不写"今日"，避免误导家人', () => {
    expect(ROUTER).toContain('点击查看${dateLabel}的照护记录');
  });

  it('syncCheckIn 的 date 必须是 YYYY-MM-DD', () => {
    expect(ROUTER).toMatch(/syncCheckIn[\s\S]{0,800}date: z\.string\(\)\.regex\(\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\//);
  });

  it('纽约 02:00：前一个护理日（昨天日期）不是补录，前天才是', () => {
    // 2026-09-28 02:00 EDT = 06:00 UTC；护理日仍是 2026-09-27。
    const now = new Date('2026-09-28T06:00:00Z');
    expect(careDayStrInTimeZone('America/New_York', now)).toBe('2026-09-27');
    expect(isBackfillDate('2026-09-27', 'America/New_York', now)).toBe(false);
    expect(isBackfillDate('2026-09-26', 'America/New_York', now)).toBe(true);
  });

  it('纽约 06:00（05:00 后）：昨天日期是补录', () => {
    const now = new Date('2026-09-28T10:00:00Z'); // 06:00 EDT
    expect(careDayStrInTimeZone('America/New_York', now)).toBe('2026-09-28');
    expect(isBackfillDate('2026-09-27', 'America/New_York', now)).toBe(true);
    expect(isBackfillDate('2026-09-28', 'America/New_York', now)).toBe(false);
  });

  it('跨月边界：10 月 1 日凌晨 2 点的护理日是 9 月 30 日', () => {
    const now = new Date('2026-10-01T06:00:00Z'); // 10-01 02:00 EDT
    expect(careDayStrInTimeZone('America/New_York', now)).toBe('2026-09-30');
    expect(isBackfillDate('2026-09-30', 'America/New_York', now)).toBe(false);
    expect(isBackfillDate('2026-09-29', 'America/New_York', now)).toBe(true);
  });

  it('北京时区同样按 05:00 护理日', () => {
    // 2026-09-28 04:30 CST(UTC+8) = 2026-09-27 20:30 UTC；护理日是 2026-09-27。
    const now = new Date('2026-09-27T20:30:00Z');
    expect(careDayStrInTimeZone('Asia/Shanghai', now)).toBe('2026-09-27');
    expect(isBackfillDate('2026-09-27', 'Asia/Shanghai', now)).toBe(false);
  });

  it('时区缺失/非法：保守不判补录（不用普通标题误导，也不回退 UTC）', () => {
    const now = new Date('2026-09-28T10:00:00Z');
    expect(careDayStrInTimeZone(undefined, now)).toBeNull();
    expect(careDayStrInTimeZone('Mars/Olympus_Mons', now)).toBeNull();
    // 即使是很久以前的日期，没有可信时区也不判补录。
    expect(isBackfillDate('2020-01-01', undefined, now)).toBe(false);
    expect(isBackfillDate('2020-01-01', 'Mars/Olympus_Mons', now)).toBe(false);
    expect(isBackfillDate('2020-01-01', '', now)).toBe(false);
  });

  it('日期标签格式：YYYY-MM-DD → M月d日', () => {
    const formatMonthDay = (dateStr: string): string => {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
      if (!m) return dateStr;
      return `${Number(m[2])}月${Number(m[3])}日`;
    };
    expect(formatMonthDay('2026-09-27')).toBe('9月27日');
    expect(formatMonthDay('2026-01-05')).toBe('1月5日');
    expect(formatMonthDay('garbage')).toBe('garbage');
  });
});
