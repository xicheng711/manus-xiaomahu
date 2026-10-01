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
 *
 * The three helpers below are the single source of truth for announcement time:
 * grouping (viewerDateKey), ordering (sortTime) and display (format function)
 * must all derive from the same instant so a card can never be grouped by one
 * clock and labelled by another.
 */
export function getAnnouncementPublishedAt(
  announcement: { createdAt?: string | Date | null },
): Date | null {
  const createdAt = announcement.createdAt;
  const timestamp = createdAt instanceof Date
    ? createdAt
    : typeof createdAt === 'string'
      ? new Date(createdAt)
      : null;
  return timestamp && Number.isFinite(timestamp.getTime()) ? timestamp : null;
}

export function getAnnouncementViewerDateKey(
  announcement: { createdAt?: string | Date | null; date?: string | null },
  now = new Date(),
): string {
  const publishedAt = getAnnouncementPublishedAt(announcement);
  if (publishedAt) return localDateKey(publishedAt);
  const legacyDate = announcement.date ?? '';
  return /^\d{4}-\d{2}-\d{2}$/.test(legacyDate) ? legacyDate : localDateKey(now);
}

/**
 * 把公告分成"今日"和"历史"两组，组内按新到旧排序。
 * viewerKey > 查看者今天的记录（发布者本地已跨日、查看者还在前一天，通常是
 * 没有有效 createdAt 的老记录兜底）是最新的公告，归入今日顶部；
 * 只有 viewerKey 严格早于今天的才算历史。不能用 !== 区分，否则未来日期
 * 会被丢进历史（如 10/2 00:38 显示在 10/1 18:49 之下）。
 */
export function partitionAnnouncementsByViewerDay<
  T extends { createdAt?: string | Date | null; date?: string | null; localTimeStr?: string | null },
>(
  announcements: T[],
  now = new Date(),
): { today: T[]; older: T[] } {
  const viewerToday = localDateKey(now);
  const withKeys = announcements.map(announcement => ({
    announcement,
    viewerKey: getAnnouncementViewerDateKey(announcement, now),
  }));
  const newestFirst = (x: { announcement: T }, y: { announcement: T }) =>
    getAnnouncementSortTime(y.announcement) - getAnnouncementSortTime(x.announcement);
  return {
    today: withKeys.filter(item => item.viewerKey >= viewerToday).sort(newestFirst).map(item => item.announcement),
    older: withKeys.filter(item => item.viewerKey < viewerToday).sort(newestFirst).map(item => item.announcement),
  };
}

/**
 * Monotonic ordering key for announcements. Uses the absolute publication time
 * when it exists; legacy records without a valid timestamp fall back to
 * date + localTimeStr interpreted in the viewer's locale (the same values the
 * card displays), so grouping, sorting and display never disagree.
 * Records with no usable time at all sort as 0 (oldest / dropped by cutoffs),
 * matching the previous behaviour for corrupt rows.
 */
export function getAnnouncementSortTime(
  announcement: { createdAt?: string | Date | null; date?: string | null; localTimeStr?: string | null },
): number {
  const publishedAt = getAnnouncementPublishedAt(announcement);
  if (publishedAt) return publishedAt.getTime();
  const estimated = estimateAnnouncementCreatedAt(announcement);
  return estimated ? new Date(estimated).getTime() : 0;
}

/**
 * 为没有有效 createdAt 的老记录估算一个绝对发布时间：按查看者本地解读
 * date + localTimeStr（与卡片兜底显示、getAnnouncementSortTime 完全一致）。
 * 实在没有可用日期时返回 null——调用方必须显式处理损坏数据，
 * 绝不允许默写"现在"来伪装。
 */
export function estimateAnnouncementCreatedAt(
  announcement: { date?: string | null; localTimeStr?: string | null },
): string | null {
  const dateMatch = (announcement.date ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateMatch) return null;
  const timeMatch = (announcement.localTimeStr ?? '').match(/^(\d{2}):(\d{2})$/);
  const estimated = new Date(
    Number(dateMatch[1]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[3]),
    timeMatch ? Number(timeMatch[1]) : 12,
    timeMatch ? Number(timeMatch[2]) : 0,
    0,
    0,
  );
  return Number.isFinite(estimated.getTime()) ? estimated.toISOString() : null;
}

/**
 * 公告入库铁律：createdAt 必须是有效绝对时间，解析优先级为
 * 传入值（云端/新建） > 本地原值 > 按 date+localTimeStr 估算（打标 timeEstimated）。
 * 估算失败返回 createdAt: null，由调用方按损坏数据显式处理——
 * 绝不默写"现在"，不把老公告伪造成刚刚发布。
 */
export function resolveAnnouncementCreatedAt(
  candidate: string | Date | null | undefined,
  localCreatedAt?: string | Date | null,
  fallback?: { date?: string | null; localTimeStr?: string | null },
): { createdAt: string | null; timeEstimated: boolean; source: 'candidate' | 'local' | 'estimated' | 'none' } {
  const asIso = (value: string | Date | null | undefined): string | null => {
    const date = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null;
    return date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
  };
  const fromCandidate = asIso(candidate);
  if (fromCandidate) return { createdAt: fromCandidate, timeEstimated: false, source: 'candidate' };
  const fromLocal = asIso(localCreatedAt);
  if (fromLocal) return { createdAt: fromLocal, timeEstimated: false, source: 'local' };
  const estimated = estimateAnnouncementCreatedAt(fallback ?? {});
  if (estimated) return { createdAt: estimated, timeEstimated: true, source: 'estimated' };
  return { createdAt: null, timeEstimated: true, source: 'none' };
}

