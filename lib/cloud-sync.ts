/**
 * 小马虎 Cloud Sync Layer
 * 
 * Strategy: "Local-first, sync-on-write"
 * - All data is still saved to AsyncStorage first (offline support)
 * - After local save, data is synced to server in background
 * - On app launch / pull-to-refresh, data is fetched from server
 * - Family members see shared data from server
 * 
 * This module wraps the tRPC client to provide sync functions.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { getSessionToken, getUserInfo } from '@/lib/_core/auth';
import { getApiBaseUrl } from '@/constants/oauth';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SyncState {
  activeRoomId: number | null;
  userId: number | null;
  isLoggedIn: boolean;
}

// ─── Sync State ──────────────────────────────────────────────────────────────

const SYNC_KEYS = {
  ACTIVE_ROOM_ID: 'cloud_active_room_id',
  USER_ID: 'cloud_user_id',
  LAST_SYNC: 'cloud_last_sync',
} as const;

/**
 * 本地缓存采用 stale-while-revalidate 策略：先显示当前家庭缓存，再在每次页面进入时后台校验云端。
 * 因此页面不会因网络等待而卡顿，但重新打开时仍会获取最新数据。
 * 缓存时间必须携带 roomId，避免同一用户切换多个家庭后复用错误的刷新状态。
 */
const CACHE_FRESHNESS_PREFIX = 'cloud_cache_freshness_v1';
// 0 表示每次进入页面都后台拉取；本地缓存仍会先于网络结果立即显示。
export const DEFAULT_CACHE_MAX_AGE_MS = 0;

function cacheFreshnessKey(roomId: number, scope: string): string {
  return `${CACHE_FRESHNESS_PREFIX}:${roomId}:${scope}`;
}

/** 正常进入页面也会后台校验云端；force=true 用于通知跳转等需要明确跳过任何优化的场景。 */
export async function shouldRefreshCloudCache(
  roomId: number | null | undefined,
  scope: string,
  maxAgeMs = DEFAULT_CACHE_MAX_AGE_MS,
  force = false,
): Promise<boolean> {
  if (!roomId || force) return true;
  try {
    const raw = await AsyncStorage.getItem(cacheFreshnessKey(roomId, scope));
    const refreshedAt = raw ? Number(raw) : 0;
    return !Number.isFinite(refreshedAt) || Date.now() - refreshedAt >= maxAgeMs;
  } catch {
    // 缓存元数据读取失败时宁可刷新，保证数据正确性。
    return true;
  }
}

/** 仅在云端请求成功返回后写入新鲜度时间。 */
export async function markCloudCacheFresh(roomId: number, scope: string): Promise<void> {
  try {
    await AsyncStorage.setItem(cacheFreshnessKey(roomId, scope), String(Date.now()));
  } catch {
    // 元数据写入失败不影响已展示的数据；下次自然会重新刷新。
  }
}

/** 在家庭切换等场景下使缓存立即过期，下一次进入会重新校验云端。 */
export async function invalidateCloudCache(roomId: number, scope?: string): Promise<void> {
  try {
    if (scope) {
      await AsyncStorage.removeItem(cacheFreshnessKey(roomId, scope));
      return;
    }
    const keys = await AsyncStorage.getAllKeys();
    const prefix = `${CACHE_FRESHNESS_PREFIX}:${roomId}:`;
    const targets = keys.filter(key => key.startsWith(prefix));
    if (targets.length) await AsyncStorage.multiRemove(targets);
  } catch {
    // 不阻断用户操作；下次刷新仍会以本地/云端兜底。
  }
}

let _trpcClient: any = null;
const DIARY_CLOUD_TIMEOUT_MS = 12_000;

