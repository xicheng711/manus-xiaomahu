/**
 * 护理日（05:00 分界）工具：服务端用。
 *
 * 客户端打卡/趋势都按"凌晨 5 点分界"的护理日归属日期（lib/shared-date-range.ts
 * 的 CARE_DAY_ROLLOVER_HOUR）。服务端判"补打卡"必须用同一口径，
 * 否则纽约凌晨 2 点补前一个护理日会被自然日口径误判。
 */

/** 护理日分界小时：0–5 点仍属前一个护理日。 */
export const CARE_DAY_ROLLOVER_HOUR = 5;

/**
 * 取指定 IANA 时区此刻的护理日（YYYY-MM-DD）。
 * 时区缺失/非法时返回 null —— 调用方应保守处理（不判补录），
 * 绝不能回退到 UTC 误判。
 */
export function careDayStrInTimeZone(
  tz: string | undefined,
  now: Date = new Date(),
): string | null {
  if (!tz) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', hour12: false,
    }).formatToParts(now);
    const get = (t: string) => parts.find(p => p.type === t)?.value;
    const hour = Number(get('hour')) % 24;
    let y = Number(get('year'));
    let m = Number(get('month'));
    let d = Number(get('day'));
    if (!Number.isFinite(hour) || !Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
    if (hour < CARE_DAY_ROLLOVER_HOUR) {
      // 凌晨 0–5 点仍属前一个护理日。
      const dt = new Date(Date.UTC(y, m - 1, d));
      dt.setUTCDate(dt.getUTCDate() - 1);
      y = dt.getUTCFullYear(); m = dt.getUTCMonth() + 1; d = dt.getUTCDate();
    }
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${y}-${pad(m)}-${pad(d)}`;
  } catch {
    return null;
  }
}

/**
 * 是否补打卡：记录日期早于创建者时区的当前护理日。
 * 时区缺失/非法 → false（保守用普通"完成了"标题）。
 */
export function isBackfillDate(
  recordDate: string,
  creatorTimeZone: string | undefined,
  now: Date = new Date(),
): boolean {
  const todayCareDay = careDayStrInTimeZone(creatorTimeZone, now);
  return todayCareDay !== null && recordDate < todayCareDay;
}
