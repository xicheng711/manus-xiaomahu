import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('Diary publication date and return experience', () => {
  const diaryEdit = read('app/diary-edit.tsx');
  const diaryList = read('app/(tabs)/diary.tsx');

  it('renders an existing diary with its own stored publication date and time', () => {
    expect(diaryEdit).toContain('const dateStr = entry?.date || todayStr()');
    expect(diaryEdit).toContain('const timeLabel = entry?.localTimeStr || fallbackTime');
    expect(diaryEdit).toContain('formatDiaryPublishedLabel(entryRef.current)');
  });

  it('returns to the previous screen for an opened diary and preserves diary-list scroll state', () => {
    expect(diaryEdit).toContain('if (router.canGoBack() && (fromDiaryList || !!existingId)) router.back()');
    expect(diaryList).toContain('const diaryListScrollOffsets = new Map<string, number>()');
    expect(diaryList).toContain('scrollTo({ y: savedOffset, animated: false })');
  });
});

describe('Today activity feed', () => {
  const joinerHome = read('components/joiner-home.tsx');

  it('filters check-ins, diaries, and announcements to the exact local date', () => {
    expect(joinerHome).toContain('checkIns.filter(c => c.date === _todayKey)');
    expect(joinerHome).toContain('cleanDiaries.filter(d => d.date === _todayKey)');
    expect(joinerHome).toContain('announcements.filter(a => a.date === _todayKey)');
  });

  it('shows the date even when empty and orders newest activity first', () => {
    expect(joinerHome).toContain('今日活动记录 · {new Date().toLocaleDateString');
    expect(joinerHome).toContain('今天暂无活动记录');
    expect(joinerHome).toContain('items.sort((a, b) => b.sortKey - a.sortKey)');
  });

  it('does not reuse the evening completion timestamp as the morning timestamp', () => {
    expect(joinerHome).toContain('const morningHasExactTime = !latest.eveningDone && !!latest.completedAt');
    expect(joinerHome).toContain("time: morningHasExactTime ? timeStr(latest.completedAt) : '早间'");
  });
});

describe('Published diary interactions', () => {
  const router = read('server/family-router.ts');
  const schema = read('drizzle/schema.ts');
  const layout = read('app/_layout.tsx');
  const interactions = read('components/diary-interactions.tsx');

  it('does not count the author or an unfinished diary as a reader', () => {
    expect(router).toContain('diary.conversationFinished === false || diary.authorUserId === userId');
  });

  it('prevents comments on unfinished diaries and uniquely records each reader', () => {
    expect(router).toContain('日记尚未发布，暂时不能留言');
    expect(schema).toContain('uniqueIndex("uq_diary_reader").on(table.diaryId, table.readerUserId)');
  });

  it('shows a retry state rather than falsely claiming no interactions when offline', () => {
    expect(interactions).toContain('网络暂时不可用，点击重试');
    expect(interactions).toMatch(/loadFailed\s*\?\s*'阅读信息暂未加载'/);
  });

  it('opens the exact diary and carries the family id from a notification', () => {
    expect(layout).toContain('id: `cloud_${data.diaryId}`');
    expect(layout).toContain('roomId: data?.roomId ? String(data.roomId) : undefined');
  });
});

describe('Announcement reaction attribution', () => {
  const router = read('server/family-router.ts');

  it('names both the reacting member and the original announcement author', () => {
    expect(router).toContain('`${senderName} 对 ${targetAnnouncement.authorName || \'家人\'} 的公告回应了 ${input.emoji}`');
  });

  it('only sends the reaction notification when a reaction is being added', () => {
    expect(router).toContain('if (isAdding)');
  });
});