/** 日记发布和列表刷新不能无限等待网络；超时后保留本地内容并允许用户安全重试。 */
async function withDiaryCloudTimeout<T>(request: Promise<T>, operation: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${operation}请求超时`)), DIARY_CLOUD_TIMEOUT_MS);
  });
  try {
    return await Promise.race([request, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export type DiaryCloudFailureCode = 'AUTH_REQUIRED' | 'FORBIDDEN' | 'TIMEOUT' | 'MISSING_ROOM' | 'NETWORK';
export type DiaryCloudFailure = { success: false; errorCode: DiaryCloudFailureCode; errorMessage: string };

function diaryCloudFailure(error: unknown): DiaryCloudFailure {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const code = String((error as any)?.data?.code ?? (error as any)?.shape?.data?.code ?? '').toUpperCase();
  if (code === 'UNAUTHORIZED' || /please login|invalid session|未登录|登录/i.test(raw)) {
    return { success: false, errorCode: 'AUTH_REQUIRED', errorMessage: '登录状态已失效，请重新登录后再发布。' };
  }
  if (code === 'FORBIDDEN' || /forbidden|permission|权限/i.test(raw)) {
    return { success: false, errorCode: 'FORBIDDEN', errorMessage: '当前账号没有在这个家庭发布日记的权限。' };
  }
  if (/超时|timeout|aborted/i.test(raw)) {
    return { success: false, errorCode: 'TIMEOUT', errorMessage: '连接家庭云端超时，请检查网络后重试。' };
  }
  return { success: false, errorCode: 'NETWORK', errorMessage: '未能连接家庭云端，请检查网络后重试。' };
}

/** Initialize the sync layer with the tRPC client */
export function initCloudSync(trpcClient: any) {
  _trpcClient = trpcClient;
}

function getClient() {
  if (!_trpcClient) throw new Error('Cloud sync not initialized. Call initCloudSync() first.');
  return _trpcClient;
}

// ─── Sync State Management ───────────────────────────────────────────────────

export async function setCloudSyncState(state: Partial<SyncState>) {
  if (state.activeRoomId !== undefined) {
    await AsyncStorage.setItem(SYNC_KEYS.ACTIVE_ROOM_ID, String(state.activeRoomId ?? ''));
  }
  if (state.userId !== undefined) {
    await AsyncStorage.setItem(SYNC_KEYS.USER_ID, String(state.userId ?? ''));
  }
}

export async function clearCloudSyncState() {
  await AsyncStorage.multiRemove(Object.values(SYNC_KEYS));
}

export async function getCloudSyncState(): Promise<SyncState> {
  const roomId = await AsyncStorage.getItem(SYNC_KEYS.ACTIVE_ROOM_ID);
  const userId = await AsyncStorage.getItem(SYNC_KEYS.USER_ID);
  return {
    activeRoomId: roomId ? parseInt(roomId) : null,
    userId: userId ? parseInt(userId) : null,
    isLoggedIn: !!userId,
  };
}

export async function getActiveRoomId(): Promise<number | null> {
  const state = await getCloudSyncState();
  return state.activeRoomId;
}

// ─── Family Room Sync ────────────────────────────────────────────────────────

/** Create a family room on the server (called after onboarding) */
export async function cloudCreateRoom(params: {
  roomCode: string;
  elderName: string;
  elderEmoji?: string;
  elderPhotoUri?: string;
  memberName: string;
  memberRole: 'caregiver' | 'family' | 'nurse';
  memberRoleLabel: string;
  memberEmoji: string;
  memberColor: string;
  memberPhotoUri?: string;
  memberBirthYear?: number;
  elderProfile?: any;
}) {
  try {
    const client = getClient();
    const result = await client.family.createRoom.mutate(params);
    if (result.success) {
      await setCloudSyncState({ activeRoomId: result.roomId });
    }
    return result;
  } catch (e) {
    console.warn('[CloudSync] createRoom failed:', e);
    return null;
  }
}

/** Join a family room by invite code */
export async function cloudJoinRoom(params: {
  roomCode: string;
  memberName: string;
  memberRole?: 'caregiver' | 'family' | 'nurse';
  memberRoleLabel: string;
  memberEmoji: string;
  memberColor: string;
  memberPhotoUri?: string;
  memberBirthYear?: number;
  relationship?: string;
}) {
  try {
    const client = getClient();
    const result = await client.family.joinRoom.mutate(params);
    if (result.success) {
      await setCloudSyncState({ activeRoomId: result.roomId });
    }
    return result;
  } catch (e) {
    console.warn('[CloudSync] joinRoom failed:', e);
    return null;
  }
}

/** Look up a room by invite code (preview) */
export async function cloudLookupRoom(roomCode: string) {
  try {
    const client = getClient();
    return await client.family.lookupRoom.query({ roomCode });
  } catch (e) {
    console.warn('[CloudSync] lookupRoom failed:', e);
    return null;
  }
}

/** Get all rooms the user belongs to */
export async function cloudGetMyRooms() {
  try {
    const client = getClient();
    return await client.family.myRooms.query();
  } catch (e) {
    console.warn('[CloudSync] myRooms failed:', e);
    // null 表示网络/认证请求失败；[] 只表示服务器成功确认账号当前没有家庭。
    return null;
  }
}

/** Get full room detail (members, elder profile) */
export async function cloudGetRoomDetail(roomId: number) {
  try {
    const client = getClient();
    return await client.family.getRoomDetail.query({ roomId });
  } catch (e) {
    console.warn('[CloudSync] getRoomDetail failed:', e);
    // 交给调用方区分断网与 NOT_FOUND/FORBIDDEN；不能把所有失败都伪装成“房间不存在”。
    throw e;
  }
}

/** Leave a family room (joiner) */
export async function cloudLeaveRoom(roomId: number) {
  try {
    const client = getClient();
    return await client.family.leaveRoom.mutate({ roomId });
  } catch (e) {
    console.warn('[CloudSync] leaveRoom failed:', e);
    return null;
  }
}

/** Update current user's member profile in a room (e.g. photo, emoji) */
export async function cloudUpdateMemberProfile(params: {
  roomId: number;
  name?: string;
  emoji?: string;
  photoUri?: string;
  birthYear?: number;
  relationship?: string;
}) {
  try {
    const client = getClient();
    return await client.family.updateMemberProfile.mutate(params);
  } catch (e) {
    console.warn('[CloudSync] updateMemberProfile failed:', e);
    return null;
  }
}

/** Delete a family room (creator only) */
export async function cloudDeleteRoom(roomId: number) {
  try {
    const client = getClient();
    return await client.family.deleteRoom.mutate({ roomId });
  } catch (e) {
    console.warn('[CloudSync] deleteRoom failed:', e);
    return null;
  }
}

/** Delete an announcement (creator or author only) */
export async function cloudDeleteAnnouncement(announcementId: number, roomId: number) {
  try {
    const client = getClient();
    return await client.family.deleteAnnouncement.mutate({ announcementId, roomId });
  } catch (e) {
    console.warn('[CloudSync] deleteAnnouncement failed:', e);
    return null;
  }
}

// ─── Check-in Sync ─────────────────────────────────────────────────────────────────────

/** Sync a check-in to the server (call after local save) */
export async function cloudSyncCheckIn(checkIn: any, explicitRoomId?: number | string | null) {
  const roomId = explicitRoomId ? Number(explicitRoomId) : await getActiveRoomId();
  if (!roomId) return null;
  try {
    const client = getClient();
    return await client.family.syncCheckIn.mutate({
      roomId,
      date: checkIn.date,
      sleepHours: checkIn.sleepHours,
      sleepQuality: checkIn.sleepQuality,
      sleepInput: checkIn.sleepInput,
      sleepScore: checkIn.sleepScore,
      sleepProblems: checkIn.sleepProblems,
      sleepType: checkIn.sleepType,
      sleepSegments: checkIn.sleepSegments,
      awakeHours: checkIn.awakeHours,
      nightWakings: checkIn.nightWakings,
      daytimeNap: checkIn.daytimeNap,
      napMinutes: checkIn.napMinutes,
      morningNotes: checkIn.morningNotes,
      morningDone: checkIn.morningDone,
      moodEmoji: checkIn.moodEmoji,
      moodScore: checkIn.moodScore,
      medicationTaken: checkIn.medicationTaken,
      medicationNotes: checkIn.medicationNotes,
      mealNotes: checkIn.mealNotes,
      mealOption: checkIn.mealOption,
      eveningNotes: checkIn.eveningNotes,
      eveningDone: checkIn.eveningDone,
      aiMessage: checkIn.aiMessage,
      careScore: checkIn.careScore,
      completedAt: checkIn.completedAt,
    });
  } catch (e) {
    console.warn('[CloudSync] syncCheckIn failed:', e);
    return null;
  }
}

/** Fetch check-ins from server (for family members to view) */
export async function cloudGetCheckIns(roomId?: number, limit = 30) {
  const rid = roomId ?? await getActiveRoomId();
  if (!rid) return null;
  try {
    const client = getClient();
    return await client.family.getCheckIns.query({ roomId: rid, limit });
  } catch (e) {
    console.warn('[CloudSync] getCheckIns failed:', e);
    // null 表示网络或权限失败；[] 才表示服务器成功返回“没有打卡记录”。
    return null;
  }
}

// ─── Diary Sync ──────────────────────────────────────────────────────────────

/** 构造 tRPC 与 HTTP 兼容端点共享的日记载荷，避免两条传输通道发生字段漂移。 */
function diarySyncPayload(diary: any, roomId: number, serverDiaryId?: number) {
  return {
    roomId,
    serverDiaryId,
    clientId: diary.clientId,
    date: diary.date,
    content: diary.content,
    moodEmoji: diary.moodEmoji,
    moodLabel: diary.moodLabel,
    moodScore: diary.moodScore,
    tags: diary.tags,
    caregiverMoodEmoji: diary.caregiverMoodEmoji,
    caregiverMoodLabel: diary.caregiverMoodLabel,
    aiReply: diary.aiReply ?? diary.smartReply,
    aiEmoji: diary.aiEmoji,
    aiTip: diary.aiTip ?? diary.smartTip,
    conversation: diary.conversation,
    conversationFinished: diary.conversationFinished,
    // 仅用于确认本轮 TestFlight 发布链路，不包含日记正文或对话内容。
    publishRevision: diary.publishRevision,
    localTimeStr: diary.localTimeStr,
  };
}

/** tRPC 传输异常时，最终发布可使用同认证、同业务路由的 HTTP 兼容端点。 */
async function cloudSyncDiaryFallback(payload: Record<string, unknown>, sessionToken: string | null): Promise<any> {
  try {
    const response = await withDiaryCloudTimeout(
      fetch(`${getApiBaseUrl()}/api/diary-sync-fallback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      }),
      '日记发布兼容',
    );
    const result = await response.json().catch(() => null);
    if (result && typeof result === 'object') return result;
    return { success: false, errorCode: 'NETWORK', errorMessage: '家庭云端没有返回有效响应，请稍后重试。' } satisfies DiaryCloudFailure;
  } catch (error) {
    console.warn('[CloudSync] syncDiary fallback failed:', error);
    return diaryCloudFailure(error);
  }
}

