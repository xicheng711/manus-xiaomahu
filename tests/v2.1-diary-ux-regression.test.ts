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

describe('Multi-family diary cache isolation and speed', () => {
  const storage = read('lib/storage.ts');
  const diaryList = read('app/(tabs)/diary.tsx');
  const joinerHome = read('components/joiner-home.tsx');
  const cloudSync = read('lib/cloud-sync.ts');

  it('tags every newly cached diary with its owning family id', () => {
    expect(storage).toContain('roomId?: string');
    expect(storage).toContain('roomId: rid ?? undefined');
    expect(storage).toContain('normalizeCloudDiaryEntry(raw, rid ?? undefined)');
  });

  it('never guesses ownership of an unscoped legacy diary for a multi-family user', () => {
    expect(storage).toContain('const canClaimUnscopedEntries = memberships.length === 1');
    expect(storage).toContain(': canClaimUnscopedEntries);');
    expect(storage).toContain('legacy_unassigned_backup');
  });

  it('renders the current family cache first and refreshes that same family in the background', () => {
    const localRead = diaryList.indexOf('const local = await getDiaryEntries(requestedFamilyId)');
    const localRender = diaryList.indexOf('setEntries(localSorted)');
    const cloudRead = diaryList.indexOf('const cloudEntries = await cloudGetDiaries(roomId)');
    expect(localRead).toBeGreaterThan(-1);
    expect(localRender).toBeGreaterThan(localRead);
    expect(cloudRead).toBeGreaterThan(localRender);
    expect(diaryList).toContain('activeFamilyRef.current !== requestedFamilyId');
    expect(joinerHome).toContain('const isCurrentFamily = () => activeFamilyIdRef.current === requestedFamilyId');
    expect(joinerHome).toContain('if (!isCurrentFamily()) return');
    expect(cloudSync).toContain('return null');
  });
});

describe('Diary draft, full text, and accidental navigation protection', () => {
  const diaryEdit = read('app/diary-edit.tsx');
  const layout = read('app/_layout.tsx');

  it('does not impose a character limit on the diary editor or detail text', () => {
    const diaryInput = diaryEdit.slice(diaryEdit.indexOf('placeholder={`${elderNickname}今天有什么特别的时刻？'), diaryEdit.indexOf('/* ── SUBMITTED'));
    expect(diaryInput).toContain('multiline');
    expect(diaryInput).not.toContain('maxLength');
    expect(diaryEdit).toContain('<Text style={styles.summaryContent}>{content.trim()}</Text>');
  });

  it('supports family-scoped autosave, explicit draft save, and later restore', () => {
    expect(diaryEdit).toContain('getDiaryDraft(familyId)');
    expect(diaryEdit).toContain('saveDiaryDraft({ content, selectedMood, caregiverMoodIdx, selectedTags }, familyId)');
    expect(diaryEdit).toContain('保存草稿，稍后继续');
  });

  it('disables both edge swipe and full-screen swipe on the diary editor', () => {
    expect(layout).toContain('<Stack.Screen name="diary-edit" options={{ gestureEnabled: false, fullScreenGestureEnabled: false }} />');
  });
});

describe('Continuous AI diary conversation', () => {
  const diaryEdit = read('app/diary-edit.tsx');
  const aiRouter = read('server/ai-router.ts');

  it('keeps the first AI reply in the in-memory entry used by immediate follow-ups', () => {
    expect(diaryEdit).toContain('entryRef.current = { ...savedEntry, aiReply: aiText, conversation: conv2 }');
    expect(diaryEdit).toContain("entryRef.current.aiReply || conversationRef.current[1]?.text || ''");
  });

  it('sends the original turn, prior follow-ups, and current message as role-based history', () => {
    expect(aiRouter).toContain("messages.push({ role: 'assistant', content: originalAiReply })");
    expect(aiRouter).toContain("role: m.role === 'user' ? 'user' : 'assistant'");
    expect(aiRouter).toContain("messages.push({ role: 'user', content: question })");
    expect(aiRouter).toContain('必须把历史消息当作正在进行的真实聊天');
  });
});

describe('Evening meal multiline input', () => {
  const checkin = read('app/(tabs)/checkin.tsx');

  it('forces the meal field Enter key to insert a newline without dismissing the keyboard', () => {
    const mealInput = checkin.slice(checkin.indexOf('style={[styles.mealCustomInput'), checkin.indexOf('/>', checkin.indexOf('style={[styles.mealCustomInput')));
    expect(mealInput).toContain('multiline');
    expect(mealInput).toContain('submitBehavior="newline"');
    expect(mealInput).toContain('blurOnSubmit={false}');
    expect(mealInput).toContain('returnKeyType="default"');
  });
});
