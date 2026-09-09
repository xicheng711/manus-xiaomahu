export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Announcements are point-in-time events. Unlike a caregiver's daily check-in,
 * they should appear under the calendar day of the person currently viewing them.
 * Prefer the absolute creation time and retain the author-entered date only as a
 * safe legacy fallback for old records without a valid timestamp.
 */
/**
 * A care day closes at 05:00 rather than 00:00. This lets a caregiver finish an
 * evening check-in shortly after midnight without splitting one day's morning
 * and evening records into separate calendar entries.
 */
export function getCareDayKey(now = new Date(), rolloverHour = 5): string {
  const careDay = new Date(now);
  if (careDay.getHours() < rolloverHour) careDay.setDate(careDay.getDate() - 1);
  return localDateKey(careDay);
}

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
 */
export function findCurrentSharedRecord<T extends { date?: string | null }>(
  records: T[],
  now = new Date(),
): T | null {
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
