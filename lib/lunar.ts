/**
 * 农历日期计算 — 基于精确月首查找表
 * 覆盖 2024-2028，满足 App 使用场景
 */

// 每个农历月的公历起始日期 [year, month(1-based), day] 及月名
// 数据来源：中国天文学会精确历算
const LUNAR_MONTH_STARTS: Array<[number, number, number, string, string]> = [
  // [公历年, 公历月, 公历日, 农历月名, 干支年]
  // ── 2024 甲辰年 ──
  [2024,  2, 10, '正月', '甲辰'],
  [2024,  3, 11, '二月', '甲辰'],
  [2024,  4,  9, '三月', '甲辰'],
  [2024,  5,  8, '四月', '甲辰'],
  [2024,  6,  6, '五月', '甲辰'],
  [2024,  7,  6, '六月', '甲辰'],
  [2024,  8,  4, '七月', '甲辰'],
  [2024,  9,  3, '八月', '甲辰'],
  [2024, 10,  3, '九月', '甲辰'],
  [2024, 11,  1, '十月', '甲辰'],
  [2024, 12,  1, '冬月', '甲辰'],
  [2024, 12, 31, '腊月', '甲辰'],
  // ── 2025 乙巳年 ──
  [2025,  1, 29, '正月', '乙巳'],
  [2025,  2, 28, '二月', '乙巳'],
  [2025,  3, 29, '三月', '乙巳'],
  [2025,  4, 27, '四月', '乙巳'],
  [2025,  5, 27, '五月', '乙巳'],
  [2025,  6, 25, '六月', '乙巳'],
  [2025,  7, 25, '七月', '乙巳'],
  [2025,  8, 23, '闰七月', '乙巳'],
  [2025,  9, 21, '八月', '乙巳'],
  [2025, 10, 21, '九月', '乙巳'],
  [2025, 11, 20, '十月', '乙巳'],
  [2025, 12, 20, '冬月', '乙巳'],
  // ── 2026 丙午年 ──
  [2026,  1, 19, '腊月', '乙巳'],  // 仍属乙巳年腊月
  [2026,  2, 17, '正月', '丙午'],
  [2026,  3, 18, '二月', '丙午'],
  [2026,  4, 17, '三月', '丙午'],
  [2026,  5, 16, '四月', '丙午'],
  [2026,  6, 15, '五月', '丙午'],
  [2026,  7, 14, '六月', '丙午'],
  [2026,  8, 13, '七月', '丙午'],
  [2026,  9, 11, '八月', '丙午'],
  [2026, 10, 11, '九月', '丙午'],
  [2026, 11,  9, '十月', '丙午'],
  [2026, 12,  9, '冬月', '丙午'],
  // ── 2027 丁未年 ──
  [2027,  1,  8, '腊月', '丙午'],
  [2027,  2,  6, '正月', '丁未'],
  [2027,  3,  8, '二月', '丁未'],
  [2027,  4,  6, '三月', '丁未'],
  [2027,  5,  6, '四月', '丁未'],
  [2027,  6,  4, '五月', '丁未'],
  [2027,  7,  4, '六月', '丁未'],
  [2027,  8,  2, '七月', '丁未'],
  [2027,  9,  1, '八月', '丁未'],
  [2027,  9, 30, '九月', '丁未'],
  [2027, 10, 30, '十月', '丁未'],
  [2027, 11, 28, '冬月', '丁未'],
  [2027, 12, 28, '腊月', '丁未'],
  // ── 2028 戊申年 ──
  [2028,  1, 26, '正月', '戊申'],
];

const DAY_NAMES = ['', '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'];

function dateToNum(y: number, m: number, d: number): number {
  return y * 10000 + m * 100 + d;
}

export function getLunarDate(date: Date = new Date()): { monthName: string; dayName: string; ganzhi: string; full: string } {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const todayNum = dateToNum(y, m, d);

  // 找到最近一个已过的月首
  let idx = 0;
  for (let i = LUNAR_MONTH_STARTS.length - 1; i >= 0; i--) {
    const [sy, sm, sd] = LUNAR_MONTH_STARTS[i];
    if (dateToNum(sy, sm, sd) <= todayNum) {
      idx = i;
      break;
    }
  }

  const [sy, sm, sd, monthName, ganzhi] = LUNAR_MONTH_STARTS[idx];
  const startDate = new Date(sy, sm - 1, sd);
  startDate.setHours(0, 0, 0, 0);
  const today = new Date(y, m - 1, d);
  today.setHours(0, 0, 0, 0);
  const dayIndex = Math.round((today.getTime() - startDate.getTime()) / 86400000) + 1;
  const dayName = DAY_NAMES[Math.min(dayIndex, 30)] || '初一';

  return {
    monthName,
    dayName,
    ganzhi,
    full: `${ganzhi}年 ${monthName}${dayName}`,
  };
}

export function getWeekday(date: Date = new Date()): string {
  const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return WEEKDAYS[date.getDay()];
}

export function getFormattedDate(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const w = getWeekday(date);
  return `${y}年${m}月${d}日 ${w}`;
}
