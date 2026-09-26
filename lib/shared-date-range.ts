export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** A care day closes at 05:00 instead of midnight. */
export const CARE_DAY_ROLLOVER_HOUR = 5;

export function isLateNightCareWindow(
  now = new Date(),
  rolloverHour = CARE_DAY_ROLLOVER_HOUR,
): boolean {
  return now.getHours() < rolloverHour;
}

/**
 * This lets a caregiver finish an evening check-in shortly after midnight
 * without splitting one day's morning and evening records into separate entries.
 */
export function getCareDayKey(
  now = new Date(),
  rolloverHour = CARE_DAY_ROLLOVER_HOUR,
): string {
  const careDay = new Date(now);
  if (isLateNightCareWindow(careDay, rolloverHour)) careDay.setDate(careDay.getDate() - 1);
  return localDateKey(careDay);
}

export function resolveCheckInFormTargetDate(options: {
  mode: 'morning' | 'evening';
  backfillDate?: string | null;
  loadedRecordDate?: string | null;
  useLoadedRecord?: boolean;
  openedAt?: Date;
}): string {
  const { mode, backfillDate, loadedRecordDate, useLoadedRecord = false, openedAt = new Date() } = options;
  if (backfillDate && /^\d{4}-\d{2}-\d{2}$/.test(backfillDate)) return backfillDate;
  if (useLoadedRecord && loadedRecordDate && /^\d{4}-\d{2}-\d{2}$/.test(loadedRecordDate)) {
    return loadedRecordDate;
  }
  // 早间和晚间都用护理日（凌晨 5 点分界），与打卡页加载（getCareDayKey）和
  // 连续打卡统计保持一致。之前早间用自然日、晚间用护理日，导致 0–5 点做的
  // 早间打卡存到了"今天"，而页面显示的是"昨天"的护理日记录，看起来像没打（miss）。
  return getCareDayKey(openedAt);
}

