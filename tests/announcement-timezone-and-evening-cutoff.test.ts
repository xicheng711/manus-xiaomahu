import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  CARE_DAY_ROLLOVER_HOUR,
  getAnnouncementViewerDateKey,
  getCareDayKey,
  isLateNightCareWindow,
  localDateKey,
  resolveCheckInFormTargetDate,
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

  it('places the same Beijing-midnight publication into the correct local day for Beijing and New York viewers', () => {
    const originalTimezone = process.env.TZ;
    const createdAt = '2026-09-09T16:17:00.000Z'; // 9/10 00:17 in Beijing; 9/9 12:17 in New York.
    try {
      process.env.TZ = 'Asia/Shanghai';
      expect(getAnnouncementViewerDateKey({ createdAt, date: '2026-09-10' })).toBe('2026-09-10');
      process.env.TZ = 'America/New_York';
      expect(getAnnouncementViewerDateKey({ createdAt, date: '2026-09-10' })).toBe('2026-09-09');
    } finally {
      process.env.TZ = originalTimezone;
    }
  });

  it('retains legacy date only when an old announcement has no valid absolute publication timestamp', () => {
    expect(getAnnouncementViewerDateKey({
      date: '2026-09-09',
      createdAt: 'not-a-date',
    })).toBe('2026-09-09');
  });

  it('keeps 00:00–04:59 evening saves in the previous care day and starts a new care day at 05:00', () => {
    expect(CARE_DAY_ROLLOVER_HOUR).toBe(5);
    expect(isLateNightCareWindow(new Date(2026, 8, 10, 4, 59))).toBe(true);
    expect(isLateNightCareWindow(new Date(2026, 8, 10, 5, 0))).toBe(false);
    expect(getCareDayKey(new Date(2026, 8, 10, 0, 17))).toBe('2026-09-09');
    expect(getCareDayKey(new Date(2026, 8, 10, 4, 59))).toBe('2026-09-09');
    expect(getCareDayKey(new Date(2026, 8, 10, 5, 0))).toBe('2026-09-10');
  });

  it('locks the selected evening record when entering the form instead of recalculating at save time', () => {
    // The 9/9 record is visible and selected. It remains the target even if entry begins or ends after 05:00 on 9/10.
    const selectedDate = resolveCheckInFormTargetDate({
      mode: 'evening',
      loadedRecordDate: '2026-09-09',
      useLoadedRecord: true,
      openedAt: new Date(2026, 8, 10, 5, 30),
    });
    expect(selectedDate).toBe('2026-09-09');

    // If no record has been selected, the entry-time care-day rule supplies the initial target.
    expect(resolveCheckInFormTargetDate({
      mode: 'evening',
      openedAt: new Date(2026, 8, 10, 0, 17),
    })).toBe('2026-09-09');
    expect(resolveCheckInFormTargetDate({
      mode: 'evening',
      openedAt: new Date(2026, 8, 10, 5, 0),
    })).toBe('2026-09-10');

    // An explicit history/backfill selection always wins.
    expect(resolveCheckInFormTargetDate({
      mode: 'evening',
      backfillDate: '2026-09-07',
      loadedRecordDate: '2026-09-09',
      useLoadedRecord: true,
      openedAt: new Date(2026, 8, 10, 20, 0),
    })).toBe('2026-09-07');
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
    expect(family).toContain("{ann.emoji ? ann.emoji + ' ' : ''}{ann.content}");
    expect(family).not.toContain('<Text style={card.content} numberOfLines');
    expect(family).toContain('const optimistic = await toggleAnnouncementReaction(');
    expect(family).toContain('const result = await cloudToggleReaction(');
    expect(family).toContain('setAnnouncementReactionSnapshot(');
    expect(family).not.toContain('await loadData(true);\n                  }}');
    expect(family).not.toContain('if (!optimistic || activeFamilyRef.current !== requestedFamilyId) return;');
    expect(family).toContain('Complete the operation against the family captured at tap time');

    const storage = read('lib/storage.ts');
    expect(storage).toContain('const key = roomKey(KEYS.FAMILY_ANNOUNCEMENTS, rid);');
    expect(storage).toContain('Promise<FamilyAnnouncement | null>');
  });

  it('saves to the record selected on entry, reloads that same record and shows its date in the form', () => {
    const checkin = read('app/(tabs)/checkin.tsx');

    expect(checkin).toContain('const formTargetRef = useRef<{');
    expect(checkin).toContain('const targetDate = resolveCheckInFormTargetDate({');
    expect(checkin).toContain('// Never recalculate from the save time: this is the exact record selected on entry.');
    expect(checkin).toContain('const effectiveDate = formTarget.date;');
    expect(checkin).not.toContain("const effectiveDate = backfillDate || (mode === 'evening' ? getCareDayKey() : todayStr());");
    expect(checkin).toContain('const data: Partial<DailyCheckIn> & { date: string } = {');
    expect(checkin).toContain('date: effectiveDate,');
    expect(checkin).toContain('clientId: formTarget.clientId,');
    expect(checkin).toContain('serverCheckInId: formTarget.serverCheckInId,');
    expect(checkin).toContain('const refreshed = await getCheckInByDate(effectiveDate, familyId);');
    expect(checkin).toContain('<Text style={styles.date}>{formDateLabel}</Text>');
    expect(checkin).toContain('lateNightCareWindow={!backfillDate && isLateNightCareWindow()}');
    expect(checkin).toContain('前完成的晚间记录仍计入{careDayLabel}护理日');
    expect(checkin).toContain('const morningTime = morningDone && !eveningDone && checkIn?.completedAt');
  });
});
