/**
 * 夜醒字段统一 + 连续打卡计算：纯函数，无任何 RN/Expo 依赖，可直接在 node 里测试。
 */

// ─── 夜醒字段统一 ─────────────────────────────────────────────────────────────
// canonical 字段是 nightWakings（数字）：server / 云端同步 / AI / 评分引擎都只认它。
// nightAwakenings（'没醒'/'1-2次'/…）是 v4.0 旧展示字段，仅用于兼容历史本地数据。

export type AwakenCountKey = '0' | '1to2' | '3to4' | '5plus';

/** 数字 → v4.0 展示字符串（写入时保持两处一致） */
export function nightWakingsToLabel(n: number): string {
  if (n <= 0) return '没醒';
  if (n <= 2) return '1-2次';
  if (n <= 4) return '3-4次';
  return '5次以上';
}

/** 数字 → v4.1 评分引擎枚举键（写入时保持一致） */
export function nightWakingsToKey(n: number): AwakenCountKey {
  if (n <= 0) return '0';
  if (n <= 2) return '1to2';
  if (n <= 4) return '3to4';
  return '5plus';
}

/** 旧展示字符串 → 数字（读取历史数据时用） */
export function parseNightAwakeningsLabel(label?: string): number | undefined {
  switch (label) {
    case '没醒': return 0;
    case '1-2次': return 1;
    case '3-4次': return 3;
    case '5次以上': return 5;
    default: return undefined;
  }
}

/**
 * 统一读取夜醒次数。
 * - 新记录：nightWakings 与 nightAwakenings 在保存时已保持一致，优先用数字。
 * - 旧记录：两种写法可能打架（一个是用户当时点的，一个是另一个输入框的残留），
 *   启发式取"更像用户真实输入"的那个：数字 > 0 优先数字，否则用旧字符串。
 * - 都没有 → undefined（无法计算/没有记录）。
 */
export function getNightWakings(c: {
  nightWakings?: number;
  nightAwakenings?: string;
}): number | undefined {
  if (typeof c.nightWakings === 'number' && c.nightWakings > 0) return c.nightWakings;
  const legacy = parseNightAwakeningsLabel(c.nightAwakenings);
  if (legacy !== undefined) return legacy;
  if (typeof c.nightWakings === 'number') return c.nightWakings;
  return undefined;
}

// ─── 连续打卡 ────────────────────────────────────────────────────────────────

/**
 * 计算连续打卡天数。
 * @param doneDates 已按日期倒序排好的去重打卡日期（YYYY-MM-DD）
 * @param todayKey 今天的照护日期 key
 * @returns 天数；没有任何打卡记录时返回 null（UI 显示"—"，区别于"0天"）
 */
export function computeStreak(doneDates: string[], todayKey: string): number | null {
  let count = 0;
  let prev: string | null = null;
  for (const d of doneDates) {
    if (prev === null) {
      const diffFromToday = (new Date(todayKey).getTime() - new Date(d).getTime()) / 86400000;
      if (diffFromToday <= 1) { count = 1; prev = d; } else break;
    } else {
      const diff = (new Date(prev).getTime() - new Date(d).getTime()) / 86400000;
      if (diff === 1) { count++; prev = d; } else break;
    }
  }
  return count === 0 ? null : count;
}