/** Sync a diary entry to the server */
export async function cloudSyncDiary(diary: any, serverDiaryId?: number, explicitRoomId?: number | string | null) {
  const roomId = explicitRoomId ? Number(explicitRoomId) : await getActiveRoomId();
  if (!roomId) {
    return { success: false, errorCode: 'MISSING_ROOM', errorMessage: '当前家庭信息尚未准备好，请重新进入家庭后再发布。' } satisfies DiaryCloudFailure;
  }
  const sessionToken = Platform.OS !== 'web' ? await getSessionToken() : null;
  if (Platform.OS !== 'web' && !sessionToken) {
    return { success: false, errorCode: 'AUTH_REQUIRED', errorMessage: '登录状态已失效，请重新登录后再发布。' } satisfies DiaryCloudFailure;
  }
  const payload = diarySyncPayload(diary, roomId, serverDiaryId);
  try {
    const client = getClient();
    const result = await withDiaryCloudTimeout<any>(client.family.syncDiary.mutate(payload), '日记发布');
    // 只在用户正式发布时回退，普通草稿/对话同步仍严格使用原有 tRPC 通道。
    if (diary.conversationFinished === true && !result?.success) {
      return await cloudSyncDiaryFallback(payload, sessionToken);
    }
    return result;
  } catch (e) {
    console.warn('[CloudSync] syncDiary failed:', e);
    // 当前现场问题是最终发布在 tRPC 传输阶段没有进入路由；回退仍会通过同一身份和业务校验。
    if (diary.conversationFinished === true) {
      return await cloudSyncDiaryFallback(payload, sessionToken);
    }
    return diaryCloudFailure(e);
  }
}

