import type { DiaryEntry } from "./storage";

// 性能：日记时间降序排序。先一次算好时间戳再排序，避免 comparator 里反复 new Date()。
// 语义与原来三处内联 comparator 完全一致：createdAt（无则 date）时间戳降序，同值时 localTimeStr 降序。
export function sortDiaryEntriesDesc<T extends Pick<DiaryEntry, "createdAt" | "date" | "localTimeStr">>(
  list: T[],
): T[] {
  const withTs = list.map((e) => ({ e, ts: new Date(e.createdAt || e.date).getTime() }));
  withTs.sort((a, b) => {
    if (b.ts !== a.ts) return b.ts - a.ts;
    return (b.e.localTimeStr || "00:00").localeCompare(a.e.localTimeStr || "00:00");
  });
  return withTs.map((x) => x.e);
}
