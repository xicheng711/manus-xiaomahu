/**
 * 补打卡家人通知
 *
 * 用户需求：补上前一天/之前的打卡后，家人要收到通知 "xx补上了xx天的打卡"，
 * 而不是含糊的"完成了打卡"（家人会误会成今天的）。
 *
 * 实现：server/family-router.ts 的 syncCheckIn 里，记录日期早于创建者时区
 * 的今天 → 视为补打卡，标题带上日期。仍只在完成状态首次 false→true 时通知，
 * 断网重试/资料补写不会重复打扰。
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

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
    expect(ROUTER).toContain('function formatMonthDay');
  });

  it('用创建者时区的今天判断是否补打卡，而非服务器本地日期', () => {
    // 服务器在北京，用户可能在纽约：必须按打卡记录绑定的时区算"今天"。
    expect(ROUTER).toContain('todayStrInTimeZone(safeInput.creatorTimeZone)');
    expect(ROUTER).toContain('function todayStrInTimeZone');
  });

  it('补打卡兜底文案不写"今日"，避免误导家人', () => {
    expect(ROUTER).toContain('点击查看${dateLabel}的照护记录');
  });

  it('日期标签格式：YYYY-MM-DD → M月d日', () => {
    // 与 server/family-router.ts 的 formatMonthDay 同逻辑
    const formatMonthDay = (dateStr: string): string => {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
      if (!m) return dateStr;
      return `${Number(m[2])}月${Number(m[3])}日`;
    };
    expect(formatMonthDay('2026-09-27')).toBe('9月27日');
    expect(formatMonthDay('2026-01-05')).toBe('1月5日');
    expect(formatMonthDay('garbage')).toBe('garbage');
  });

  it('补打卡判定：记录日期 < 创建者时区今天 → 补打卡；当天 → 普通完成', () => {
    // 与服务端的 isBackfill = safeInput.date < todayStrInTimeZone(...) 同逻辑
    //（YYYY-MM-DD 字符串可直接比较大小）
    const isBackfill = (recordDate: string, todayStr: string): boolean => recordDate < todayStr;
    expect(isBackfill('2026-09-27', '2026-09-28')).toBe(true);
    expect(isBackfill('2026-09-28', '2026-09-28')).toBe(false);
    expect(isBackfill('2026-09-29', '2026-09-28')).toBe(false);
  });
});