/**
 * Finalize a diary that has already synced its full private conversation.
 * This deliberately sends only stable identifiers, so a long restored draft
 * does not need to traverse the network again just to become family-visible.
 */
export async function cloudPublishDiary(diaryId: number, explicitRoomId?: number | string | null) {
  const roomId = explicitRoomId ? Number(explicitRoomId) : await getActiveRoomId();
  if (!roomId) {
    return { success: false, errorCode: 'MISSING_ROOM', errorMessage: '当前家庭信息尚未准备好，请重新进入家庭后再发布。' } satisfies DiaryCloudFailure;
  }
  if (Platform.OS !== 'web') {
    const sessionToken = await getSessionToken();
    if (!sessionToken) {
      return { success: false, errorCode: 'AUTH_REQUIRED', errorMessage: '登录状态已失效，请重新登录后再发布。' } satisfies DiaryCloudFailure;
    }
  }
  try {
    const client = getClient();
    return await withDiaryCloudTimeout<any>(
      client.family.publishDiary.mutate({ roomId, diaryId }),
      '日记发布确认',
    );
  } catch (e) {
    console.warn('[CloudSync] publishDiary failed:', e);
    return diaryCloudFailure(e);
  }
}

/** Delete one diary from the server. The server verifies room membership and authorship. */
export async function cloudDeleteDiary(diaryId: number, roomId?: number) {
  const rid = roomId ?? await getActiveRoomId();
  if (!rid) return null;
  try {
    const client = getClient();
    return await client.family.deleteDiary.mutate({ roomId: rid, diaryId });
  } catch (e) {
    console.warn('[CloudSync] deleteDiary failed:', e);
    return null;
  }
}

