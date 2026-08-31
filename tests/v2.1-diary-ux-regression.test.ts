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
    expect(diaryEdit).toContain('<Text style={styles.summaryContent}>{content.trim()}</Text>');
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

describe('Published diary cloud consistency and privacy', () => {
  const storage = read('lib/storage.ts');
  const diaryEdit = read('app/diary-edit.tsx');
  const diaryList = read('app/(tabs)/diary.tsx');
  const router = read('server/family-router.ts');
  const familyDb = read('server/family-db.ts');

  it('waits for the complete conversation to reach the cloud before leaving the editor', () => {
    expect(diaryEdit).toContain('syncDiaryEntryNow(eid, familyId)');
    expect(diaryEdit).toContain("conversationFinished: true, syncPending: true");
    expect(diaryEdit).toContain('已保存到本机');
    expect(storage).toContain('export async function syncPendingDiaries');
    expect(diaryList).toContain('syncPendingDiaries(requestedFamilyId)');
  });

  it('keeps unfinished diaries private to their author and locks other authors at the API', () => {
    expect(router).toContain('entry.conversationFinished === true || entry.authorUserId === userId');
    expect(router).toContain('只能修改自己发布的日记');
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
    expect(storage).toContain('cloudSyncCheckIn(checkIn, rid)');
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
    expect(router).toContain('const newlyPublished = input.conversationFinished === true && existingEntry.conversationFinished !== true');
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
    expect(storage).toContain('cloudSaveBriefing(briefing, rid ? Number(rid) : undefined)');
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
    expect(medication).toContain('remoteClientId ? local.find');
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
    expect(index).toContain('daytimeNap: c.daytimeNap,');
    expect(index).toContain('napMinutes: c.napMinutes,');
    expect(index).not.toContain('napMinutes: c.napMinutes ?? 0,');
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
    expect((trend.match(/barCol: \{ flex: 1, minWidth: 0/g) ?? []).length).toBe(2);
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
