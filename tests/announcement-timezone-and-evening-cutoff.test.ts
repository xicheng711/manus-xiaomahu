import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  getAnnouncementViewerDateKey,
  getCareDayKey,
  localDateKey,
} from '../lib/shared-date-range';

const root = path.resolve(__dirname, '..');
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('announcement viewer-time and care-day boundaries', () => {
  it('uses the viewer-local absolute publication timestamp instead of the author date for announcements', () => {
    const viewedAt = new Date();
    expect(getAnnouncementViewerDateKey({
      // A legacy author date must not change an announcement's viewer-local calendar bucket.
      date: '1999-01-01',
      createdAt: viewedAt.toISOString(),
    })).toBe(localDateKey(viewedAt));
  });

  it('retains legacy date only when an old announcement has no valid absolute publication timestamp', () => {
    expect(getAnnouncementViewerDateKey({
      date: '2026-09-09',
      createdAt: 'not-a-date',
    })).toBe('2026-09-09');
  });

  it('keeps 00:00–04:59 evening saves in the previous care day and starts a new care day at 05:00', () => {
    expect(getCareDayKey(new Date(2026, 8, 10, 0, 17))).toBe('2026-09-09');
    expect(getCareDayKey(new Date(2026, 8, 10, 4, 59))).toBe('2026-09-09');
    expect(getCareDayKey(new Date(2026, 8, 10, 5, 0))).toBe('2026-09-10');
  });

  it('uses viewer-local announcement buckets in the family list, briefing and joiner activity feed', () => {
    const family = read('app/(tabs)/family.tsx');
    const joinerHome = read('components/joiner-home.tsx');

    expect(family).toContain('getAnnouncementViewerDateKey(announcement) === viewerToday');
    expect(family).toContain('getAnnouncementViewerDateKey(announcement) === dateKey');
    expect(family).not.toContain('const todayAnnouncements = announcements.filter(a => a.date === todayStr());');
    expect(joinerHome).toContain('getAnnouncementViewerDateKey(announcement) === _todayKey');
  });

  it('keeps the full announcement card reachable and applies reactions optimistically before cloud confirmation', () => {
    const family = read('app/(tabs)/family.tsx');

    expect(family).toContain('inlinePostButton');
    expect(family).not.toContain('Compose FAB — round circle');
    expect(family).toContain('const optimistic = await toggleAnnouncementReaction(');
    expect(family).toContain('const result = await cloudToggleReaction(');
    expect(family).toContain('setAnnouncementReactionSnapshot(');
    expect(family).not.toContain('await loadData(true);\n                  }}');
  });

  it('saves an after-midnight evening check-in under the previous care-day key and reloads that same key', () => {
    const checkin = read('app/(tabs)/checkin.tsx');

    expect(checkin).toContain("const effectiveDate = backfillDate || (mode === 'evening' ? getCareDayKey() : todayStr());");
    expect(checkin).toContain('const data: Partial<DailyCheckIn> & { date: string } = { date: effectiveDate };');
    expect(checkin).toContain('const refreshed = await getCheckInByDate(effectiveDate, familyId);');
  });
});
