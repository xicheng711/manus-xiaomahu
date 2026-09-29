/**
 * ux-batch9-8：B7 趋势图七天桶跨时区回归测试。
 * 场景：北京创建者、纽约查看者。七天桶必须按照护时区的护理日 key 建，
 * 不能按查看者本地日历建，否则最新记录掉出窗口、年末年份错位。
 */
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  careDayKeyInZone,
  resolveCareTodayKey,
  addDaysToDateKey,
  buildCareWeekKeys,
  formatDateKeyRangeLabel,
  weekdayLabelOfDateKey,
  isDateKey,
} from "../lib/shared-date-range";

const read = (p: string) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");

// 2026-09-28 06:00（北京）= 2026-09-27 18:00（纽约，EDT）；两边都过了 5 点护理日分界
const BEIJING_6AM = new Date("2026-09-27T22:00:00Z");

describe("B7：照护今天按创建者时区算", () => {
  it("同一时刻：北京是 9-28，纽约是 9-27", () => {
    expect(careDayKeyInZone(BEIJING_6AM, "Asia/Shanghai")).toBe("2026-09-28");
    expect(careDayKeyInZone(BEIJING_6AM, "America/New_York")).toBe("2026-09-27");
  });

  it("护理日 5 点分界：北京凌晨 4:30 仍算前一天", () => {
    // 2026-09-28 04:30+08:00
    const before5 = new Date("2026-09-27T20:30:00Z");
    expect(careDayKeyInZone(before5, "Asia/Shanghai")).toBe("2026-09-27");
    // 2026-09-28 05:30+08:00
    const after5 = new Date("2026-09-27T21:30:00Z");
    expect(careDayKeyInZone(after5, "Asia/Shanghai")).toBe("2026-09-28");
  });

  it("resolveCareTodayKey 用记录的创建者时区，不用查看者本地", () => {
    const records = [{ date: "2026-09-28", creatorTimeZone: "Asia/Shanghai" }];
    expect(resolveCareTodayKey(records, BEIJING_6AM)).toBe("2026-09-28");
  });
});

describe("B7：七天桶按 key 做日历加减", () => {
  it("北京今天 9-28 → 窗口 9-22..9-28，含最新记录", () => {
    const keys = buildCareWeekKeys("2026-09-28", 0);
    expect(keys).toHaveLength(7);
    expect(keys[0]).toBe("2026-09-22");
    expect(keys[6]).toBe("2026-09-28");
    // 旧逻辑（纽约本地日历）会建成 9-21..9-27，漏掉 9-28
    expect(keys).not.toContain("2026-09-21");
    expect(keys).toContain("2026-09-28");
  });

  it("offset=-1 上周窗口连续不重叠", () => {
    const keys = buildCareWeekKeys("2026-09-28", -1);
    expect(keys[0]).toBe("2026-09-15");
    expect(keys[6]).toBe("2026-09-21");
  });

  it("跨年：北京 2026-01-01 的窗口含 2025-12-26..2026-01-01", () => {
    const keys = buildCareWeekKeys("2026-01-01", 0);
    expect(keys[0]).toBe("2025-12-26");
    expect(keys[6]).toBe("2026-01-01");
    expect(formatDateKeyRangeLabel(keys)).toBe("12月26日 至 1月1日");
  });

  it("夏令时切换日加减天不跑偏（纯日历运算）", () => {
    // 2026-03-08 是美国夏令时开始日
    expect(addDaysToDateKey("2026-03-07", 1)).toBe("2026-03-08");
    expect(addDaysToDateKey("2026-03-08", -1)).toBe("2026-03-07");
    // 2026-11-01 是夏令时结束日
    expect(addDaysToDateKey("2026-11-01", 1)).toBe("2026-11-02");
    expect(addDaysToDateKey("2026-11-01", -1)).toBe("2026-10-31");
  });

  it("跨月：1-31 加一天是 2-1", () => {
    expect(addDaysToDateKey("2026-01-31", 1)).toBe("2026-02-01");
  });

  it("非法 key 原样返回，不抛错", () => {
    expect(addDaysToDateKey("not-a-date", 1)).toBe("not-a-date");
    expect(isDateKey("2026-09-28")).toBe(true);
    expect(isDateKey("2026-13-99")).toBe(false);
  });
});

describe("B7：星期标签与时区无关", () => {
  it("2026-09-28 是星期一", () => {
    expect(weekdayLabelOfDateKey("2026-09-28")).toBe("一");
    expect(weekdayLabelOfDateKey("2026-09-22")).toBe("二");
  });
});

describe("B7：trend-chart 不再用查看者本地日历建桶", () => {
  const src = read("components/trend-chart.tsx");
  it("用 buildCareWeekKeys 按 key 建桶", () => {
    expect(src).toContain("buildCareWeekKeys(careTodayKey, offset)");
    expect(src).toContain("buildCareWeekKeys(careTodayKey, offset - 1)");
  });
  it("年锚点从照护今天 key 取", () => {
    expect(src).toContain("Number(careTodayKey.slice(0, 4))");
  });
  it("旧的本地日历建桶函数已删除", () => {
    expect(src).not.toContain("function getWeekRange");
    expect(src).not.toContain("function buildDateRange");
    expect(src).not.toContain("function getMonthRange");
    expect(src).not.toContain("resolveSharedDataAnchorDate(checkIns)");
  });
  it("星期标签走 key（不再 new Date 本地解析）", () => {
    expect(src).toContain("weekdayLabelOfDateKey(date)");
  });
});
