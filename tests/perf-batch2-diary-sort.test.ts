import { describe, expect, it } from "vitest";
import { sortDiaryEntriesDesc } from "../lib/diary-sort";

type E = { id: string; date: string; createdAt?: string; localTimeStr?: string };

// ── 旧逻辑的逐字复制（重构前的三处内联 comparator 之一，删除处理器版本） ──
function oldSort(list: E[]): E[] {
  return [...list].sort((a, b) => {
    const ta = new Date(a.createdAt || a.date).getTime();
    const tb = new Date(b.createdAt || b.date).getTime();
    if (tb !== ta) return tb - ta;
    const lta = a.localTimeStr || '00:00';
    const ltb = b.localTimeStr || '00:00';
    return ltb.localeCompare(lta);
  });
}

// 旧的分组内 comparator（按 date 字符串主排序版本）
function oldGroupSort(list: E[]): E[] {
  return [...list].sort((a, b) => {
    const dateCmp = b.date.localeCompare(a.date);
    if (dateCmp !== 0) return dateCmp;
    const ta = new Date(a.createdAt || a.date).getTime();
    const tb = new Date(b.createdAt || b.date).getTime();
    if (tb !== ta) return tb - ta;
    const lta = a.localTimeStr || '00:00';
    const ltb = b.localTimeStr || '00:00';
    return ltb.localeCompare(lta);
  });
}

function randEntries(n: number): E[] {
  const out: E[] = [];
  for (let i = 0; i < n; i++) {
    const m = 1 + Math.floor(Math.random() * 12);
    const d = 1 + Math.floor(Math.random() * 28);
    const date = `2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const r = Math.random();
    out.push({
      id: `e${i}`,
      date,
      // 混合：有时有 createdAt（含时间），有时只有 date；有时缺 localTimeStr
      createdAt: r < 0.7 ? `${date}T${String(Math.floor(Math.random() * 24)).padStart(2, '0')}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}:00.000Z` : undefined,
      localTimeStr: r < 0.8 ? `${String(Math.floor(Math.random() * 24)).padStart(2, '0')}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}` : undefined,
    });
  }
  return out;
}

const ids = (xs: E[]) => xs.map(e => e.id);

describe("sortDiaryEntriesDesc 等价性（性能第二批）", () => {
  it("与旧删除处理器 comparator 排序结果一致（含随机数据 200 条 × 20 轮）", () => {
    for (let round = 0; round < 20; round++) {
      const data = randEntries(200);
      expect(ids(sortDiaryEntriesDesc(data))).toEqual(ids(oldSort(data)));
    }
  });

  it("与旧分组内 comparator 排序结果一致", () => {
    for (let round = 0; round < 20; round++) {
      const data = randEntries(200);
      expect(ids(sortDiaryEntriesDesc(data))).toEqual(ids(oldGroupSort(data)));
    }
  });

  it("不修改原数组", () => {
    const data = randEntries(50);
    const snapshot = data.map(e => e.id);
    sortDiaryEntriesDesc(data);
    expect(data.map(e => e.id)).toEqual(snapshot);
  });

  it("空数组与单条安全", () => {
    expect(sortDiaryEntriesDesc([])).toEqual([]);
    const one = [{ id: 'x', date: '2026-01-01' }];
    expect(sortDiaryEntriesDesc(one)).toEqual(one);
  });
});

describe("benchmark：comparator 内 new Date 构造次数", () => {
  it("新实现每条记录只构造一次 Date（旧实现 O(n log n) 次）", () => {
    const data = randEntries(500);
    let newCount = 0;
    let oldCount = 0;
    const RealDate = Date;
    // @ts-ignore
    global.Date = class extends RealDate {
      constructor(...args: any[]) { super(...(args as [])); newCount++; }
    } as any;
    sortDiaryEntriesDesc(data);
    // @ts-ignore
    global.Date = class extends RealDate {
      constructor(...args: any[]) { super(...(args as [])); oldCount++; }
    } as any;
    oldSort(data);
    global.Date = RealDate;
    console.log(`new Date calls: new=${newCount}, old=${oldCount}`);
    expect(newCount).toBeLessThanOrEqual(data.length + 5); // 每条一次（含容差）
    expect(oldCount).toBeGreaterThan(data.length * 3);     // 旧实现远超 n
  });
});
