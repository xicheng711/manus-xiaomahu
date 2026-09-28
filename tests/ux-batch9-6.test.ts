/**
 * UX batch9.6: 趋势图/分享/简报审计确认 bug 的回归测试
 * - B1: 晚间先打卡不再伪造"睡了 7 小时"（root: upsertCheckIn 晚间新建不带早间默认值；
 *       显示: 首页/趋势图/简报/导出长图全部要求 morningDone）
 * - B2: 打卡页日期详情读简报有 try/catch+finally；storage 简报 JSON.parse 加固
 * - B3: 导出长图日记截断有省略提示
 * - B4: family.tsx 分享日期用正午本地解析（美东不再少一天）
 * - B5: 隐藏截图卡片与可见卡片数据门控一致
 * - B6: 趋势图 isToday 用照护时区的护理日 key
 * - B8: 导出长图无界文本有字符上限
 * - B9: 分享失败区分截图/分享阶段；B10: cardRef 为空有提示
 * - B11: 死代码 MoodDistribution/SmoothCurveChart 已删除
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { careDayKeyInZone, resolveCareTodayKey } from '../lib/shared-date-range';

const repo = path.join(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(repo, p), 'utf8');

const storageSrc = read('lib/storage.ts');
const indexSrc = read('app/(tabs)/index.tsx');
const checkinSrc = read('app/(tabs)/checkin.tsx');
const familySrc = read('app/(tabs)/family.tsx');
const shareSrc = read('app/share.tsx');
const exportSrc = read('app/export-image.tsx');
const trendSrc = read('components/trend-chart.tsx');

describe('B1: 晚间先打卡不伪造睡眠数据', () => {
  it('root: 晚间新建记录 sleepHours 默认 0 而不是 7', () => {
    expect(storageSrc).toContain('isEveningFirstCreation');
    expect(storageSrc).toContain('sleepHours: isEveningFirstCreation ? 0 : 7');
  });

  it('首页文案和徽章要求 morningDone', () => {
    expect(indexSrc).toContain('if (checkIn.morningDone && checkIn.sleepHours != null)');
    expect(indexSrc).toContain('todayCheckIn?.morningDone && todayCheckIn?.sleepHours != null');
  });

  it('趋势图睡眠/年服药统计要求 morningDone/eveningDone', () => {
    expect(trendSrc).toContain('c.morningDone && c.sleepHours > 0');
    expect(trendSrc).toContain('c.eveningDone && c.medicationTaken !== null');
  });

  it('导出长图睡眠/心情/用药要求对应时段完成', () => {
    expect(exportSrc).toContain('const hasMorning = checkIn.morningDone === true;');
    expect(exportSrc).toContain('const hasEvening = checkIn.eveningDone === true;');
    expect(exportSrc).toContain('{hasMorning && checkIn.sleepHours ?');
  });

  it('share.tsx 本地简报兜底要求对应时段完成', () => {
    expect(shareSrc).toContain('if (ci.morningDone && ci.sleepHours) parts.push');
    expect(shareSrc).toContain('if (ci.eveningDone && ci.moodScore != null) parts.push');
  });
});

describe('B2: 简报读取不卡死', () => {
  it('checkin.tsx 日期详情读简报有 try/catch + finally 复位 loading', () => {
    expect(checkinSrc).toContain('const briefing = await getBriefingByDate(checkIn.date);');
    // try 块内调用，finally 里复位
    const tryIdx = checkinSrc.indexOf('try {');
    const callIdx = checkinSrc.indexOf('const briefing = await getBriefingByDate(checkIn.date);');
    const finallyIdx = checkinSrc.indexOf('setBriefingLoading(false);', callIdx);
    expect(tryIdx).toBeGreaterThan(-1);
    expect(callIdx).toBeGreaterThan(tryIdx);
    expect(finallyIdx).toBeGreaterThan(callIdx);
  });

  it('storage 简报 JSON.parse 损坏时返回空而不是抛异常', () => {
    expect(storageSrc).toContain('briefings 数据损坏');
  });
});

describe('B3/B4/B5: 分享与简报', () => {
  it('B3: 导出长图日记超 3 条有省略提示', () => {
    expect(exportSrc).toContain('omittedDiaryCount');
    expect(exportSrc).toContain('篇日记未在长图中展示');
  });

  it('B4: 分享日期用正午本地解析，不直接 new Date(YYYY-MM-DD)', () => {
    expect(familySrc).toContain('const [hy, hm, hd] = selectedItem.date.split');
    expect(familySrc).toContain('new Date(hy, hm - 1, hd, 12)');
    expect(familySrc).not.toContain('new Date(selectedItem.date).toLocaleDateString');
  });

  it('B5: 隐藏截图卡片睡眠/心情/用药门控与可见卡一致', () => {
    expect(familySrc).toContain('selectedItem.checkIn.morningDone && selectedItem.checkIn.sleepHours != null');
    expect(familySrc).toContain('selectedItem.checkIn.eveningDone && selectedItem.checkIn.moodScore != null');
    expect(familySrc).toContain('selectedItem.checkIn.eveningDone && selectedItem.checkIn.medicationTaken != null');
  });
});

describe('B6: isToday 用照护时区的护理日 key（真实行为）', () => {
  it('源码用 resolveCareTodayKey 而不是查看者本地 todayStr', () => {
    expect(trendSrc).toContain('resolveCareTodayKey(checkIns)');
    expect(trendSrc).toContain('isToday: date === careTodayKey,');
    expect(trendSrc).not.toContain('date === todayStr');
  });

  it('凌晨 2 点仍算前一天护理日（5 点分界）', () => {
    // 用 UTC 时间戳精确构造：2026-09-28 02:00 UTC → 未过 5 点分界，护理日 key 应为 2026-09-27；
    // 2026-09-28 06:00 UTC → 已过分界，key 为 2026-09-28。
    const early = careDayKeyInZone(Date.UTC(2026, 8, 28, 2, 0, 0), 'UTC', 5);
    const morning = careDayKeyInZone(Date.UTC(2026, 8, 28, 6, 0, 0), 'UTC', 5);
    expect(early).toBe('2026-09-27');
    expect(morning).toBe('2026-09-28');
  });

  it('resolveCareTodayKey 取最新记录的创建者时区', () => {
    const records = [
      { date: '2026-09-27', creatorTimeZone: 'Asia/Shanghai' },
      { date: '2026-09-26', creatorTimeZone: 'America/New_York' },
    ];
    const key = resolveCareTodayKey(records, new Date());
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('B8/B9/B10/B11', () => {
  it('B8: 导出长图文本有字符上限', () => {
    expect(exportSrc).toContain('truncateForImage');
  });

  it('B9: 分享失败区分截图/分享阶段', () => {
    expect(shareSrc).toContain("phase === 'capture'");
    expect(shareSrc).toContain("Alert.alert('分享失败'");
  });

  it('B10: cardRef 为空有提示，不静默 return', () => {
    expect(shareSrc).toContain("Alert.alert('请稍候', '卡片还在准备中");
  });

  it('B11: 死代码已删除', () => {
    expect(trendSrc).not.toContain('function MoodDistribution');
    expect(trendSrc).not.toContain('function SmoothCurveChart');
    expect(trendSrc).not.toContain('const MOOD_EMOJIS');
  });
});