/**
 * 一次性修复老记录：把没有有效 createdAt 的公告补上估算时间戳并打标，
 * 返回新数组与修复条数。调用方在读取/合并入口执行一次并持久化，
 * 之后所有下游只会看到有效 createdAt，兜底分支只留给损坏数据。
 */
export function repairAnnouncementTimestamps<
  T extends { createdAt?: string | Date | null; date?: string | null; localTimeStr?: string | null; timeEstimated?: boolean },
>(
  announcements: T[],
): { list: T[]; repaired: number } {
  let repaired = 0;
  const list = announcements.map(announcement => {
    if (getAnnouncementPublishedAt(announcement)) return announcement;
    const { createdAt } = resolveAnnouncementCreatedAt(
      announcement.createdAt,
      undefined,
      announcement,
    );
    if (!createdAt) return announcement;
    repaired += 1;
    return { ...announcement, createdAt, timeEstimated: true };
  });
  return { list, repaired };
}

/**
 * Viewer-local "M/D HH:mm" labels for an announcement card, derived from the
 * same instant as getAnnouncementViewerDateKey / getAnnouncementSortTime.
 */
export function formatAnnouncementViewerDateTime(
  announcement: { createdAt?: string | Date | null; date?: string | null; localTimeStr?: string | null },
  now = new Date(),
): { dateLabel: string; timeLabel: string } {
  const publishedAt = getAnnouncementPublishedAt(announcement);
  const currentYear = String(now.getFullYear());
  if (publishedAt) {
    const yearPrefix = publishedAt.getFullYear() === Number(currentYear) ? '' : `${publishedAt.getFullYear()}/`;
    return {
      dateLabel: `${yearPrefix}${publishedAt.getMonth() + 1}/${publishedAt.getDate()} `,
      timeLabel: `${String(publishedAt.getHours()).padStart(2, '0')}:${String(publishedAt.getMinutes()).padStart(2, '0')}`,
    };
  }
  const dateMatch = (announcement.date ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const dateLabel = dateMatch
    ? `${dateMatch[1] === currentYear ? '' : `${dateMatch[1]}/`}${Number(dateMatch[2])}/${Number(dateMatch[3])} `
    : `${announcement.date || ''}${announcement.date ? ' ' : ''}`;
  return { dateLabel, timeLabel: announcement.localTimeStr || '--:--' };
}

export function parseDateKeyAtNoon(key: string): Date | null {
  const match = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
  return localDateKey(parsed) === key ? parsed : null;
}

// ─── 照护日历 key 运算（B7） ──────────────────────────────────────────────
// 趋势图/分享卡的"近 7 天"桶必须按"照护时区"的护理日 key 做日历加减，
// 不能按查看者本地日历建桶：北京创建者、纽约查看者时会错一天，
// 最新记录会掉出窗口，年末还可能年份错位。
// 纯日历字段运算（不做毫秒位移），夏令时切换日也不会算错。

/** key 格式校验。 */
export function isDateKey(key: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(key) && parseDateKeyAtNoon(key) !== null;
}

/** 给 YYYY-MM-DD key 加减 N 个日历天（可为负）。非法 key 原样返回。 */
export function addDaysToDateKey(key: string, days: number): string {
  const parsed = parseDateKeyAtNoon(key);
  if (!parsed) return key;
  // parseDateKeyAtNoon 是本地正午，setDate 按日历加减，不受 DST 影响
  parsed.setDate(parsed.getDate() + days);
  return localDateKey(parsed);
}

/**
 * 以照护今天（careTodayKey）为终点的连续 7 天 key 列表（升序）。
 * offset=0 是本周，offset=-1 是上周，依此类推。
 */
export function buildCareWeekKeys(careTodayKey: string, offset = 0): string[] {
  const endKey = addDaysToDateKey(careTodayKey, offset * 7);
  const startKey = addDaysToDateKey(endKey, -6);
  return Array.from({ length: 7 }, (_, i) => addDaysToDateKey(startKey, i));
}

/** "9月28日 至 10月4日" 风格的区间标签。 */
export function formatDateKeyRangeLabel(keys: string[]): string {
  if (keys.length === 0) return '';
  const fmt = (k: string) => `${Number(k.slice(5, 7))}月${Number(k.slice(8, 10))}日`;
  return `${fmt(keys[0])} 至 ${fmt(keys[keys.length - 1])}`;
}

/** key 对应星期标签（日/一/二/...）。日历日期的星期与时区无关，正午解析保证稳定。 */
export function weekdayLabelOfDateKey(key: string): string {
  const parsed = parseDateKeyAtNoon(key);
  const day = parsed ? parsed.getDay() : new Date(`${key}T12:00:00`).getDay();
  return ['日', '一', '二', '三', '四', '五', '六'][day] ?? '';
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
