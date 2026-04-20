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

let _trpcClient: any = null;

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
    return [];
  }
}

/** Get full room detail (members, elder profile) */
export async function cloudGetRoomDetail(roomId: number) {
  try {
    const client = getClient();
    return await client.family.getRoomDetail.query({ roomId });
  } catch (e) {
    console.warn('[CloudSync] getRoomDetail failed:', e);
    return null;
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
export async function cloudSyncCheckIn(checkIn: any) {
  const roomId = await getActiveRoomId();
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
  if (!rid) return [];
  try {
    const client = getClient();
    return await client.family.getCheckIns.query({ roomId: rid, limit });
  } catch (e) {
    console.warn('[CloudSync] getCheckIns failed:', e);
    return [];
  }
}

// ─── Diary Sync ──────────────────────────────────────────────────────────────

/** Sync a diary entry to the server */
export async function cloudSyncDiary(diary: any, serverDiaryId?: number) {
  const roomId = await getActiveRoomId();
  if (!roomId) return null;
  try {
    const client = getClient();
    return await client.family.syncDiary.mutate({
      roomId,
      serverDiaryId,
      date: diary.date,
      content: diary.content,
      voiceUri: diary.voiceUri,
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
    });
  } catch (e) {
    console.warn('[CloudSync] syncDiary failed:', e);
    return null;
  }
}

/** Fetch diary entries from server */
export async function cloudGetDiaries(roomId?: number, limit = 30) {
  const rid = roomId ?? await getActiveRoomId();
  if (!rid) return [];
  try {
    const client = getClient();
    return await client.family.getDiaries.query({ roomId: rid, limit });
  } catch (e) {
    console.warn('[CloudSync] getDiaries failed:', e);
    return [];
  }
}

// ─── Announcement Sync ───────────────────────────────────────────────────────

/** Post a family announcement */
export async function cloudPostAnnouncement(params: {
  content: string;
  emoji?: string;
  type?: 'news' | 'visit' | 'medical' | 'daily' | 'reminder';
  date: string;
  roomId?: number;
}) {
  const roomId = params.roomId ?? await getActiveRoomId();
  if (!roomId) return null;
  try {
    const client = getClient();
    return await client.family.postAnnouncement.mutate({
      roomId,
      content: params.content,
      emoji: params.emoji,
      type: params.type ?? 'daily',
      date: params.date,
    });
  } catch (e) {
    console.warn('[CloudSync] postAnnouncement failed:', e);
    return null;
  }
}

/** Fetch announcements from server */
export async function cloudGetAnnouncements(roomId?: number, limit = 50) {
  const rid = roomId ?? await getActiveRoomId();
  if (!rid) return [];
  try {
    const client = getClient();
    return await client.family.getAnnouncements.query({ roomId: rid, limit });
  } catch (e) {
    console.warn('[CloudSync] getAnnouncements failed:', e);
    return [];
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
  if (!rid) return [];
  try {
    const client = getClient();
    return await client.family.getBriefings.query({ roomId: rid, limit });
  } catch (e) {
    console.warn('[CloudSync] getBriefings failed:', e);
    return [];
  }
}

// ─── Medication Sync ─────────────────────────────────────────────────────────

/** Sync a medication to the server */
export async function cloudSyncMedication(med: any, serverMedId?: number, roomId?: number) {
  const rid = roomId ?? await getActiveRoomId();
  if (!rid) return null;
  try {
    const client = getClient();
    return await client.family.syncMedication.mutate({
      roomId: rid,
      serverMedId,
      name: med.name,
      dosage: med.dosage,
      frequency: med.frequency,
      times: med.times,
      notes: med.notes,
      icon: med.icon,
      active: med.active,
      reminderEnabled: med.reminderEnabled,
      color: med.color,
    });
  } catch (e) {
    console.warn('[CloudSync] syncMedication failed:', e);
    return null;
  }
}

/** Fetch medications from server */
export async function cloudGetMedications(roomId?: number) {
  const rid = roomId ?? await getActiveRoomId();
  if (!rid) return [];
  try {
    const client = getClient();
    return await client.family.getMedications.query({ roomId: rid });
  } catch (e) {
    console.warn('[CloudSync] getMedications failed:', e);
    return [];
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
  try {
    const client = getClient();
    await client.family.updatePushToken.mutate({ pushToken });
    console.log('[CloudSync] Push token registered successfully');
    return true;
  } catch (e) {
    console.warn('[CloudSync] updatePushToken failed:', e);
    return false;
  }
}
