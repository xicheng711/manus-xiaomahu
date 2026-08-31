export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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

export function buildRecentDateKeys(anchor: Date, length = 7): string[] {
  return Array.from({ length }, (_, index) => {
    const date = new Date(anchor);
    date.setDate(date.getDate() - index);
    return localDateKey(date);
  });
}
