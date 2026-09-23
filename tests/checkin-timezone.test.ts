/**
 * 跨时区打卡测试。
 *
 * 背景：打卡记录由主照顾者创建，`date` 是创建者本地的护理日。
 * 家人在其它时区查看时，必须用创建者的时区算"今天"，否则同一条记录
 * 在两边会掉进不同的日子，显示成"未打卡（miss）"，尽管对方明明打了。
 */
import { describe, expect, it } from 'vitest';
import {
  careDayKeyInZone,
  dateKeyInZone,
  deviceTimeZone,
  findCurrentSharedRecord,
  isValidTimeZone,
  resolveCareTimeZone,
  resolveCareTodayKey,
  resolveCheckInFormTargetDate,
} from '../lib/shared-date-range';

describe('dateKeyInZone', () => {
  it('同一时刻在北京和纽约落在不同的本地日期', () => {
    // 北京时间 2026-09-24 00:30 = 纽约时间 2026-09-23 12:30
    const at = new Date('2026-09-24T00:30:00+08:00');
    expect(dateKeyInZone(at, 'Asia/Shanghai')).toBe('2026-09-24');
    expect(dateKeyInZone(at, 'America/New_York')).toBe('2026-09-23');
  });

  it('非法时区回退到 UTC，保证格式合法', () => {
    expect(dateKeyInZone(new Date('2026-09-24T00:30:00Z'), 'Bogus/Zone')).toBe('2026-09-24');
    expect(dateKeyInZone(new Date('2026-09-24T00:30:00Z'), '')).toBe('2026-09-24');
  });
});

describe('careDayKeyInZone', () => {
  it('凌晨 5 点分界：在此时区内 05:00 前仍算前一天', () => {
    // 北京 2026-09-24 04:59 -> 护理日 2026-09-23
    expect(careDayKeyInZone(new Date('2026-09-24T04:59:00+08:00'), 'Asia/Shanghai')).toBe('2026-09-23');
    // 北京 2026-09-24 05:00 -> 护理日 2026-09-24
    expect(careDayKeyInZone(new Date('2026-09-24T05:00:00+08:00'), 'Asia/Shanghai')).toBe('2026-09-24');
  });

  it('分界按"此时区"的本地小时算，而不是 UTC 小时', () => {
    // 纽约 2026-09-23 04:59 EDT -> 护理日 2026-09-22（此时 UTC 已是 08:59）
    expect(careDayKeyInZone(new Date('2026-09-23T04:59:00-04:00'), 'America/New_York')).toBe('2026-09-22');
    expect(careDayKeyInZone(new Date('2026-09-23T05:00:00-04:00'), 'America/New_York')).toBe('2026-09-23');
  });

  it('与本地 getCareDayKey 在同一时区下结果一致', async () => {
    const { getCareDayKey } = await import('../lib/shared-date-range');
    const originalTz = process.env.TZ;
    try {
      process.env.TZ = 'Asia/Shanghai';
      const at = new Date(2026, 8, 24, 2, 30); // 本地 02:30
      expect(careDayKeyInZone(at, 'Asia/Shanghai')).toBe(getCareDayKey(at));
    } finally {
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
    }
  });
});

