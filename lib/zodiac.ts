/**
 * 十二生肖工具
 * 根据出生年份计算生肖，返回对应的 emoji 和名称
 */

export interface ZodiacInfo {
  emoji: string;
  name: string;
  color: string;
  bgColor: string;
  description: string;
}

const ZODIACS: ZodiacInfo[] = [
  { emoji: '🐀', name: '鼠', color: '#5C6BC0', bgColor: '#EEF0FB', description: '机智灵活，充满活力' },
  { emoji: '🐂', name: '牛', color: '#6D4C41', bgColor: '#EFEBE9', description: '勤劳踏实，忠诚可靠' },
  { emoji: '🐅', name: '虎', color: '#F57C00', bgColor: '#FFF3E0', description: '勇敢威猛，充满热情' },
  { emoji: '🐇', name: '兔', color: '#EC407A', bgColor: '#FCE4EC', description: '温柔善良，心思细腻' },
  { emoji: '🐉', name: '龙', color: '#D32F2F', bgColor: '#FFEBEE', description: '尊贵吉祥，充满魅力' },
  { emoji: '🐍', name: '蛇', color: '#388E3C', bgColor: '#E8F5E9', description: '智慧深邃，优雅从容' },
  { emoji: '🐎', name: '马', color: '#1976D2', bgColor: '#E3F2FD', description: '自由奔放，精力充沛' },
  { emoji: '🐑', name: '羊', color: '#7B1FA2', bgColor: '#F3E5F5', description: '温和善良，富有爱心' },
  { emoji: '🐒', name: '猴', color: '#F9A825', bgColor: '#FFFDE7', description: '聪明伶俐，活泼好动' },
  { emoji: '🐓', name: '鸡', color: '#E64A19', bgColor: '#FBE9E7', description: '勤奋认真，积极向上' },
  { emoji: '🐕', name: '狗', color: '#5D4037', bgColor: '#EFEBE9', description: '忠诚友善，值得信赖' },
  { emoji: '🐖', name: '猪', color: '#C2185B', bgColor: '#FCE4EC', description: '憨厚可爱，心地善良' },
];

/**
 * 根据出生年份获取生肖信息
 * 生肖以1900年（鼠年）为基准
 */
export function getZodiac(birthYear: number): ZodiacInfo {
  const index = ((birthYear - 1900) % 12 + 12) % 12;
  return ZODIACS[index];
}

/**
 * 根据出生日期字符串 (YYYY-MM-DD 或 YYYY) 获取生肖
 */
export function getZodiacFromDate(dateStr: string): ZodiacInfo {
  const year = parseInt(dateStr.slice(0, 4), 10);
  if (isNaN(year)) return ZODIACS[6]; // 默认马
  return getZodiac(year);
}

/**
 * 获取所有生肖列表（用于选择器）
 */
export function getAllZodiacs(): ZodiacInfo[] {
  return ZODIACS;
}

/**
 * 生成生肖年份列表（用于选择器）
 * 返回最近100年内该生肖对应的年份
 */
export function getZodiacYears(zodiacIndex: number): number[] {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = currentYear; y >= currentYear - 100; y--) {
    if (((y - 1900) % 12 + 12) % 12 === zodiacIndex) {
      years.push(y);
    }
  }
  return years;
}