/** Fetch diary entries from server */
export async function cloudGetDiaries(roomId?: number, limit = 100) {
  const rid = roomId ?? await getActiveRoomId();
  if (!rid) return null;
  try {
    const client = getClient();
    return await withDiaryCloudTimeout<any>(
      client.family.getDiaries.query({ roomId: rid, limit }),
      '日记刷新',
    );
  } catch (e) {
    console.warn('[CloudSync] getDiaries failed:', e);
    // null 表示网络/权限失败；[] 才表示服务端成功返回“当前家庭没有日记”。
    return null;
  }
}

/** Record that the current family member opened a published diary. */
export async function cloudMarkDiaryRead(diaryId: number, roomId?: number) {
  const rid = roomId ?? await getActiveRoomId();
  if (!rid) return null;
  try {
    const client = getClient();
    return await client.family.markDiaryRead.mutate({ roomId: rid, diaryId });
  } catch (e) {
    console.warn('[CloudSync] markDiaryRead failed:', e);
    return null;
  }
}

/** Fetch readers and family comments for one diary. */
export async function cloudGetDiaryInteractions(diaryId: number, roomId?: number) {
  const rid = roomId ?? await getActiveRoomId();
  if (!rid) return { readers: [], comments: [], loadFailed: true };
  try {
    const client = getClient();
    const result = await client.family.getDiaryInteractions.query({ roomId: rid, diaryId });
    return { ...result, loadFailed: false };
  } catch (e) {
    console.warn('[CloudSync] getDiaryInteractions failed:', e);
    return { readers: [], comments: [], loadFailed: true };
  }
}

/** Add a family comment below a published diary. */
export async function cloudAddDiaryComment(diaryId: number, content: string, roomId?: number) {
  const rid = roomId ?? await getActiveRoomId();
  if (!rid) return null;
  try {
    const client = getClient();
    return await client.family.addDiaryComment.mutate({ roomId: rid, diaryId, content });
  } catch (e) {
    console.warn('[CloudSync] addDiaryComment failed:', e);
    return null;
  }
}

/** Delete one of the current user's own diary comments. */
export async function cloudDeleteDiaryComment(commentId: number, roomId?: number) {
  const rid = roomId ?? await getActiveRoomId();
  if (!rid) return null;
  try {
    const client = getClient();
    return await client.family.deleteDiaryComment.mutate({ roomId: rid, commentId });
  } catch (e) {
    console.warn('[CloudSync] deleteDiaryComment failed:', e);
    return null;
  }
}

/** Fetch reader names and comment counts for diary list cards in one request. */
export async function cloudGetDiaryInteractionSummaries(diaryIds: number[], roomId?: number) {
  const rid = roomId ?? await getActiveRoomId();
  if (!rid || diaryIds.length === 0) return [];
  try {
    const client = getClient();
    return await client.family.getDiaryInteractionSummaries.query({ roomId: rid, diaryIds });
  } catch (e) {
    console.warn('[CloudSync] getDiaryInteractionSummaries failed:', e);
    return [];
  }
}

// ─── Announcement Sync ───────────────────────────────────────────────────────