describe('isValidTimeZone / deviceTimeZone / resolveCareTimeZone', () => {
  it('识别合法与非法时区', () => {
    expect(isValidTimeZone('Asia/Shanghai')).toBe(true);
    expect(isValidTimeZone('America/New_York')).toBe(true);
    expect(isValidTimeZone('Bogus/Zone')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
    expect(isValidTimeZone(undefined)).toBe(false);
  });

  it('deviceTimeZone 永远返回合法时区', () => {
    expect(isValidTimeZone(deviceTimeZone())).toBe(true);
  });

  it('resolveCareTimeZone 取日期最新的记录的时区', () => {
    const records = [
      { date: '2026-09-20', creatorTimeZone: 'America/New_York' },
      { date: '2026-09-24', creatorTimeZone: 'Asia/Shanghai' },
      { date: '2026-09-22', creatorTimeZone: 'Europe/London' },
    ];
    expect(resolveCareTimeZone(records)).toBe('Asia/Shanghai');
  });

  it('跳过非法的时区；都没有时用 fallback', () => {
    expect(
      resolveCareTimeZone(
        [{ date: '2026-09-24', creatorTimeZone: 'Bogus' }],
        'America/New_York',
      ),
    ).toBe('America/New_York');
    expect(resolveCareTimeZone([], 'America/New_York')).toBe('America/New_York');
  });
});

describe('resolveCareTodayKey', () => {
  it('纽约查看者按北京创建者的时区算今天', () => {
    const records = [{ date: '2026-09-24', creatorTimeZone: 'Asia/Shanghai' }];
    // 纽约 2026-09-23 20:00 = 北京 2026-09-24 08:00（已过 5 点分界）
    const nowInNewYork = new Date('2026-09-23T20:00:00-04:00');
    expect(resolveCareTodayKey(records, nowInNewYork)).toBe('2026-09-24');
  });

  it('凌晨 5 点前按创建者时区的护理日回退', () => {
    const records = [{ date: '2026-09-23', creatorTimeZone: 'Asia/Shanghai' }];
    // 纽约 2026-09-23 12:30 = 北京 2026-09-24 00:30（未过 5 点分界）
    const nowInNewYork = new Date('2026-09-23T12:30:00-04:00');
    expect(resolveCareTodayKey(records, nowInNewYork)).toBe('2026-09-23');
  });
});

describe('findCurrentSharedRecord 跨时区精确匹配', () => {
  it('创建者在查看者日历的"昨天"打了卡：有无时区信息结果不同', () => {
    // 创建者在纽约，9-23 晚上 22:00（纽约时间）打了晚间卡，记录 date=2026-09-23。
    // 查看者在北京，此时是 9-24 10:00。
    const viewerNow = new Date('2026-09-24T10:00:00+08:00');
    const records = [{ date: '2026-09-23', creatorTimeZone: 'America/New_York' }];

    // 旧数据没有时区：按查看者本地今天 9-24 匹配 -> 找不到 -> 显示 miss（bug 现象）
    const originalTz = process.env.TZ;
    try {
      process.env.TZ = 'Asia/Shanghai';
      expect(findCurrentSharedRecord(records.map(r => ({ date: r.date })), viewerNow)).toBeNull();

      // 有时区：按创建者时区的护理今天（纽约 9-23 22:00 -> 9-23）精确命中
      expect(findCurrentSharedRecord(records, viewerNow, 'America/New_York')).toEqual(records[0]);
    } finally {
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
    }
  });

  it('精确没命中时回退到原来的容忍逻辑（行为不变）', () => {
    const originalTz = process.env.TZ;
    try {
      process.env.TZ = 'Asia/Shanghai';
      const viewerNow = new Date('2026-09-24T10:00:00+08:00');
      // 创建者今天还没打卡，只有 9-22 的旧记录：精确匹配失败，回退容忍逻辑也找不到今天 -> null
      expect(
        findCurrentSharedRecord(
          [{ date: '2026-09-22', creatorTimeZone: 'America/New_York' }],
          viewerNow,
          'America/New_York',
        ),
      ).toBeNull();
    } finally {
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
    }
  });
});

describe('resolveCheckInFormTargetDate 早晚一致性', () => {
  it('凌晨 0–5 点：早间和晚间表单都指向同一个护理日', () => {
    const openedAt = new Date(2026, 8, 24, 2, 0); // 本地 02:00
    const morning = resolveCheckInFormTargetDate({ mode: 'morning', openedAt });
    const evening = resolveCheckInFormTargetDate({ mode: 'evening', openedAt });
    expect(morning).toBe('2026-09-23');
    expect(evening).toBe('2026-09-23');
    expect(morning).toBe(evening);
  });

  it('5 点后早晚都指向当天', () => {
    const openedAt = new Date(2026, 8, 24, 8, 0);
    expect(resolveCheckInFormTargetDate({ mode: 'morning', openedAt })).toBe('2026-09-24');
    expect(resolveCheckInFormTargetDate({ mode: 'evening', openedAt })).toBe('2026-09-24');
  });

  it('backfill 与已选记录仍然优先', () => {
    expect(
      resolveCheckInFormTargetDate({
        mode: 'morning',
        backfillDate: '2026-09-20',
        openedAt: new Date(2026, 8, 24, 2, 0),
      }),
    ).toBe('2026-09-20');
    expect(
      resolveCheckInFormTargetDate({
        mode: 'morning',
        loadedRecordDate: '2026-09-22',
        useLoadedRecord: true,
        openedAt: new Date(2026, 8, 24, 2, 0),
      }),
    ).toBe('2026-09-22');
  });
});
