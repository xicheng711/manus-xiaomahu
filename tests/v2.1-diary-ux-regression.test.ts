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
    expect(layout).toContain('roomId: targetRoomId ?? undefined');
    expect(layout).toContain('await switchFamily(targetRoomId)');
    expect(layout).toContain('Notifications.getLastNotificationResponseAsync()');
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
    const localRead = diaryList.indexOf('getDiaryEntries(requestedFamilyId)');
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
    expect(diaryEdit).toContain('<Text style={styles.summaryContent}>{displayedDiaryBody}</Text>');
  });

  it('supports family-scoped autosave, explicit draft save, and later restore', () => {
    expect(diaryEdit).toContain('getDiaryDraft(requestedFamilyId)');
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

describe('Published diary body and conversation display split', () => {
  const diaryEdit = read('app/diary-edit.tsx');
  const diaryDetail = read('app/diary-detail.tsx');
  const displayHelper = read('lib/diary-conversation-display.ts');

  it('renders the complete diary body once and starts the conversation with the first AI reply', () => {
    expect(diaryEdit).toContain('getCompleteDiaryBody(content, conversation)');
    expect(diaryEdit).toContain('getConversationAfterDiaryBody(conversation, displayedDiaryBody)');
    expect(diaryEdit).toContain('displayedConversation.map((msg, i) =>');
    expect(diaryEdit).not.toContain('conversation.map((msg, i) =>');
    expect(diaryDetail).toContain('<Text style={styles.contentText}>{displayedDiaryBody}</Text>');
    expect(diaryDetail).not.toContain("{entry.moodEmoji} {entry.content || '已记录今日护理情况 📖'}");
  });

  it('keeps every genuine follow-up and recovers the longer copy from truncated legacy entries', () => {
    expect(displayHelper).toContain('shorterLength >= 24');
    expect(displayHelper).toContain('return [...conversation]');
    expect(displayHelper).toContain('getDiaryFollowUpConversation');
    expect(diaryDetail).toContain('getDiaryFollowUpConversation(');
  });

  it('does not impose visual clipping on the unique body or conversation messages', () => {
    const publishedRender = diaryEdit.slice(
      diaryEdit.indexOf('/* ── SUBMITTED'),
      diaryEdit.indexOf('/* 正式发布后显示阅读回执'),
    );
    expect(publishedRender).not.toContain('numberOfLines');
    expect(publishedRender).not.toContain('maxHeight');
  });
});

describe('Published diary cloud consistency and privacy', () => {
  const storage = read('lib/storage.ts');
  const diaryEdit = read('app/diary-edit.tsx');
  const diaryList = read('app/(tabs)/diary.tsx');
  const router = read('server/family-router.ts');
  const familyDb = read('server/family-db.ts');

  it('waits for the complete conversation to reach the cloud before leaving the editor', () => {
    expect(diaryEdit).toContain('syncDiaryEntryNow(eid, familyId)');
    expect(diaryEdit).toContain("conversationFinished: true, syncPending: true");
    expect(diaryEdit).toContain("'尚未发布到家庭'");
    expect(diaryEdit).toContain('getLastDiaryPublishFailure(eid, familyId)');
    expect(storage).toContain('export async function syncPendingDiaries');
    expect(diaryList).toContain('syncPendingDiaries(requestedFamilyId)');
  });

  it('keeps unfinished diaries private to their author and locks other authors at the API', () => {
    expect(router).toContain('entry.conversationFinished === true || entry.authorUserId === userId');
    expect(router).toContain('resolveDiarySyncIdentity({');
    expect(router).toContain('roomId: input.roomId');
    expect(router).toContain('userId,');
    expect(diaryEdit).toContain("setRoleReadOnly(params.readOnly === '1' || isOthersDiary)");
  });

  it('deletes a diary from server and clears its reader/comment records before local removal', () => {
    expect(router).toContain('deleteDiary: protectedProcedure');
    expect(familyDb).toContain('deleteDiaryEntryById');
    expect(familyDb).toContain('db.delete(diaryReads)');
    expect(familyDb).toContain('db.delete(diaryComments)');
    expect(storage).toContain('cloudDeleteDiary(serverDiaryId');
    expect(storage).toContain("throw new Error('云端删除失败，请检查网络后重试')");
  });
});

describe('Check-in resilience, permissions, and cross-timezone viewing', () => {
  const storage = read('lib/storage.ts');
  const checkin = read('app/(tabs)/checkin.tsx');
  const router = read('server/family-router.ts');

  it('retries locally saved check-ins and only notifies on the first completed transition', () => {
    expect(storage).toContain('export async function syncPendingCheckIns');
    expect(storage).toContain('syncPending: true');
    expect(checkin).toContain('syncPendingCheckIns(requestedFamilyId)');
    expect(router).toContain('previous?.eveningDone !== true');
    expect(router).toContain('previous?.morningDone !== true');
  });

  it('enforces creator-only writes and derives the screen role from activeMembership', () => {
    expect(router).toContain('只有主照顾者可以新增或修改打卡记录');
    expect(checkin).toContain("activeMembership.role !== 'creator'");
    expect(storage).toContain('cloudSyncCheckIn(checkIn, roomId)');
    expect(storage).toContain('enqueueCheckInSync(rid, checkIn.date');
  });

  it('shows Joiners the caregiver latest record rather than filtering by viewer timezone', () => {
    expect(checkin).toContain('setCheckIn(localSorted[0] ?? null)');
    expect(checkin).toContain('主照顾者记录日期：{checkIn?.date ?? viewerTodayKey}');
    expect(checkin).toContain('最新打卡状态');
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


describe('Family-scoped cache recovery beyond diaries', () => {
  const storage = read('lib/storage.ts');
  const medication = read('app/(tabs)/medication.tsx');
  const joinerHome = read('components/joiner-home.tsx');
  const auth = read('lib/auth-providers.ts');
  const cloud = read('lib/cloud-sync.ts');

  it('only claims legacy check-in and medication caches for an explicitly single-family account', () => {
    expect(storage).toContain('const onlyMembership = memberships.length === 1 && memberships[0]?.familyId === String(rid)');
    expect(storage).toContain('`${KEYS.CHECK_INS}:legacy_unassigned_backup`');
    expect(storage).toContain('`${KEYS.MEDICATIONS}:legacy_unassigned_backup`');
  });

  it('uses current membership role and request snapshots for medication data', () => {
    expect(medication).toContain("const isCreator = activeMembership?.role === 'creator'");
    expect(medication).toContain('activeFamilyRef.current !== requestedFamilyId');
    expect(medication).toContain('cloudGetMedications(Number(requestedFamilyId))');
    expect(medication).toContain('syncPendingMedications(requestedFamilyId)');
  });

  it('persists stable medication server IDs and retries pending edits', () => {
    expect(storage).toContain('serverMedId?: number');
    expect(storage).toContain('syncPending?: boolean');
    expect(storage).toContain('export async function syncPendingMedications');
    expect(storage).toContain('cloudDeleteMedication(serverId, target.name, Number(rid), deleteEvent, clientId)');
  });

  it('distinguishes empty cloud data from network failures for cached family content', () => {
    expect(cloud).toContain('// null 表示网络失败；[] 表示服务器确认当前家庭没有公告。');
    expect(cloud).toContain('// null 表示加载失败；[] 表示服务器确认当前家庭没有用药记录。');
    expect(auth).toContain('if (Array.isArray(checkInsData))');
    expect(auth).toContain('if (Array.isArray(announcementsData))');
    expect(auth).toContain('if (Array.isArray(medsData))');
  });

  it('never reads Joiner identity from a global current-member pointer', () => {
    expect(joinerHome).toContain('const scopedMember = requestedMembership.room.members.find');
    expect(joinerHome).not.toContain('const member = await getCurrentMember()');
    expect(joinerHome).toContain('setCurrentMember(scopedMember)');
  });
});

describe('Cross-family notification payload completeness', () => {
  const router = read('server/family-router.ts');
  const layout = read('app/_layout.tsx');

  it('includes the true room id for joining, check-in, diary, announcement, reaction, and comment notifications', () => {
    expect(router).toContain("{ type: 'new_member', screen: 'family', memberName: input.memberName, roomId: room.id }");
    expect(router).toContain("{ type: 'checkin', screen: 'home', roomId: input.roomId }");
    expect(router).toContain("type: 'diary_comment'");
    expect(router).toContain('roomId: input.roomId');
    expect(layout).toContain('await switchFamily(targetRoomId)');
  });
});


describe('Idempotent notifications and server-side room isolation', () => {
  const layout = read('app/_layout.tsx');
  const router = read('server/family-router.ts');
  const familyDb = read('server/family-db.ts');
  const storage = read('lib/storage.ts');

  it('does not notify again when an already-published diary is retried', () => {
    expect(router).toContain('if (existingEntry.conversationFinished === true)');
    expect(router).toContain('const newlyPublished = input.conversationFinished === true');
    expect(router).toContain('if (newlyPublished && shouldSendDiaryNotification');
  });

  it('clears the consumed cold-start notification response', () => {
    expect(layout).toContain('Notifications.clearLastNotificationResponseAsync()');
  });

  it('scopes medication update and delete queries by both id and room id', () => {
    expect(familyDb).toContain('and(eq(medications.id, id), eq(medications.roomId, values.roomId))');
    expect(familyDb).toContain('and(eq(medications.id, id), eq(medications.roomId, roomId))');
    expect(router).toContain('deleteMedication(input.medicationId, input.roomId)');
  });

  it('keeps the updated diary snapshot stable even if list sorting changes its array index', () => {
    expect(storage).toContain('const updatedEntry: DiaryEntry =');
    expect(storage).toContain('const syncEntry = updatedEntry');
    expect(storage).toContain('return updatedEntry');
  });
});


describe('Final family-profile and cache contract safeguards', () => {
  const storage = read('lib/storage.ts');
  const cloud = read('lib/cloud-sync.ts');
  const auth = read('lib/auth-providers.ts');

  it('never migrates a legacy global elder profile into an arbitrary second family', () => {
    expect(storage).toContain('const canClaimLegacy = memberships.length === 1 && memberships[0]?.familyId === String(rid)');
    expect(storage).toContain('const legacy = canClaimLegacy ? await getProfile() : null');
  });

  it('binds family profile and briefing cloud updates to the captured family id', () => {
    expect(storage).toContain('cloudUpdateElderProfile(merged as any, rid ? Number(rid) : undefined)');
    expect(storage).toContain('cloudSaveBriefing(briefing, Number(rid))');
  });

  it('distinguishes briefing and announcement network failure from confirmed empty data', () => {
    expect(cloud).toMatch(/export async function cloudGetBriefings[\s\S]*?if \(!rid\) return null;[\s\S]*?return null;/);
    expect(cloud).toMatch(/export async function cloudGetAnnouncements[\s\S]*?if \(!rid\) return null;[\s\S]*?return null;/);
    expect(auth).toContain('if (Array.isArray(briefingsData))');
  });

  it('uses the active membership for offline login and never guesses diary ownership by display name', () => {
    expect(auth).toContain('const active = await getActiveMembership()');
    expect(auth).toContain('active?.familyId ? getFamilyProfile(active.familyId)');
    expect(storage).toContain('const matched = userId ? remoteEntries.find');
    expect(storage).not.toContain('remote.authorName === entry.authorName');
  });
});


describe('Diary comment composer and author-owned deletion', () => {
  const interactions = read('components/diary-interactions.tsx');
  const diaryEdit = read('app/diary-edit.tsx');
  const diaryDetail = read('app/diary-detail.tsx');
  const router = read('server/family-router.ts');
  const familyDb = read('server/family-db.ts');

  it('keeps the multiline comment composer visible above the keyboard without an artificial length cap', () => {
    expect(interactions).toContain('submitBehavior="newline"');
    expect(interactions).toContain('onInputFocus?.()');
    expect(interactions).not.toContain('maxLength={500}');
    expect(router).not.toContain('content: z.string().trim().min(1).max(500)');
    expect(diaryEdit).toContain('onInputFocus={() => scrollRef.current?.scrollToEnd({ animated: true })}');
    expect(diaryDetail).toContain("behavior={Platform.OS === 'ios' ? 'padding' : 'height'}");
  });

  it('only exposes and executes delete for the comment author within the same family', () => {
    expect(router).toContain('canDelete: comment.authorUserId === userId');
    expect(router).toContain('deleteDiaryCommentByAuthor(input.roomId, input.commentId, userId)');
    expect(familyDb).toContain('eq(diaryComments.roomId, roomId)');
    expect(familyDb).toContain('eq(diaryComments.authorUserId, authorUserId)');
    expect(interactions).toContain('comment.canDelete ?');
    expect(interactions).toContain('cloudDeleteDiaryComment(comment.id, roomId)');
  });
});

describe('Medication adjustment history', () => {
  const schema = read('drizzle/schema.ts');
  const db = read('server/db.ts');
  const router = read('server/family-router.ts');
  const storage = read('lib/storage.ts');
  const medication = read('app/(tabs)/medication.tsx');
  const history = read('components/medication-history.tsx');

  it('persists an idempotent family-scoped medication timeline on the server', () => {
    expect(schema).toContain('mysqlTable("medication_changes"');
    expect(schema).toContain('uniqueIndex("uq_medication_change_event")');
    expect(db).toContain('CREATE TABLE IF NOT EXISTS medication_changes');
    expect(router).toContain('getMedicationChanges: protectedProcedure');
    expect(router).toContain('recordMedicationChange({');
  });

  it('records what changed, why, when, and who changed it for all key medication actions', () => {
    expect(storage).toContain('previousSnapshot?: MedicationSnapshot | null');
    expect(storage).toContain('nextSnapshot?: MedicationSnapshot | null');
    expect(medication).toContain("changeType: 'updated'");
    expect(medication).toContain("changeType: 'added'");
    expect(medication).toContain("changeType: nextMedication.active ? 'resumed' : 'paused'");
    expect(medication).toContain("changeType: 'deleted'");
    expect(medication).toContain('本次调整原因 *');
    expect(history).toContain('调整原因');
    expect(history).toContain('最近更新：');
  });

  it('renders the cached timeline first, then merges the current family cloud history', () => {
    expect(medication).toContain('getMedicationChanges(requestedFamilyId)');
    expect(medication).toContain('cloudGetMedicationChanges(Number(requestedFamilyId))');
    expect(medication).toContain('mergeCloudMedicationChanges(cloudChanges, requestedFamilyId)');
    expect(storage).toContain("MEDICATION_CHANGES: 'medication_changes_v1'");
    expect(storage).toContain('syncPending?: boolean');
  });
});

describe('Diary draft list management', () => {
  const storage = read('lib/storage.ts');
  const diaryList = read('app/(tabs)/diary.tsx');

  it('separates unfinished drafts from published diaries and clearly states their privacy', () => {
    expect(diaryList).toContain('const conversationDrafts = entries.filter(entry => entry.conversationFinished === false)');
    expect(diaryList).toContain('const publishedEntries = entries.filter(entry => entry.conversationFinished !== false)');
    expect(diaryList).toContain('📝 我的草稿');
    expect(diaryList).toContain('尚未发布 · 家人看不到');
    expect(diaryList).toContain('草稿 · 仅自己可见');
  });

  it('shows last edited time and lets the author continue or delete a family-scoped draft', () => {
    expect(storage).toContain('updatedAt?: string');
    expect(storage).toContain("updatedAt: data.updatedAt ?? new Date().toISOString()");
    expect(diaryList).toContain('最后编辑：{formatDraftTime(savedAt)}');
    expect(diaryList).toContain('onContinue={openNewEntry}');
    expect(diaryList).toContain('clearDiaryDraft(requestedFamilyId)');
  });
});


describe('Warm local-time Joiner greeting', () => {
  const joinerHome = read('components/joiner-home.tsx');

  it('uses the current family member name and the device local hour', () => {
    expect(joinerHome).toContain('const h = new Date().getHours()');
    expect(joinerHome).toContain('activeMembership?.room.members.find(member => member.id === activeMembership.myMemberId)');
    expect(joinerHome).toContain('currentMember?.name?.trim()');
    expect(joinerHome).toContain('`早上好，${userName}`');
    expect(joinerHome).toContain('`中午好，${userName}`');
    expect(joinerHome).toContain('`下午好，${userName}`');
    expect(joinerHome).toContain('`晚上好，${userName}`');
  });

  it('separates the short title from the warm subtitle and keeps both on one line', () => {
    expect(joinerHome).toContain('因为有你，每一天都充满爱 🌙');
    expect(joinerHome).toContain('numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}');
    expect(joinerHome).toContain('numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}');
    expect(joinerHome).toContain('greetingBlock: { flex: 1, minWidth: 0, paddingRight: 12 }');
  });
});


describe('Final interaction and medication race-condition safeguards', () => {
  const interactions = read('components/diary-interactions.tsx');
  const schema = read('drizzle/schema.ts');
  const db = read('server/db.ts');
  const familyDb = read('server/family-db.ts');
  const router = read('server/family-router.ts');
  const cloud = read('lib/cloud-sync.ts');
  const storage = read('lib/storage.ts');
  const medication = read('app/(tabs)/medication.tsx');

  it('clears old diary interactions and rejects stale async results when switching diary or family', () => {
    expect(interactions).toContain('const scopeKey = enabled && diaryId && roomId');
    expect(interactions).toContain('if (scopeKeyRef.current !== requestedScope) return');
    expect(interactions).toContain('setReaders([])');
    expect(interactions).toContain('setComments([])');
    expect(interactions).toContain('setCommentText(\'\')');
  });

  it('uses a room-scoped client id to make medication creation idempotent', () => {
    expect(schema).toContain('clientId: varchar("clientId", { length: 100 })');
    expect(schema).toContain('uniqueIndex("uq_medications_room_client").on(table.roomId, table.clientId)');
    expect(db).toContain("column: 'clientId'");
    expect(db).toContain('uq_medications_room_client (roomId, clientId)');
    expect(router).toContain('clientId: z.string().min(1).max(100).optional()');
    expect(familyDb).toContain('eq(medications.clientId, values.clientId)');
    expect(cloud).toContain("clientId: String(med.id || '').replace(/^cloud_/, '') || undefined");
    expect(storage).toContain('remoteClientId ? local.find');
    expect(medication).toContain('mergeCloudMedicationsIntoLocal(cloudMeds, requestedFamilyId)');
  });

  it('serializes medication writes and waits before deletion so stale requests cannot recreate deleted medicine', () => {
    expect(storage).toContain('const medicationSyncQueue = new Map<string, Promise<void>>()');
    expect(storage).toContain('enqueueMedicationSync(rid ?? undefined, med.id');
    expect(storage).toContain('enqueueMedicationSync(rid ?? undefined, id');
    expect(storage).toContain('await waitForMedicationSync(rid ?? undefined, id)');
    expect(storage).toContain('cloudDeleteMedication(serverId, target.name, Number(rid), deleteEvent, clientId)');
    expect(cloud).toContain('serverMeds.find((m: any) => m.clientId === clientId)');
  });
});


describe('App-wide keyboard and text-input safeguards', () => {
  const createFamily = read('app/(modals)/create-family.tsx');
  const familySettings = read('app/(modals)/family-settings.tsx');
  const onboarding = read('app/onboarding.tsx');
  const family = read('app/(tabs)/family.tsx');
  const joinerHome = read('components/joiner-home.tsx');
  const diaryEdit = read('app/diary-edit.tsx');
  const diaryDetail = read('app/diary-detail.tsx');
  const profile = read('app/profile.tsx');
  const checkin = read('app/(tabs)/checkin.tsx');
  const medication = read('app/(tabs)/medication.tsx');

  it('keeps onboarding and create-family fixed footers above the keyboard', () => {
    expect(onboarding).toContain('<KeyboardAvoidingView');
    expect(onboarding).toContain("behavior={Platform.OS === 'ios' ? 'padding' : 'height'}");
    expect(onboarding).toContain('keyboardDismissMode={Platform.OS === \'ios\' ? \'interactive\' : \'on-drag\'}');
    expect(onboarding).toContain('function nextStep() {\n    Keyboard.dismiss();');
    expect(createFamily).toContain('<KeyboardAvoidingView');
    expect(createFamily).toContain('keyboardDismissMode={Platform.OS === \'ios\' ? \'interactive\' : \'on-drag\'}');
    expect(createFamily).toContain('function animateNext() {\n    Keyboard.dismiss();');
  });

  it('keeps family confirmation and announcement inputs visible and prevents duplicate posting', () => {
    expect(familySettings).toContain('<KeyboardAvoidingView');
    expect(familySettings).toContain('autoFocus');
    expect(familySettings).toContain('onSubmitEditing={() => {');
    expect(family).toContain('const [isPostingAnnouncement, setIsPostingAnnouncement] = useState(false)');
    expect(family).toContain('if (isPostingAnnouncement || !requestedFamilyId');
    expect(family).toContain('disabled={!composeText.trim() || isPostingAnnouncement}');
    expect(family).toContain('submitBehavior="newline"');
    expect(family).toContain('keyboardDismissMode={Platform.OS === \'ios\' ? \'interactive\' : \'on-drag\'}');
  });

  it('lets both caregiver and Joiner announcements use multiline newline input with safe failure feedback', () => {
    expect(joinerHome).toContain('submitBehavior="newline"');
    expect(joinerHome).toContain('blurOnSubmit={false}');
    expect(joinerHome).toContain('disabled={!content.trim() || posting}');
    expect(joinerHome).toContain("Alert.alert('公告没有发布成功'");
    expect(family).toContain("Alert.alert('公告没有发布成功'");
  });

  it('keeps diary conversations stable while sending and all long-form inputs newline-friendly', () => {
    expect(diaryEdit).toContain('returnKeyType="send"\n                      blurOnSubmit={false}');
    expect(diaryDetail).toContain('returnKeyType="send"\n                    blurOnSubmit={false}');
    expect(checkin).toContain('submitBehavior="newline"');
    expect((checkin.match(/blurOnSubmit=\{false\}/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect((medication.match(/submitBehavior="newline"/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('keeps profile forms scrollable and prevents repeated profile saves', () => {
    expect(profile).toContain('const [savingProfileEdit, setSavingProfileEdit] = useState(false)');
    expect(profile).toContain('if (savingProfileEdit) return');
    expect(profile).toContain('disabled={savingProfileEdit}');
    expect(profile).toContain('keyboardDismissMode={Platform.OS === \'ios\' ? \'interactive\' : \'on-drag\'}');
    expect(profile).toContain("Alert.alert('资料没有保存成功'");
  });
});


describe('Daytime nap compatibility and homepage announcement date', () => {
  const storage = read('lib/storage.ts');
  const trend = read('components/trend-chart.tsx');
  const checkin = read('app/(tabs)/checkin.tsx');
  const index = read('app/(tabs)/index.tsx');
  const joinerHome = read('components/joiner-home.tsx');
  const share = read('app/share.tsx');
  const db = read('server/db.ts');

  it('normalizes exact, boolean, structured, and legacy-label nap values through one shared parser', () => {
    expect(storage).toContain("'少于20分钟': 15");
    expect(storage).toContain("'20-60分钟': 45");
    expect(storage).toContain("'1小时以上': 90");
    expect(storage).toContain('export function hasRecordedNap');
    expect(storage).toContain('export function getNapMinutes');
    expect(storage).toContain('return list.map(normalizeCheckIn)');
  });

  it('distinguishes an explicitly recorded zero-minute nap from an unfilled day in the trend chart', () => {
    expect(trend).toContain('hasData: hasRecordedNap(c)');
    expect(trend).toContain('getNapMinutes(c)');
    expect(trend).toContain('已记录 ${napRecorded.length} 天 · 均未小睡');
    expect(trend).toContain('暂未填写小睡记录');
  });

  it('does not overwrite a missing cloud nap value with zero before legacy normalization', () => {
    expect(storage).toContain("if (raw[field] == null && local[field] != null)");
    expect(storage).toContain("'daytimeNap', 'napMinutes', 'napDuration'");
    expect(storage).not.toContain('raw.napMinutes ?? 0');
    expect(index).toContain('mergeCloudCheckInsIntoLocal(cloudCheckIns, fid)');
  });

  it('uses the same normalized nap value in check-in details, Joiner home, summaries, and shared briefings', () => {
    expect(checkin).toContain('getNapDisplay(selectedDay)');
    expect(checkin).toContain('getNapDisplay(checkIn)');
    expect(joinerHome).toContain('getNapDisplay(latestCheckIn)');
    expect(share).toContain('napMinutes: getNapMinutes(cItem)');
    expect(share).toContain('napMinutes: getNapMinutes(ci)');
  });

  it('shows the announcement publisher date and time together on the homepage card', () => {
    expect(joinerHome).toContain('function getAnnouncementDateTime(announcement: FamilyAnnouncement)');
    expect(joinerHome).toContain('announcement.localTimeStr || timeStr(announcement.createdAt)');
    expect(joinerHome).toContain('· {getAnnouncementDateTime(latest)}');
  });

  it('auto-migrates missing nap columns on older MySQL deployments', () => {
    expect(db).toContain("table: 'check_ins',      column: 'daytimeNap'");
    expect(db).toContain("table: 'check_ins',      column: 'napMinutes'");
  });
});


describe('Warm ivory homepage visual system', () => {
  const colors = read('lib/design-tokens/colors.ts');
  const gradients = read('lib/design-tokens/gradients.ts');
  const creatorHome = read('app/(tabs)/index.tsx');
  const joinerHome = read('components/joiner-home.tsx');
  const tabLayout = read('app/(tabs)/_layout.tsx');
  const trend = read('components/trend-chart.tsx');

  it('uses a restrained warm ivory background and stronger secondary text contrast', () => {
    expect(colors).toContain("primary: '#FAF7F4'");
    expect(colors).toContain("tertiary: '#858087'");
    expect(gradients).toContain("appBg: ['#FAF7F4', '#F8F3F0', '#F7F2ED']");
  });

  it('keeps homepage cards border-free with soft elevation and readable unrecorded states', () => {
    expect(joinerHome).toContain("color: latestCheckIn?.morningDone ? AppColors.purple.strong : AppColors.text.secondary");
    expect(joinerHome).toContain("color: latestCheckIn?.eveningDone ? AppColors.peach.primary : AppColors.text.secondary");
    expect(joinerHome).toContain('emptyFeedIconWrap');
    expect(joinerHome).toContain('shadowOpacity: 0.08, shadowRadius: 18, elevation: 3');
    expect(creatorHome).toContain('paddingBottom: 112');
  });

  it('visually separates the tab bar and keeps inactive destinations clearly visible', () => {
    expect(tabLayout).toContain("backgroundColor: 'rgba(255,253,251,0.96)'");
    expect(tabLayout).toContain('const showActive = focused');
    expect(tabLayout).toContain('opacity: 0.78');
    expect(tabLayout).toContain('color: AppColors.nav.inactive');
  });

  it('uses equal-width columns for sleep, nap, and medication trend alignment', () => {
    expect(trend).toContain("barColumn: { flex: 1, minWidth: 0");
    expect((trend.match(/barCol: \{ flex: 1, minWidth: 0/g) ?? []).length).toBe(1);
    expect(trend).toContain("valueLabel: { width: '100%'");
    expect(trend).toContain("dayLabel: { width: '100%'");
    expect(trend).toContain('dotCol: { flex: 1, minWidth: 0');
    expect(trend).toContain('<View style={styles.sectionCard}>');
  });
});


describe('Homepage card shadow integrity', () => {
  const creatorHome = read('app/(tabs)/index.tsx');
  const joinerHome = read('components/joiner-home.tsx');

  it('keeps rounded gradient layers clipped without clipping the outer iOS card shadows', () => {
    const smartCardStyles = creatorHome.slice(creatorHome.indexOf('smartCard: {'), creatorHome.indexOf('aiRow:', creatorHome.indexOf('smartCard: {')));
    const quickCardStyles = creatorHome.slice(creatorHome.indexOf('quickCard: {'), creatorHome.indexOf('quickIconBox:', creatorHome.indexOf('quickCard: {')));
    const announcementStyles = joinerHome.slice(joinerHome.indexOf('announceCard: {'), joinerHome.indexOf('announceHeader:', joinerHome.indexOf('announceCard: {')));

    expect(creatorHome).toContain("style={[StyleSheet.absoluteFill, { borderRadius: 22 }]}");
    expect(smartCardStyles).not.toContain("overflow: 'hidden'");
    expect(quickCardStyles).not.toContain("overflow: 'hidden'");
    expect(announcementStyles).not.toContain("overflow: 'hidden'");
  });
});


describe('Cross-day nap persistence and cloud cache safety', () => {
  const storage = read('lib/storage.ts');
  const authProviders = read('lib/auth-providers.ts');
  const home = read('app/(tabs)/index.tsx');
  const checkin = read('app/(tabs)/checkin.tsx');
  const family = read('app/(tabs)/family.tsx');
  const joinerHome = read('components/joiner-home.tsx');

  it('uses one canonical cloud-to-local check-in merge that preserves nap and pending data', () => {
    expect(storage).toContain('export async function mergeCloudCheckInsIntoLocal');
    expect(storage).toContain("'daytimeNap', 'napMinutes', 'napDuration'");
    expect(storage).toContain('if (local.syncPending)');
    expect(storage).toContain('const localOnly = localEntries.filter');
  });

  it('routes login restore and every home/check-in refresh through the canonical merge', () => {
    expect(authProviders).toContain('await mergeCloudCheckInsIntoLocal(checkInsData, roomIdStr)');
    expect(home).toContain('await mergeCloudCheckInsIntoLocal(cloudCheckIns, fid)');
    expect(checkin).toContain('mergeCloudCheckInsIntoLocal(cloudCIs, requestedFamilyId)');
    expect(family).toContain('mergeCloudCheckInsIntoLocal(cloudCIs, requestedFamilyId)');
    expect(joinerHome).toContain('mergeCloudCheckInsIntoLocal(cloudCheckIns, requestedFamilyId)');
  });

  it('does not directly overwrite room check-in caches from pages or login restore', () => {
    const combined = [authProviders, home, checkin, family, joinerHome].join('\n');
    expect(combined).not.toMatch(/setItem\(`daily_checkins_v2:\$\{/);
  });
});


describe('Final end-to-end audit safeguards', () => {
  const storage = read('lib/storage.ts');
  const cloud = read('lib/cloud-sync.ts');
  const familyContext = read('lib/family-context.tsx');
  const family = read('app/(tabs)/family.tsx');
  const medication = read('app/(tabs)/medication.tsx');
  const checkin = read('app/(tabs)/checkin.tsx');
  const share = read('app/share.tsx');
  const schema = read('drizzle/schema.ts');
  const db = read('server/db.ts');
  const router = read('server/family-router.ts');

  it('keeps family membership local until leave or dissolve is confirmed by the server', () => {
    expect(familyContext).toContain("if (!result?.success) throw new Error('暂时无法退出家庭");
    expect(familyContext).toContain("if (!result?.success) throw new Error('暂时无法解散家庭");
    expect(familyContext).toContain('switchFamily bg-refresh returned no detail; keeping cached room');
    expect(familyContext).toContain('const refreshGeneration = ++refreshGenerationRef.current');
  });

  it('makes announcement posting room-scoped, retryable, and idempotent', () => {
    expect(storage).toContain('export async function syncPendingAnnouncements(roomId: string)');
    expect(storage).toContain('export async function mergeCloudAnnouncementsIntoLocal');
    expect(cloud).toContain('clientId: params.clientId');
    expect(schema).toContain('uniqueIndex("uq_announcements_room_client")');
    expect(db).toContain('uq_announcements_room_client (roomId, clientId)');
    expect(router).toContain('getAnnouncementByClientId(input.roomId, input.clientId)');
    expect(family).toContain("ann.syncPending ? ' · 待同步' : ''");
  });

  it('keeps published diaries immutable and restores a missing authenticated user id safely', () => {
    const diaryEdit = read('app/diary-edit.tsx');
    expect(router).toContain('if (existingEntry.conversationFinished === true)');
    expect(router).toContain('return { success: true, diaryId: resolvedDiaryId }');
    expect(diaryEdit).toContain('const authenticatedUser = await getUserInfo()');
    expect(diaryEdit).toContain('await setCloudSyncState({ userId: authenticatedUser.id })');
    expect(diaryEdit).toContain('entry.authorUserId && (!currentUserId || entry.authorUserId !== currentUserId)');
  });

  it('never allows a successful stale medication read to replace an unsynced local edit', () => {
    expect(storage).toContain('export async function mergeCloudMedicationsIntoLocal');
    expect(storage).toContain('if (existing?.syncPending)');
    expect(medication).toContain('mergeCloudMedicationsIntoLocal(cloudMeds, requestedFamilyId)');
    expect(medication).toContain('if (savingMedication) return');
    expect(medication).toContain('disabled={savingMedication}');
  });

  it('binds check-in history and briefing writes to the initiating family', () => {
    expect(checkin).toContain('getAllCheckIns(familyId)');
    expect(checkin).toContain("Alert.alert('打卡没有保存成功'");
    expect(share).toContain('activeFamilyRef.current !== requestedFamilyId');
    expect(share).toContain('date: recordDate');
    expect(share).toContain('syncPendingBriefings(requestedFamilyId)');
    expect(storage).toContain('export async function syncPendingBriefings(roomId: string)');
    expect(storage).toContain('if (existing?.syncPending) continue');
    expect(schema).toContain('uniqueIndex("uq_briefings_room_date")');
    expect(db).toContain('uq_briefings_room_date (roomId, date)');
  });

  it('uses the shared cross-timezone range and never treats cloud read failure as an empty family dataset', () => {
    expect(share).toContain('resolveSharedDataAnchorDate(cloudCIsForWeekly)');
    expect(share).toContain('Array.isArray(cloudResult) ? cloudResult : []');
    expect(family).not.toMatch(/cloudGet(?:CheckIns|Diaries)[^\n]*\.catch\(\(\) => \[\]\)/);
  });
});


describe('Joiner tab bar alignment regression', () => {
  const tabsLayout = read('app/(tabs)/_layout.tsx');

  it('reuses the standard navigation button props for the disabled check-in tab', () => {
    expect(tabsLayout).toContain('}: BottomTabBarButtonProps & {');
    expect(tabsLayout).toContain('<HapticTab');
    expect(tabsLayout).toContain('{...buttonProps}');
    expect(tabsLayout).toContain('tabBarButton: (props) => <DisabledTabButton {...props}');
  });

  it('does not give the Joiner-only check-in button an independent fixed height', () => {
    expect(tabsLayout).not.toContain('style={styles.disabledTabBtn}');
    expect(tabsLayout).not.toContain('disabledTabBtn: {');
  });
});


describe('Monthly sleep and nap line-chart polish', () => {
  const trend = read('components/trend-chart.tsx');

  it('uses a shared SVG line chart for both annual sleep and nap views', () => {
    expect(trend).toContain("import Svg, { Circle, Line, Path } from 'react-native-svg'");
    expect(trend).toContain('function MonthlyLineChart');
    expect(trend).toContain('data={yearSleepData}');
    expect(trend).toContain('data={yearNapData}');
    expect(trend).toContain('period === \'year\' ? (');
  });

  it('keeps all twelve month labels on one bottom-aligned row', () => {
    expect(trend).toContain("xAxis: { position: 'absolute', flexDirection: 'row', alignItems: 'flex-end' }");
    expect(trend).toContain("monthCell: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'flex-end'");
    expect(trend).toContain('numberOfLines={1}');
    expect(trend).toContain('adjustsFontSizeToFit');
  });

  it('shows one selected-month value while keeping the y-axis readable', () => {
    expect(trend).toContain('const selected = data[selectedMonth]');
    expect(trend).toContain('selected?.hasData ? formatValue(selected.value) : \'暂无\'');
    expect(trend).toContain('onSelectMonth(index)');
    expect(trend).toContain("? [`${maxValue}h`, `${midValue}h`, '0']");
  });

  it('preserves missing-month and explicit zero-nap semantics without timezone date parsing', () => {
    expect(trend).toContain('if (!previous.hasData || !current.hasData) continue');
    expect(trend).toContain('hasData: recorded.length > 0');
    expect(trend).toContain('function getDateKeyYearMonth');
    expect(trend).toContain('getDateKeyYearMonth(c.date)?.year === currentYear');
  });
});


describe('Evening check-in durability and instant family-tab loading', () => {
  const storage = read('lib/storage.ts');
  const family = read('app/(tabs)/family.tsx');
  const familyRouter = read('server/family-router.ts');
  const familyDb = read('server/family-db.ts');
  const schema = read('drizzle/schema.ts');
  const db = read('server/db.ts');

  it('serializes same-day check-in sync and only acknowledges the exact latest local version', () => {
    expect(storage).toContain('const checkInSyncQueue = new Map<string, Promise<void>>()');
    expect(storage).toContain('enqueueCheckInSync(rid, checkIn.date');
    expect(storage).toContain('const syncVersion = generateId()');
    expect(storage).toContain('if (latestVersion !== sentVersion) return');
    expect(storage).toContain('await enqueueCheckInSync(roomId, entry.date');
  });

  it('deduplicates existing same-day cloud rows and preserves both completed phases', () => {
    expect(storage).toContain('function mergeDuplicateCloudCheckIns');
    expect(storage).toContain('merged.morningDone = existing?.morningDone === true || entry?.morningDone === true');
    expect(storage).toContain('merged.eveningDone = existing?.eveningDone === true || entry?.eveningDone === true');
    expect(storage).toContain('mergeDuplicateCloudCheckIns(cloudEntries).map');
  });

  it('enforces one server check-in per family/date and ignores stale phase snapshots', () => {
    expect(schema).toContain('uniqueIndex("uq_check_ins_room_date").on(table.roomId, table.date)');
    expect(db).toContain("INDEX_NAME = 'uq_check_ins_room_date'");
    expect(db).toContain('merged duplicate check-ins and added room/date unique index');
    expect(familyDb).toContain('onDuplicateKeyUpdate({ set: data })');
    expect(familyRouter).toContain('input.completedAt < previous.completedAt');
    expect(familyRouter).toContain('if (previous?.eveningDone === true && input.eveningDone !== true)');
  });

  it('renders room-scoped local family content before starting cloud work', () => {
    const loadData = family.slice(family.indexOf('async function loadData'));
    expect(loadData).toContain('第一阶段只读取当前家庭的 AsyncStorage');
    expect(loadData).toContain('setRoom(rLocal)');
    expect(loadData).toContain('setAnnouncements(localAnns)');
    expect(loadData).toContain('setBriefingHistory(cachedHistory)');
    expect(loadData.indexOf('setLoading(false)')).toBeLessThan(loadData.indexOf('syncPendingAnnouncements(requestedFamilyId)'));
  });

  it('refreshes in the background with a short focus throttle while preserving forced refresh paths', () => {
    expect(family).toContain('const FAMILY_CLOUD_REFRESH_TTL_MS = 30_000');
    expect(family).toContain('Date.now() - lastCloudRefreshAt < FAMILY_CLOUD_REFRESH_TTL_MS');
    expect(family).toContain('try {\n      await loadData(true)');
    expect(family).toContain('if (params.refresh) {\n      void loadData(true)');
    expect(family).toContain('allowLegacyProfileFallback = memberships.length === 1');
  });
});


describe('Announcement comments remain family-scoped, fast, and keyboard-safe', () => {
  const schema = read('drizzle/schema.ts');
  const migrations = read('server/db.ts');
  const familyDb = read('server/family-db.ts');
  const familyRouter = read('server/family-router.ts');
  const cloudSync = read('lib/cloud-sync.ts');
  const storage = read('lib/storage.ts');
  const familyPage = read('app/(tabs)/family.tsx');
  const comments = read('components/announcement-comments.tsx');
  const keyboardScroll = read('hooks/use-keyboard-aware-scroll.ts');
  const checkin = read('app/(tabs)/checkin.tsx');
  const rootLayout = read('app/_layout.tsx');

  it('stores comments in a dedicated cloud table with family, announcement, idempotency, and local date-time fields', () => {
    expect(schema).toContain('export const announcementComments = mysqlTable("announcement_comments"');
    expect(schema).toContain('uniqueIndex("uq_announcement_comment_client").on(table.roomId, table.announcementId, table.clientId)');
    expect(schema).toContain('date: varchar("date", { length: 10 }).notNull()');
    expect(schema).toContain('localTimeStr: varchar("localTimeStr", { length: 10 }).notNull()');
    expect(migrations).toContain('CREATE TABLE IF NOT EXISTS announcement_comments');
    expect(migrations).toContain('KEY idx_announcement_comments_room_announcement_created');
  });

  it('checks room membership and announcement ownership scope on every comment read, write, and delete', () => {
    expect(familyRouter).toContain('getAnnouncementComments: protectedProcedure');
    expect(familyRouter).toContain('addAnnouncementComment: protectedProcedure');
    expect(familyRouter).toContain('deleteAnnouncementComment: protectedProcedure');
    expect(familyRouter).toContain('const announcement = await getAnnouncementById(input.roomId, input.announcementId)');
    expect(familyRouter).toContain('canDelete: comment.authorUserId === userId');
    expect(familyDb).toContain('eq(announcementComments.roomId, roomId)');
    expect(familyDb).toContain('eq(announcementComments.announcementId, announcementId)');
    expect(familyDb).toContain('eq(announcementComments.authorUserId, authorUserId)');
    expect(familyDb).toContain('Announcement comment clientId belongs to another user');
  });

  it('keeps the plus reaction picker and loads text comments only after one card is expanded', () => {
    expect(familyPage).toContain("const REACTION_EMOJIS = ['👍', '❤️', '👏', '🙏', '😢', '✨']");
    expect(familyPage).toContain("{showPicker ? '✕' : '＋'}");
    expect(familyPage).toContain("💬 {commentsOpen ? '收起' : '评论'}");
    expect(familyPage).toContain('commentsOpen && roomId && announcementId ? (');
    expect(familyPage).toContain('<AnnouncementComments');
    expect(familyPage).not.toContain('cloudGetAnnouncementComments(');
    expect(comments).toContain('cloudGetAnnouncementComments(announcementId, roomId)');
  });

  it('uses a room-scoped cache and never lets cached delete permission cross accounts', () => {
    expect(storage).toContain("ANNOUNCEMENT_COMMENTS: 'announcement_comments_v1'");
    expect(storage).toContain('roomKey(KEYS.ANNOUNCEMENT_COMMENTS, roomId)');
    expect(comments).toContain('canDelete is tied to the authenticated user and must be refreshed from the server');
    expect(comments).toContain('canDelete: false');
    expect(cloudSync).toContain('cloudGetAnnouncementComments(announcementId: number, roomId: number)');
  });

  it('stores and renders the commenter local date plus time consistently across viewer time zones', () => {
    expect(comments).toContain('date: todayStr()');
    expect(comments).toContain('localTimeStr: localTimeStr()');
    expect(comments).toContain('`${match[1]}年${Number(match[2])}月${Number(match[3])}日 ${comment.localTimeStr}`');
    expect(familyRouter).toContain('date: input.date');
    expect(familyRouter).toContain('localTimeStr: input.localTimeStr');
  });

  it('keeps multiline input above the keyboard and preserves text when sending fails', () => {
    expect(familyPage).toContain('<KeyboardAvoidingView');
    expect(familyPage).toContain("behavior={Platform.OS === 'ios' ? 'padding' : 'height'}");
    expect(familyPage).toContain('onLayout={handleCommentScrollLayout}');
    expect(keyboardScroll).toContain('UIManager.measureLayout(');
    expect(keyboardScroll).toContain('inputY + inputHeight - visibleHeight + extraClearance');
    expect(keyboardScroll).toContain('scrollResponderScrollNativeHandleToKeyboard?.(');
    expect(comments).toContain('multiline');
    expect(comments).toContain('submitBehavior="newline"');
    expect(comments).toContain('刚才输入的文字仍然保留');
    expect(comments).toContain('setCommentText(\'\')');
  });

  it('hides the floating publish button throughout comment editing and restores it only after the keyboard closes', () => {
    expect(familyPage).toContain("activeSection === 'broadcast' && !keyboardVisible && !commentInputFocused");
    expect(comments).toContain('onBlur={onInputBlur}');
    expect(keyboardScroll).toContain("const keyboardHideEvent = 'keyboardDidHide'");
    expect(keyboardScroll).toContain('setKeyboardVisible(false)');
  });

  it('applies the same diary-style keyboard movement to every morning and evening check-in text field', () => {
    expect(checkin).toContain('useKeyboardAwareScroll(32)');
    expect(checkin).toContain('keyboardVerticalOffset={0}');
    expect(checkin).toContain('formKeyboardVisible && styles.containerKeyboardOpen');
    expect(checkin).toContain('containerKeyboardOpen: { paddingBottom: 220 }');
    expect((checkin.match(/onFocus=\{event => revealFormInput\(event\.nativeEvent\.target\)\}/g) ?? []).length).toBe(3);
    expect((checkin.match(/onBlur=\{blurFormInput\}/g) ?? []).length).toBe(3);
    expect((checkin.match(/submitBehavior="newline"/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('sends an explicit object notification and opens the exact announcement comments after switching profiles', () => {
    expect(familyRouter).toContain('`${member.name || \'家人\'} 回复了 ${announcement.authorName || \'家人\'} 的公告`');
    expect(familyRouter).toContain("type: 'announcement_comment'");
    expect(familyRouter).toContain('announcementId: input.announcementId');
    expect(rootLayout).toContain("data?.type === 'announcement_comment'");
    expect(rootLayout).toContain("announcementId: data?.announcementId ? String(data.announcementId) : undefined");
    expect(familyPage).toContain("params.openComments === '1'");
    expect(familyPage).toContain('visibleOlderAnnouncements');
  });
});


describe('Sleep overview card and restrained warm visual hierarchy', () => {
  const trend = read('components/trend-chart.tsx');
  const caregiverHome = read('app/(tabs)/index.tsx');
  const joinerHome = read('components/joiner-home.tsx');
  const weeklyOverview = trend.slice(
    trend.indexOf('function SleepOverviewChart'),
    trend.indexOf('const sleepOverviewStyles'),
  );

  it('shows one prominent latest sleep value beside a compact seven-day trend', () => {
    expect(trend).toContain('function SleepOverviewChart');
    expect(trend).toContain("focusPoint?.isToday ? '今日睡眠' : focusPoint ? '最近睡眠' : '睡眠记录'");
    expect(trend).toContain("{focusPoint ? focusPoint.value.toFixed(1) : '--'}");
    expect(trend).toContain('近7天趋势');
    expect(trend).toContain("recorded.length > 0 ? `平均 ${average.toFixed(1)}h` : '等待记录'");
    expect(weeklyOverview).not.toContain('<Text style={[sleepOverviewStyles.valueLabel');
  });

  it('uses the rightmost recorded day as the focus and keeps missing days distinct from zero', () => {
    expect(trend).toContain('data.reduce((latest, point, index) => point.hasData ? index : latest, -1)');
    expect(trend).toContain('point.hasData ? (');
    expect(trend).toContain("point.hasData ? `睡眠${point.value.toFixed(1)}小时` : '暂无睡眠记录'");
    expect(trend).toContain('backgroundColor: AppColors.bg.secondary');
  });

  it('bottom-aligns seven equal-width bars and highlights only the latest valid day', () => {
    expect(trend).toContain("barsArea: { flex: 1, flexDirection: 'row', alignItems: 'flex-end'");
    expect(trend).toContain("barColumn: { flex: 1, minWidth: 0");
    expect(trend).toContain('backgroundColor: isFocus ? AppColors.coral.primary : AppColors.green.primary');
    expect(trend).toContain('dayLabelFocus: { color: AppColors.coral.primary');
  });

  it('keeps the monthly line chart and gives caregivers and Joiners the exact same component', () => {
    expect(trend).toContain('<MonthlyLineChart');
    expect(trend).toContain('<SleepOverviewChart data={sleepData} />');
    expect(caregiverHome).toContain('<TrendChart checkIns={allCheckIns}');
    expect(joinerHome).toContain('<TrendChart');
  });

  it('stays readable on narrow phones without changing the established information architecture', () => {
    expect(trend).toContain("primaryData: { width: '39%', minWidth: 0");
    expect(trend).toContain('trendArea: { flex: 1, minWidth: 0');
    expect(trend).toContain('adjustsFontSizeToFit');
    expect(trend).toContain('minimumFontScale={0.75}');
    expect(trend).toContain("sectionCard: {\n    backgroundColor: AppColors.surface.whiteStrong, borderRadius: 20");
  });

  it('uses warm ivory surfaces, low-opacity shadows, stronger type hierarchy, and retains friendly Emoji', () => {
    expect(trend).toContain('shadowOpacity: 0.05, shadowRadius: 14, elevation: 2');
    expect(trend).toContain("sectionTitle: { fontSize: 16, lineHeight: 21, fontWeight: '800'");
    expect(trend).toContain('<Text style={styles.sectionIcon}>😴</Text>');
    expect(trend).toContain('<Text style={styles.sectionIcon}>☀️</Text>');
  });
});


describe('Durable diary draft recovery and one-time publishing', () => {
  const storage = read('lib/storage.ts');
  const cloudSync = read('lib/cloud-sync.ts');
  const familyRouter = read('server/family-router.ts');
  const familyDb = read('server/family-db.ts');
  const schema = read('drizzle/schema.ts');
  const dbMigrations = read('server/db.ts');

  it('assigns a persistent client identity before a new draft can leave the editor', () => {
    expect(storage).toContain('clientId: generateId(),');
    expect(cloudSync).toContain('clientId: diary.clientId');
    expect(schema).toContain('clientId: varchar("clientId", { length: 100 })');
  });

  it('reconciles a reopened draft by room, author and clientId before legacy content matching', () => {
    expect(storage).toContain('remote.authorUserId === userId && remote.clientId === entry.clientId');
    expect(familyRouter).toContain('getDiaryEntryByClientId(input.roomId, userId, input.clientId)');
    expect(familyDb).toContain('eq(diaryEntries.roomId, roomId)');
    expect(familyDb).toContain('eq(diaryEntries.authorUserId, authorUserId)');
    expect(familyDb).toContain('eq(diaryEntries.clientId, clientId)');
  });

  it('creates the diary client identity column and unique index during production migration', () => {
    expect(dbMigrations).toContain("{ table: 'diary_entries',  column: 'clientId',     definition: 'varchar(100)' }");
    expect(dbMigrations).toContain('uq_diary_entries_room_author_client');
    expect(schema).toContain('uniqueIndex("uq_diary_entries_room_author_client").on(table.roomId, table.authorUserId, table.clientId)');
  });

  it('publishes durable drafts directly and bounds both diary network and external push waits', () => {
    expect(storage).toContain('if (!serverDiaryId && !hadPersistentClientId)');
    expect(storage).toContain('const legacyPending = pending.filter(entry => !entry.serverDiaryId && !entry.clientId);');
    expect(cloudSync).toContain('const DIARY_CLOUD_TIMEOUT_MS = 12_000;');
    expect(cloudSync).toContain("}), '日记发布');");
    expect(cloudSync).toContain("'日记刷新',");
    expect(familyRouter).toContain('signal: AbortSignal.timeout(8_000)');
  });

  it('reports the real publish failure and emits privacy-safe server diagnostics', () => {
    const diaryEdit = read('app/diary-edit.tsx');
    const trpcServer = read('server/_core/trpc.ts');
    expect(cloudSync).toContain("errorCode: 'AUTH_REQUIRED'");
    expect(cloudSync).toContain('const sessionToken = await getSessionToken();');
    expect(storage).toContain('getLastDiaryPublishFailure');
    expect(diaryEdit).toContain("failure?.code === 'AUTH_REQUIRED'");
    expect(diaryEdit).toContain('完整日记和全部对话仍安全保存在本机，不会丢失。');
    expect(trpcServer).toContain('[Auth] Protected request rejected path=${opts.path}');
    expect(familyRouter).toContain('[DiarySync] start user=${userId}');
    expect(familyRouter).toContain('[DiarySync] success diary=${entry.id}');
  });
});


describe('Diary draft-to-published list state', () => {
  const diaryList = read('app/(tabs)/diary.tsx');
  const diaryStorage = read('lib/storage.ts');

  it('keeps unsubmitted conversation drafts and cloud-confirmed published entries in mutually exclusive sections', () => {
    expect(diaryList).toContain('const conversationDrafts = entries.filter(entry => entry.conversationFinished === false);');
    expect(diaryList).toContain('const publishedEntries = entries.filter(entry => entry.conversationFinished !== false);');
    expect(diaryStorage).toContain('serverDiaryId: Number(resolvedServerId), syncPending: false, roomId');
  });
});