/** Post a family announcement */
export async function cloudPostAnnouncement(params: {
  clientId?: string;
  content: string;
  emoji?: string;
  type?: 'news' | 'visit' | 'medical' | 'daily' | 'reminder';
  date: string;
  localTimeStr?: string;
  roomId?: number;
}) {
  const roomId = params.roomId ?? await getActiveRoomId();
  if (!roomId) return null;
  try {
    const client = getClient();
    return await client.family.postAnnouncement.mutate({
      roomId,
      clientId: params.clientId,
      content: params.content,
      emoji: params.emoji,
      type: params.type ?? 'daily',
      date: params.date,
      localTimeStr: params.localTimeStr,
    });
  } catch (e) {
    console.warn('[CloudSync] postAnnouncement failed:', e);
    return null;
  }
}

/** Fetch announcements from server */
export async function cloudGetAnnouncements(roomId?: number, limit = 50) {
  const rid = roomId ?? await getActiveRoomId();
  if (!rid) return null;
  try {
    const client = getClient();
    return await client.family.getAnnouncements.query({ roomId: rid, limit });
  } catch (e) {
    console.warn('[CloudSync] getAnnouncements failed:', e);
    // null 表示网络失败；[] 表示服务器确认当前家庭没有公告。
    return null;
  }
}

/** Load comments for one expanded announcement. Network failure is distinct from an empty list. */
export async function cloudGetAnnouncementComments(announcementId: number, roomId: number) {
  if (!roomId || !announcementId) return { comments: [], loadFailed: true };
  try {
    const client = getClient();
    const comments = await client.family.getAnnouncementComments.query({ roomId, announcementId });
    return { comments, loadFailed: false };
  } catch (e) {
    console.warn('[CloudSync] getAnnouncementComments failed:', e);
    return { comments: [], loadFailed: true };
  }
}

/** Add one flat comment under an announcement. */
export async function cloudAddAnnouncementComment(params: {
  roomId: number;
  announcementId: number;
  clientId: string;
  content: string;
  date: string;
  localTimeStr: string;
}) {
  if (!params.roomId || !params.announcementId) return null;
  try {
    const client = getClient();
    return await client.family.addAnnouncementComment.mutate(params);
  } catch (e) {
    console.warn('[CloudSync] addAnnouncementComment failed:', e);
    return null;
  }
}

/** Delete one of the current user's own announcement comments. */
export async function cloudDeleteAnnouncementComment(
  commentId: number,
  announcementId: number,
  roomId: number,
) {
  if (!roomId || !announcementId || !commentId) return null;
  try {
    const client = getClient();
    return await client.family.deleteAnnouncementComment.mutate({ roomId, announcementId, commentId });
  } catch (e) {
    console.warn('[CloudSync] deleteAnnouncementComment failed:', e);
    return null;
  }
}

/** React to an announcement */
export async function cloudReactToAnnouncement(announcementId: number, emoji: string, roomId?: number) {
  const rid = roomId ?? await getActiveRoomId();
  if (!rid) return null;
  try {
    const client = getClient();
    return await client.family.reactToAnnouncement.mutate({
      announcementId,
      roomId: rid,
      emoji,
    });
  } catch (e) {
    console.warn('[CloudSync] reactToAnnouncement failed:', e);
    return null;
  }
}

// ─── Briefing Sync ───────────────────────────────────────────────────────────

/** Save a generated briefing to the server */
export async function cloudSaveBriefing(briefing: any, roomId?: number) {
  const rid = roomId ?? await getActiveRoomId();
  if (!rid) return null;
  try {
    const client = getClient();
    return await client.family.saveBriefing.mutate({
      roomId: rid,
      date: briefing.date,
      careScore: briefing.careScore,
      summary: briefing.summary,
      encouragement: briefing.encouragement,
      highlights: briefing.highlights,
      attention: briefing.attention,
      shareText: briefing.shareText,
      generatedAt: briefing.generatedAt,
      checkInDate: briefing.checkInDate,
    });
  } catch (e) {
    console.warn('[CloudSync] saveBriefing failed:', e);
    return null;
  }
}

/** Fetch briefings from server (family members can view) */
export async function cloudGetBriefings(roomId?: number, limit = 14) {
  const rid = roomId ?? await getActiveRoomId();
  if (!rid) return null;
  try {
    const client = getClient();
    return await client.family.getBriefings.query({ roomId: rid, limit });
  } catch (e) {
    console.warn('[CloudSync] getBriefings failed:', e);
    return null;
  }
}

// ─── Medication Sync ─────────────────────────────────────────────────────────

