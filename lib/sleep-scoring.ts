/**
 * 小马虎睡眠评分引擎 v1.0
 *
 * 规则引擎（非AI）— 将 SleepInput 转化为：
 * - score: 0-100 睡眠综合评分
 * - problems: 推导出的问题标签（传给AI，AI负责解读，不自己分析）
 *
 * 评分维度参考 NSF / AASM 老年睡眠指南：
 * 1. 总睡眠时长 (35分) — 老年推荐 7-9h
 * 2. 夜醒次数    (15分) — NSF: ≤2次为优
 * 3. 夜间清醒时长 (20分) — WASO≤30min为优
 * 4. 白天小睡    (15分) — 短nap(<20min)可接受，傍晚长nap不佳
 * 5. 入睡潜伏期  (15分) — 可选，<15min为优
 *
 * AI只负责：解读分数、生成建议、给情感支持
 * AI不负责：重新分析数据、改变分数
 */

import { SleepInput } from './storage';

export interface SleepAnalysis {
  score: number;        // 0-100
  problems: string[];   // e.g. ["睡眠碎片化", "夜醒频繁"]
  breakdown: {          // 各维度得分（用于"解释扣分"透明度）
    duration: number;
    awakenings: number;
    waso: number;
    nap: number;
    latency: number;
  };
}

// ─── 各维度评分表 ─────────────────────────────────────────────────────────────

const DURATION_SCORE: Record<SleepInput['nightSleepDuration'], number> = {
  lt4:    4,   // 严重不足
  '4to6': 18,  // 不足
  '6to7': 28,  // 略不足
  '7to9': 35,  // 推荐范围（满分）
  gt9:    30,  // 过长（老年认知障碍场景不等于更好）
};

const AWAKENING_SCORE: Record<SleepInput['awakenCount'], number> = {
  '0':     15,  // 无醒 — 理想
  '1to2':  12,  // NSF可接受范围
  '3to4':   7,  // 睡眠碎片化
  '5plus':  2,  // 严重碎片化
};

const WASO_SCORE: Record<SleepInput['awakeDuration'], number> = {
  none:     20,  // <10min
  '10to30': 16,  // NSF可接受
  '30to60':  8,  // 偏长
  gt60:      2,  // 显著影响睡眠效率
};

const NAP_SCORE: Record<NonNullable<SleepInput['napDuration']>, number> = {
  none:     15,  // 无小睡
  lt20:     13,  // 短nap(<20min)，研究表明有益
  '20to60': 10,  // 稍长
  gt60:      4,  // 过长，影响夜间睡眠节律
};

const LATENCY_SCORE: Record<NonNullable<SleepInput['sleepLatency']>, number> = {
  fast:      15,  // <15min
  normal:    12,  // 15-30min
  slow:       7,  // 30-60min
  very_slow:  2,  // >60min
};

// ─── 问题标签生成 ─────────────────────────────────────────────────────────────

function deriveProblems(input: SleepInput, breakdown: SleepAnalysis['breakdown']): string[] {
  const p: string[] = [];

  // 睡眠时长
  if (input.nightSleepDuration === 'lt4') p.push('睡眠严重不足');
  else if (input.nightSleepDuration === '4to6') p.push('睡眠时间偏少');
  else if (input.nightSleepDuration === 'gt9') p.push('睡眠时间偏长');

  // 夜醒
  if (input.awakenCount === '3to4') p.push('夜间频繁醒来');
  else if (input.awakenCount === '5plus') p.push('夜间醒来次数过多');

  // WASO
  if (input.awakeDuration === 'gt60') p.push('夜间长时间无法入睡');
  else if (input.awakeDuration === '30to60') p.push('夜间清醒较久');

  // 碎片化（夜醒 + WASO 组合判断）
  if (breakdown.awakenings <= 7 && breakdown.waso <= 8) {
    p.push('睡眠碎片化');
  }

  // 小睡
  if (input.napDuration === 'gt60') p.push('白天小睡过多');
  else if (input.napDuration === '20to60') p.push('白天小睡偏长');

  // 入睡困难
  if (input.sleepLatency === 'very_slow') p.push('入睡非常困难');
  else if (input.sleepLatency === 'slow') p.push('入睡困难');

  // 来自用户标签
  if (input.tags?.includes('很早醒')) p.push('睡眠节律提前（早醒）');
  if (input.tags?.includes('起夜多次')) p.push('起夜频繁');
  if (input.tags?.includes('白天犯困')) p.push('白天嗜睡');
  if (input.tags?.includes('晚上烦躁')) p.push('夜间躁动不安');

  // 去重
  return [...new Set(p)];
}

// ─── 主评分函数 ───────────────────────────────────────────────────────────────

export function scoreSleepInput(input: SleepInput): SleepAnalysis {
  const duration   = DURATION_SCORE[input.nightSleepDuration] ?? 20;
  const awakenings = AWAKENING_SCORE[input.awakenCount] ?? 10;
  const waso       = WASO_SCORE[input.awakeDuration] ?? 12;
  const nap        = NAP_SCORE[input.napDuration ?? 'none'] ?? 13;
  const latency    = input.sleepLatency ? LATENCY_SCORE[input.sleepLatency] : null;

  const breakdown = { duration, awakenings, waso, nap, latency: latency ?? 0 };

  // 最大可能分数（有/无 latency 数据）
  const maxPossible = latency !== null ? 100 : 85;
  const rawTotal = duration + awakenings + waso + nap + (latency ?? 0);

  const score = Math.round((rawTotal / maxPossible) * 100);
  const problems = deriveProblems(input, breakdown);

  return {
    score: Math.max(0, Math.min(100, score)),
    problems,
    breakdown,
  };
}

// ─── 分数转展示文字 ───────────────────────────────────────────────────────────

export function getSleepScoreLabel(score: number): string {
  if (score >= 85) return '睡眠质量优秀';
  if (score >= 70) return '睡眠质量良好';
  if (score >= 55) return '睡眠质量一般';
  if (score >= 40) return '睡眠质量较差';
  return '睡眠质量很差';
}
