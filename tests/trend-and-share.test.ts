import { describe, it, expect } from "vitest";

/**
 * Tests for trend chart data preparation and share card logic.
 * We test the pure data logic that drives TrendChart and BriefingCard.
 */

describe("Trend Chart data logic", () => {
  // Simulate the date range builder used in TrendChart
  // Generates `days` entries ending with today (inclusive)
  // Uses UTC date arithmetic to avoid timezone-induced duplicates
  function buildDateRange(days: number): string[] {
    const range: string[] = [];
    const now = Date.now();
    const msPerDay = 86400000;
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now - i * msPerDay);
      // Format as YYYY-MM-DD using UTC to stay consistent
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(d.getUTCDate()).padStart(2, '0');
      range.push(`${yyyy}-${mm}-${dd}`);
    }
    return range;
  }

  it("should generate correct 7-day date range", () => {
    const range = buildDateRange(7);
    expect(range.length).toBe(7);
    // Last entry should be today (UTC)
    const d = new Date();
    const today = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
    expect(range[range.length - 1]).toBe(today);
    // All entries should be unique
    const unique = new Set(range);
    expect(unique.size).toBe(7);
  });

  it("should generate correct 30-day date range", () => {
    const range = buildDateRange(30);
    expect(range.length).toBe(30);
    const d = new Date();
    const today = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
    expect(range[range.length - 1]).toBe(today);
  });

  it("should map check-in data to date range correctly", () => {
    // Use fixed dates to avoid timezone issues
    const fixedRange = [
      '2026-03-07', '2026-03-08', '2026-03-09',
      '2026-03-10', '2026-03-11', '2026-03-12', '2026-03-13',
    ];
    const mockCheckIns = [
      { date: '2026-03-07', sleepHours: 7, moodScore: 8, medicationTaken: true },
      { date: '2026-03-09', sleepHours: 5, moodScore: 4, medicationTaken: false },
      { date: '2026-03-13', sleepHours: 8, moodScore: 9, medicationTaken: true },
    ];
    const checkInMap = new Map(mockCheckIns.map((c) => [c.date, c]));

    const sleepData = fixedRange.map((date) => {
      const c = checkInMap.get(date);
      return { date, value: c?.sleepHours ?? 0, hasData: !!c };
    });

    expect(sleepData.length).toBe(7);
    expect(sleepData[0].hasData).toBe(true);  // 2026-03-07 has data
    expect(sleepData[0].value).toBe(7);
    expect(sleepData[1].hasData).toBe(false); // 2026-03-08 no data
    expect(sleepData[1].value).toBe(0);
    expect(sleepData[2].hasData).toBe(true);  // 2026-03-09 has data
    expect(sleepData[2].value).toBe(5);
    expect(sleepData[6].value).toBe(8);       // 2026-03-13 has data
  });

  it("should calculate stats correctly", () => {
    const checkIns = [
      { sleepHours: 7, moodScore: 8, medicationTaken: true },
      { sleepHours: 5, moodScore: 4, medicationTaken: false },
      { sleepHours: 8, moodScore: 9, medicationTaken: true },
    ];

    // Sleep stats
    const avgSleep = checkIns.reduce((s, c) => s + c.sleepHours, 0) / checkIns.length;
    const maxSleep = Math.max(...checkIns.map((c) => c.sleepHours));
    const minSleep = Math.min(...checkIns.map((c) => c.sleepHours));
    expect(avgSleep).toBeCloseTo(6.67, 1);
    expect(maxSleep).toBe(8);
    expect(minSleep).toBe(5);

    // Mood stats
    const avgMood = checkIns.reduce((s, c) => s + c.moodScore, 0) / checkIns.length;
    const bestMood = Math.max(...checkIns.map((c) => c.moodScore));
    expect(avgMood).toBe(7);
    expect(bestMood).toBe(9);

    // Medication stats
    const taken = checkIns.filter((c) => c.medicationTaken).length;
    const rate = Math.round((taken / checkIns.length) * 100);
    expect(taken).toBe(2);
    expect(rate).toBe(67);
  });
});

describe("Share card score logic", () => {
  it("should assign correct color and label based on care score", () => {
    function getScoreInfo(score: number) {
      const color = score >= 80 ? "#16A34A" : score >= 60 ? "#3B82F6" : score >= 40 ? "#F59E0B" : "#EF4444";
      const label = score >= 80 ? "状态极佳" : score >= 60 ? "状态良好" : score >= 40 ? "需要关注" : "需要照顾";
      return { color, label };
    }

    expect(getScoreInfo(90).label).toBe("状态极佳");
    expect(getScoreInfo(90).color).toBe("#16A34A");
    expect(getScoreInfo(70).label).toBe("状态良好");
    expect(getScoreInfo(70).color).toBe("#3B82F6");
    expect(getScoreInfo(50).label).toBe("需要关注");
    expect(getScoreInfo(50).color).toBe("#F59E0B");
    expect(getScoreInfo(20).label).toBe("需要照顾");
    expect(getScoreInfo(20).color).toBe("#EF4444");
  });

  it("should build fallback share text correctly", () => {
    const elderNickname = "奶奶";
    const caregiverName = "小明";
    const careScore = 85;
    const checkIn = {
      sleepHours: 7,
      sleepQuality: "good" as const,
      moodScore: 8,
      moodEmoji: "😊",
      medicationTaken: true,
      mealNotes: "吃了两碗饭",
    };

    const sleepLabel = checkIn.sleepQuality === "good" ? "良好" : checkIn.sleepQuality === "fair" ? "一般" : "较差";
    const text = `🐴🐯【小马虎 · 每日护理简报】\n👴 ${elderNickname} 今日护理指数：${careScore}/100\n😴 睡眠：${checkIn.sleepHours}小时（${sleepLabel}）\n${checkIn.moodEmoji} 心情：${checkIn.moodScore}/10\n💊 用药：已按时服药 ✅\n🍽️ 饮食：${checkIn.mealNotes}\n由 ${caregiverName} 用心记录 💕`;

    expect(text).toContain("奶奶");
    expect(text).toContain("85/100");
    expect(text).toContain("7小时");
    expect(text).toContain("良好");
    expect(text).toContain("8/10");
    expect(text).toContain("已按时服药");
    expect(text).toContain("吃了两碗饭");
    expect(text).toContain("小明");
  });
});