/** Sync a medication to the server */
export async function cloudSyncMedication(med: any, serverMedId?: number, roomId?: number, changeEvents?: any[]) {
  const rid = roomId ?? await getActiveRoomId();
  if (!rid) return null;
  try {
    const client = getClient();
    return await client.family.syncMedication.mutate({
      roomId: rid,
      serverMedId,
      clientId: String(med.id || '').replace(/^cloud_/, '') || undefined,
      name: med.name,
      dosage: med.dosage,
      frequency: med.frequency,
      times: med.times,
      notes: med.notes,
      icon: med.icon,
      active: med.active,
      reminderEnabled: med.reminderEnabled,
      color: med.color,
      changeEvents,
    });
  } catch (e) {
    console.warn('[CloudSync] syncMedication failed:', e);
    return null;
  }
}

/** Fetch medications from server */
export async function cloudGetMedications(roomId?: number) {
  const rid = roomId ?? await getActiveRoomId();
  if (!rid) return null;
  try {
    const client = getClient();
    return await client.family.getMedications.query({ roomId: rid });
  } catch (e) {
    console.warn('[CloudSync] getMedications failed:', e);
    // null 表示加载失败；[] 表示服务器确认当前家庭没有用药记录。
    return null;
  }
}

/** Fetch the family-visible medication adjustment timeline. */
export async function cloudGetMedicationChanges(roomId?: number, limit = 100) {
  const rid = roomId ?? await getActiveRoomId();
  if (!rid) return null;
  try {
    const client = getClient();
    return await client.family.getMedicationChanges.query({ roomId: rid, limit });
  } catch (e) {
    console.warn('[CloudSync] getMedicationChanges failed:', e);
    return null;
  }
}

/** Delete a medication using its stable server ID, with name matching only for legacy local rows. */
export async function cloudDeleteMedication(serverMedId: number | undefined, medName: string, roomId?: number, changeEvent?: any, clientId?: string) {
  const rid = roomId ?? await getActiveRoomId();
  if (!rid) return null;
  try {
    const client = getClient();
    let medicationId = serverMedId;
    if (!medicationId) {
      const serverMeds = await client.family.getMedications.query({ roomId: rid });
      // 新客户端按 clientId 精确关联；只有真正的旧数据才使用名称兼容匹配。
      const match = clientId
        ? serverMeds.find((m: any) => m.clientId === clientId)
        : serverMeds.find((m: any) => m.name === medName);
      if (!match) return { success: true }; // 从未同步到服务器，本地可直接删除。
      medicationId = match.id;
    }
    return await client.family.deleteMedication.mutate({ roomId: rid, medicationId, changeEvent });
  } catch (e) {
    console.warn('[CloudSync] deleteMedication failed:', e);
    return null;
  }
}

// ─── Elder Profile Sync ──────────────────────────────────────────────────────
/** Get elder profile from server */
export async function cloudGetElderProfile(roomId?: number) {
  const rid = roomId ?? await getActiveRoomId();
  if (!rid) return null;
  try {
    const client = getClient();
    return await client.family.getElderProfile.query({ roomId: rid });
  } catch (e) {
    console.warn('[CloudSync] getElderProfile failed:', e);
    return null;
  }
}

/** Update elder profile on server */
export async function cloudUpdateElderProfile(profile: any, roomId?: number) {
  const rid = roomId ?? await getActiveRoomId();
  if (!rid) return null;
  try {
    const client = getClient();
    return await client.family.updateElderProfile.mutate({
      roomId: rid,
      ...profile,
    });
  } catch (e) {
    console.warn('[CloudSync] updateElderProfile failed:', e);
    return null;
  }
}

// ─── Full Sync (pull from server on app launch) ──────────────────────────────

/** Pull all shared data from server and merge into local storage */
export async function pullFromServer(roomId?: number) {
  const rid = roomId ?? await getActiveRoomId();
  if (!rid) return { success: false, reason: 'no_room' };

  try {
    const [checkInsData, diariesData, announcementsData, briefingsData, medsData, profileData] = await Promise.all([
      cloudGetCheckIns(rid),
      cloudGetDiaries(rid),
      cloudGetAnnouncements(rid),
      cloudGetBriefings(rid),
      cloudGetMedications(rid),
      cloudGetElderProfile(rid),
    ]);

    await AsyncStorage.setItem(SYNC_KEYS.LAST_SYNC, new Date().toISOString());

    return {
      success: true,
      data: {
        checkIns: checkInsData,
        diaries: diariesData,
        announcements: announcementsData,
        briefings: briefingsData,
        medications: medsData,
        elderProfile: profileData,
      },
    };
  } catch (e) {
    console.warn('[CloudSync] pullFromServer failed:', e);
    return { success: false, reason: 'network_error' };
  }
}