/** 昨天护理日的 key（用于检测漏打卡）。注意凌晨 00:00–04:59 仍属于前一护理日。 */
export function getYesterdayCareDayKey(
  now = new Date(),
  rolloverHour = CARE_DAY_ROLLOVER_HOUR,
): string {
  const todayKey = getCareDayKey(now, rolloverHour);
  const d = new Date(`${todayKey}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return localDateKey(d);
}

/**
 * Announcements are point-in-time events. Unlike a caregiver's daily check-in,
 * they should appear under the calendar day of the person currently viewing them.
 * Prefer the absolute creation time and retain the author-entered date only as a
 * safe legacy fallback for old records without a valid timestamp.
 */
export function getAnnouncementViewerDateKey(
  announcement: { createdAt?: string | Date | null; date?: string | null },
  now = new Date(),
): string {
  const createdAt = announcement.createdAt;
  const timestamp = createdAt instanceof Date
    ? createdAt
    : typeof createdAt === 'string'
      ? new Date(createdAt)
      : null;
  if (timestamp && Number.isFinite(timestamp.getTime())) return localDateKey(timestamp);
  const legacyDate = announcement.date ?? '';
  return /^\d{4}-\d{2}-\d{2}$/.test(legacyDate) ? legacyDate : localDateKey(now);
}

export function parseDateKeyAtNoon(key: string): Date | null {
  const match = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
  return localDateKey(parsed) === key ? parsed : null;
}

/**
 * Shared family records are dated in the writer's local calendar. Around midnight,
 * a Beijing caregiver can legitimately have a date one day ahead of a New York
 * viewer. Anchor current trends to that newest valid date, but never trust records
 * farther than one calendar day in the future.
 */
export function resolveSharedDataAnchorDate(
  records: Array<{ date?: string | null }>,
  now = new Date(),
): Date {
  const todayKey = localDateKey(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = localDateKey(tomorrow);
  const newestKey = records
    .map(item => item.date ?? '')
    .filter(key => /^\d{4}-\d{2}-\d{2}$/.test(key) && key <= tomorrowKey)
    .sort()
    .at(-1);
  if (newestKey && newestKey > todayKey) {
    return parseDateKeyAtNoon(newestKey) ?? now;
  }
  return now;
}

/**
 * 选择家庭共享数据的“当前”记录。记录日期属于填写者的本地日历，
 * 所以跨时区查看时允许最新有效记录比查看者本地日期领先一天。
 *
 * 如果知道填写者的时区（careTimeZone，记录上的 creatorTimeZone），优先用
 * "填写者时区的护理今天"精确匹配；没有时区信息（旧数据）时才回退到
 * 原来的 ±1 天容忍逻辑。
 */
export function findCurrentSharedRecord<T extends { date?: string | null }>(
  records: T[],
  now = new Date(),
  careTimeZone?: string | null,
): T | null {
  if (isValidTimeZone(careTimeZone)) {
    const careTodayKey = careDayKeyInZone(now, careTimeZone as string);
    const exact = records.find(record => record.date === careTodayKey);
    if (exact) return exact;
  }
  const anchorKey = localDateKey(resolveSharedDataAnchorDate(records, now));
  return records.find(record => record.date === anchorKey) ?? null;
}

export function buildRecentDateKeys(anchor: Date, length = 7): string[] {
  return Array.from({ length }, (_, index) => {
    const date = new Date(anchor);
    date.setDate(date.getDate() - index);
    return localDateKey(date);
  });
}

// ─── 打卡时区 ────────────────────────────────────────────────────────────────
// 打卡记录由主照顾者创建，`date` 是创建者本地的护理日（凌晨 5 点分界）。
// 家人在其它时区查看时，必须用创建者的时区算"今天"，而不是查看者的本地今天，
// 否则同一条记录在两边会掉进不同的日子，显示成"未打卡（miss）"，尽管对方明明打了。

export const DEFAULT_TIME_ZONE = 'UTC';

/** 是否为合法 IANA 时区名。 */
export function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz || typeof tz !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/** 设备当前 IANA 时区；拿不到时返回 'UTC'（调用方按未知时区处理）。 */
export function deviceTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (isValidTimeZone(tz)) return tz;
  } catch {
    /* 忽略，走 fallback */
  }
  return DEFAULT_TIME_ZONE;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * 在指定 IANA 时区取某一时刻的 YYYY-MM-DD。
 * 时区非法时回退到 UTC，保证永远返回合法格式。
 */
export function dateKeyInZone(at: Date | number, timeZone: string): string {
  const tz = isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(at));
  const get = (type: string): string => parts.find(p => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * 指定时区的护理日 key：凌晨 rolloverHour 点之前仍算前一天。
 * 纯按日历字段推算，不做毫秒级位移，避免夏令时切换日算错日子。
 */
export function careDayKeyInZone(
  at: Date | number,
  timeZone: string,
  rolloverHour: number = CARE_DAY_ROLLOVER_HOUR,
): string {
  const tz = isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(new Date(at));
  const get = (type: string): string => parts.find(p => p.type === type)?.value ?? '';
  let hour = Number(get('hour'));
  if (hour === 24) hour = 0; // 部分 ICU 用 24 表示午夜
  let y = Number(get('year'));
  let m = Number(get('month'));
  let d = Number(get('day'));
  if (hour < rolloverHour) {
    const shifted = new Date(Date.UTC(y, m - 1, d) - 86400000);
    y = shifted.getUTCFullYear();
    m = shifted.getUTCMonth() + 1;
    d = shifted.getUTCDate();
  }
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/**
 * 这些记录所属的"照护时区"：取日期最新的那条记录的创建者时区（创建者搬家换时区时，
 * 以最新记录为准）；都没有时回退到 fallback（默认设备时区），再不行回退到 UTC。
 */
export function resolveCareTimeZone(
  records: Array<{ date?: string | null; creatorTimeZone?: string | null }>,
  fallback?: string,
): string {
  let best: string | null = null;
  let bestDate = '';
  for (const r of records) {
    const tz = r?.creatorTimeZone;
    if (!isValidTimeZone(tz)) continue;
    const d = typeof r?.date === 'string' ? r.date : '';
    if (best === null || d >= bestDate) {
      best = tz as string;
      bestDate = d;
    }
  }
  if (best) return best;
  const fb = fallback ?? deviceTimeZone();
  return isValidTimeZone(fb) ? fb : DEFAULT_TIME_ZONE;
}

/**
 * "照护的今天"：在照护时区（创建者时区）里按护理日规则算出的今天 key。
 * 查看者用它去匹配记录的 date，而不是用自己手机的本地今天。
 */
export function resolveCareTodayKey(
  records: Array<{ date?: string | null; creatorTimeZone?: string | null }>,
  now: Date | number = new Date(),
  rolloverHour: number = CARE_DAY_ROLLOVER_HOUR,
): string {
  return careDayKeyInZone(now, resolveCareTimeZone(records), rolloverHour);
}
