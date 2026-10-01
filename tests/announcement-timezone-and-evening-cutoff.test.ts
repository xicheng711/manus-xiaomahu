import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  CARE_DAY_ROLLOVER_HOUR,
  estimateAnnouncementCreatedAt,
  formatAnnouncementViewerDateTime,
  getAnnouncementSortTime,
  getAnnouncementViewerDateKey,
  getCareDayKey,
  isLateNightCareWindow,
  localDateKey,
  partitionAnnouncementsByViewerDay,
  repairAnnouncementTimestamps,
  resolveAnnouncementCreatedAt,
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

  it('resolves createdAt by the hard rule: candidate > local > estimate, never silently stamping now', () => {
    const now = new Date('2026-10-01T19:00:00.000Z');
    // 1. 有效的传入值直接采用，不打标。
    expect(resolveAnnouncementCreatedAt('2026-10-01T18:49:00.000Z', '2020-01-01T00:00:00.000Z', { date: '2026-10-02', localTimeStr: '00:38' }))
      .toEqual({ createdAt: '2026-10-01T18:49:00.000Z', timeEstimated: false, source: 'candidate' });
    // 2. 传入值无效时保留本地原值——绝不默写"现在"。
    expect(resolveAnnouncementCreatedAt('not-a-date', '2026-09-28T10:00:00.000Z', { date: '2026-10-02', localTimeStr: '00:38' }))
      .toEqual({ createdAt: '2026-09-28T10:00:00.000Z', timeEstimated: false, source: 'local' });
    // 3. 都无效时按 date+localTimeStr 估算并打标；估算值是记录本身的时间，不是 now。
    const estimated = resolveAnnouncementCreatedAt('bad', 'also-bad', { date: '2026-10-02', localTimeStr: '00:38' });
    expect(estimated.timeEstimated).toBe(true);
    expect(estimated.source).toBe('estimated');
    expect(estimated.createdAt).toBe(estimateAnnouncementCreatedAt({ date: '2026-10-02', localTimeStr: '00:38' }));
    expect(estimated.createdAt).not.toBe(now.toISOString());
    expect(new Date(estimated.createdAt as string).getTime()).not.toBe(now.getTime());
    // 4. 全无效（损坏数据）返回 null，由调用方显式处理。
    expect(resolveAnnouncementCreatedAt('bad', undefined, {})).toEqual({ createdAt: null, timeEstimated: true, source: 'none' });
  });

  it('repairs legacy announcements once: estimated timestamp plus flag, healthy records untouched', () => {
    const legacy = { date: '2026-10-02', localTimeStr: '00:38', createdAt: 'not-a-date' as string, timeEstimated: undefined as boolean | undefined };
    const healthy = { date: '2026-10-01', localTimeStr: '18:49', createdAt: '2026-10-01T18:49:00.000Z' as string, timeEstimated: undefined as boolean | undefined };
    const { list, repaired } = repairAnnouncementTimestamps([legacy, healthy]);
    expect(repaired).toBe(1);
    // 老记录：补上有效时间戳并打标。
    expect(list[0].timeEstimated).toBe(true);
    expect(Number.isFinite(new Date(list[0].createdAt as string).getTime())).toBe(true);
    // 健康记录：原样不动，不打标。
    expect(list[1]).toBe(healthy);
    expect(list[1].timeEstimated).toBeUndefined();
    // 已修复过的记录不再重复修复（幂等）。
    expect(repairAnnouncementTimestamps(list).repaired).toBe(0);
  });

  it('groups the same absolute instant into the viewer-local day in Beijing, New York and London', () => {
    // 同一绝对时刻：2026-10-01T16:38:00Z ＝ 北京 10/2 00:38 ＝ 纽约 10/1 12:38 ＝ 伦敦 10/1 17:38。
    const instant = '2026-10-01T16:38:00.000Z';
    const announcement = { date: '2026-10-02', localTimeStr: '00:38', createdAt: instant };
    const originalTimezone = process.env.TZ;
    try {
      process.env.TZ = 'Asia/Shanghai';
      const beijingNow = new Date(2026, 9, 2, 0, 40);
      expect(getAnnouncementViewerDateKey(announcement, beijingNow)).toBe('2026-10-02');
      expect(partitionAnnouncementsByViewerDay([announcement], beijingNow).today).toHaveLength(1);

      process.env.TZ = 'America/New_York';
      const newYorkNow = new Date(2026, 9, 1, 12, 40);
      expect(getAnnouncementViewerDateKey(announcement, newYorkNow)).toBe('2026-10-01');
      const ny = partitionAnnouncementsByViewerDay([announcement], newYorkNow);
      expect(ny.today).toHaveLength(1);
      expect(ny.older).toHaveLength(0);

      process.env.TZ = 'Europe/London';
      const londonNow = new Date(2026, 9, 1, 17, 40);
      expect(getAnnouncementViewerDateKey(announcement, londonNow)).toBe('2026-10-01');
      expect(partitionAnnouncementsByViewerDay([announcement], londonNow).today).toHaveLength(1);
    } finally {
      process.env.TZ = originalTimezone;
    }
  });

  it('puts a publisher-next-day legacy announcement at the top of today instead of history', () => {
    const originalTimezone = process.env.TZ;
    try {
      process.env.TZ = 'America/New_York';
      // 纽约查看者 10/1 18:49；北京 10/2 00:38 发布的老记录没有有效 createdAt，
      // 只能按发布者留下的 date=10/2 兜底——它是最新的公告，必须出现在今日顶部，
      // 不能被丢进"历史公告"。
      const now = new Date(2026, 9, 1, 18, 49);
      const legacyBeijing = { date: '2026-10-02', localTimeStr: '00:38', createdAt: 'not-a-date' };
      const newYorkToday = { date: '2026-10-01', localTimeStr: '18:49', createdAt: '2026-10-01T18:49:00' };
      const old = { date: '2026-09-28', localTimeStr: '10:00', createdAt: '2026-09-28T10:00:00' };

      expect(getAnnouncementViewerDateKey(legacyBeijing, now)).toBe('2026-10-02');
      const { today, older } = partitionAnnouncementsByViewerDay([newYorkToday, old, legacyBeijing], now);
      expect(today.map(a => a.date)).toEqual(['2026-10-02', '2026-10-01']);
      expect(older.map(a => a.date)).toEqual(['2026-09-28']);
      // 排序键：兜底记录按 date+localTimeStr 参与排序，不会因 NaN 乱序。
      expect(getAnnouncementSortTime(legacyBeijing)).toBeGreaterThan(getAnnouncementSortTime(newYorkToday));
      expect(getAnnouncementSortTime(newYorkToday)).toBeGreaterThan(getAnnouncementSortTime(old));
      // 彻底损坏的记录（无 date 无有效 createdAt）排最末，不顶掉正常公告。
      expect(getAnnouncementSortTime({ createdAt: 'bad' })).toBe(0);
    } finally {
      process.env.TZ = originalTimezone;
    }
  });

  it('formats the card labels from the same instant used for grouping', () => {
    const originalTimezone = process.env.TZ;
    try {
      process.env.TZ = 'America/New_York';
      const now = new Date(2026, 9, 1, 18, 49);
      // 有效 createdAt：按查看者本地显示。
      expect(formatAnnouncementViewerDateTime(
        { createdAt: '2026-10-01T18:49:00', date: '2026-10-01', localTimeStr: '18:49' },
        now,
      )).toEqual({ dateLabel: '10/1 ', timeLabel: '18:49' });
      // 无效 createdAt：退回 date + localTimeStr（与分组兜底一致，不自创时间）。
      expect(formatAnnouncementViewerDateTime(
        { createdAt: 'bad', date: '2026-10-02', localTimeStr: '00:38' },
        now,
      )).toEqual({ dateLabel: '10/2 ', timeLabel: '00:38' });
    } finally {
      process.env.TZ = originalTimezone;
    }
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
    const storage = read('lib/storage.ts');
    const cloudSync = read('lib/cloud-sync.ts');
    const router = read('server/family-router.ts');
    const db = read('server/db.ts');
    const schema = read('drizzle/schema.ts');

    // 今日/历史用明确的三段比较：viewerKey 未来归今日，只有严格早于今天的算历史。
    // 分组、排序、显示同源（partitionAnnouncementsByViewerDay / sortTime / format）。
    expect(family).toContain('partitionAnnouncementsByViewerDay(announcements)');
    expect(family).toContain('viewerKey >= dateKey : viewerKey === dateKey');
    expect(family).toContain('getAnnouncementViewerDateKey(announcement) >= todayStr()');
    expect(family).toContain('getAnnouncementViewerDateKey(announcement) >= viewerToday');
    expect(family).toContain('formatAnnouncementViewerDateTime(ann)');
    expect(family).not.toContain('getAnnouncementViewerDateKey(announcement) !== viewerToday');
    expect(family).not.toContain('const todayAnnouncements = announcements.filter(a => a.date === todayStr());');
    expect(joinerHome).toContain('getAnnouncementViewerDateKey(announcement) >= _todayKey');
    expect(joinerHome).toContain('getAnnouncementSortTime(b) - getAnnouncementSortTime(a)');
    // 云端合并排序与 30 天过滤用统一排序键，老记录不再因 NaN 被静默丢掉或乱序。
    expect(storage).toContain('getAnnouncementSortTime(b) - getAnnouncementSortTime(a)');
    expect(storage).toContain('getAnnouncementSortTime(a) >= cutoffTime');
    expect(storage).toContain('getAnnouncementViewerDateKey(announcement) >= viewerToday');

    // 根治：发布时间真相源三件套。
    // 发布时写死 UTC 绝对时间 + 发布者时区，缺一不可，否则拒绝发布。
    expect(storage).toContain('authorTimeZone: deviceTimeZone()');
    expect(storage).toContain("throw new Error('公告发布时间无效，拒绝发布')");
    expect(storage).toContain('authorTimeZone: announcement.authorTimeZone ?? deviceTimeZone()');
    // createdAt 按铁律解析，绝不默写"现在"伪装成新公告。
    expect(storage).toContain('resolveAnnouncementCreatedAt(');
    expect(storage).not.toContain("typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString()");
    // 老记录读取时一次性修复并写回，之后下游只见有效 createdAt。
    expect(storage).toContain('repairAnnouncementTimestamps(all)');
    expect(storage).toContain('repairAnnouncementTimestamps(localOnly)');
    // 发布者时区透传到云端。
    expect(cloudSync).toContain('authorTimeZone?: string;');
    expect(cloudSync).toContain('authorTimeZone: params.authorTimeZone,');
    // 服务端：表结构 + 自动迁移 + router 接收存储。
    expect(schema).toContain('authorTimeZone: varchar("authorTimeZone", { length: 64 })');
    expect(db).toContain("column: 'authorTimeZone', definition: 'varchar(64)'");
    expect(router).toContain('authorTimeZone: z.string().max(64).optional()');
    expect(router).toContain('authorTimeZone: input.authorTimeZone ?? null,');
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