// ─── Reaction Toggle ───────────────────────────────────────────────────────────────────

/**
 * Toggle a reaction emoji on an announcement (server-authoritative).
 * Uses the `toggleReaction` route which handles add/remove idempotently.
 */
export async function cloudToggleReaction(
  announcementId: number,
  emoji: string,
  roomId?: number,
) {
  const rid = roomId ?? await getActiveRoomId();
  if (!rid) return null;
  try {
    const client = getClient();
    return await client.family.toggleReaction.mutate({
      announcementId,
      roomId: rid,
      emoji,
    });
  } catch (e) {
    console.warn('[CloudSync] toggleReaction failed:', e);
    return null;
  }
}

// ─── Push Token Registration ───────────────────────────────────────────────

/** Register or update the Expo push token on the server */
export async function cloudUpdatePushToken(pushToken: string) {
  const sessionToken = await getSessionToken();
  if (!sessionToken) {
    console.log('[CloudSync] Skipping push token registration: no session token');
    return false;
  }

  let userId = (await getCloudSyncState()).userId;
  if (!userId) {
    try {
      const userInfo = await getUserInfo();
      if (userInfo?.id) {
        userId = userInfo.id;
        await setCloudSyncState({ userId });
      }
    } catch {}
  }

  try {
    const client = getClient();
    await client.family.updatePushToken.mutate({ pushToken });
    console.log('[CloudSync] Push token registered successfully for user', userId ?? 'unknown');
    return true;
  } catch (e) {
    console.warn('[CloudSync] updatePushToken failed:', e);
    return false;
  }
}

// ─── Photo Upload ──────────────────────────────────────────────────────────
/**
 * Upload a photo to cloud storage (S3) and return the public URL.
 * Reads the local file URI, converts to base64, and sends to server.
 * @param localUri  - Local file URI from expo-image-picker (file://...)
 * @param scope     - "member" for joiner/caregiver self-photo, "elder" for elder photo
 * @param roomId    - Optional room ID; if provided, also updates member.photoUri in DB
 */
export async function cloudUploadPhoto(
  localUri: string,
  scope: 'member' | 'elder' = 'member',
  roomId?: number,
): Promise<string | null> {
  try {
    const client = getClient();
    const FileSystem = require('expo-file-system');

    // iOS 沙盒兼容：将图片复制到 App 缓存目录再读取，避免临时路径权限问题
    let readableUri = localUri;
    try {
      const cacheDir = FileSystem.cacheDirectory;
      if (cacheDir && !localUri.startsWith(cacheDir)) {
        const ext = localUri.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
        const destUri = `${cacheDir}upload_avatar_${Date.now()}.${ext}`;
        await FileSystem.copyAsync({ from: localUri, to: destUri });
        readableUri = destUri;
        console.log('[CloudSync] Copied photo to cache:', destUri);
      }
    } catch (copyErr) {
      console.warn('[CloudSync] copyAsync failed, using original URI:', copyErr);
      readableUri = localUri;
    }

    // 读取为 base64
    let base64: string;
    try {
      base64 = await FileSystem.readAsStringAsync(readableUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    } catch (readErr) {
      console.error('[CloudSync] readAsStringAsync failed:', readErr, 'uri:', readableUri);
      return null;
    }

    if (!base64 || base64.length < 100) {
      console.error('[CloudSync] base64 is empty or too short, aborting upload. uri:', readableUri);
      return null;
    }

    console.log(`[CloudSync] Uploading photo scope=${scope} roomId=${roomId} base64Len=${base64.length}`);
    const mimeType = readableUri.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
    const result = await client.family.uploadPhoto.mutate({
      base64,
      mimeType,
      scope,
      roomId,
    });
    if (result?.success && result.url) {
      console.log('[CloudSync] Upload success, url:', result.url);
      return result.url;
    }
    console.warn('[CloudSync] Upload returned no URL, result:', result);
    return null;
  } catch (e) {
    console.error('[CloudSync] uploadPhoto failed:', e);
    return null;
  }
}
