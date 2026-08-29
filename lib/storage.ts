import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  cloudSyncCheckIn,
  cloudSyncDiary,
  cloudGetDiaries,
  cloudDeleteDiary,
  cloudSyncMedication,
  cloudDeleteMedication,
  cloudPostAnnouncement,
  cloudSaveBriefing,
  cloudCreateRoom,
  cloudJoinRoom,
  cloudGetRoomDetail,
  cloudLookupRoom,
  cloudUpdateElderProfile,
  cloudUpdateMemberProfile,
  setCloudSyncState,
  getCloudSyncState,
} from "./cloud-sync";

export { cloudGetRoomDetail };
// Care needs profile types
export type CareNeedType =
  | 'memory'       // Memory / cognition care (Alzheimer's / dementia)
  | 'hypertension' // Hypertension / blood pressure management
  | 'diabetes'     // Blood sugar / diabetes care
  | 'mood'         // Emotional / mood support
  | 'cancer'       // Cancer care
  | 'sleep'        // Sleep issues
  | 'fall'         // Fall risk / mobility support
  | 'nutrition'    // Nutrition / appetite support
  | 'surgery';     // Post-surgery recovery

export interface CareNeedsProfile {
  selectedNeeds: CareNeedType[];
  // Memory / cognition
  memoryStage?: 'early' | 'middle' | 'late' | 'unsure';
  memoryIssues?: string[];
  memoryIndependence?: 'mostly_independent' | 'partly_assisted' | 'mostly_assisted';
  memorySafetyConcerns?: string[];
  // Hypertension
  bpSystolic?: string;
  bpDiastolic?: string;
  bpDiagnosed?: boolean;
  bpMedication?: boolean;
  bpIssues?: string[];
  // Diabetes
  diabetesType?: 'diagnosed' | 'prediabetes' | 'unsure';
  fastingGlucose?: string;
  a1c?: string;
  diabetesMedication?: boolean;
  diabetesLowHistory?: boolean;
  // Cancer
  cancerType?: string;
  cancerStage?: string;
  cancerTreatment?: string[];
  cancerConcerns?: string[];
  // Mood
  moodConcernLevel?: 'mild' | 'moderate' | 'significant';
  moodPatterns?: string[];
  moodSleepAffected?: boolean;
  // AI-generated summary
  aiProfileSummary?: string;
}

export interface ElderProfile {
  id: string;
  name: string;
  nickname: string;
  birthDate: string;       // YYYY-MM-DD
  zodiacEmoji: string;
  zodiacName: string;
  photoUri?: string;
  caregiverName: string;
  caregiverBirthYear: string; // YYYY
  caregiverZodiacEmoji: string;
  caregiverZodiacName: string;
  caregiverPhotoUri?: string;
  caregiverAvatarType?: 'photo' | 'zodiac';
  elderPhotoUri?: string;
  elderAvatarType?: 'photo' | 'zodiac';
  city: string;            // 城市名，用于天气查询
  reminderMorning: string;  // e.g. '08:00'
  reminderEvening: string;  // e.g. '21:00'
  setupComplete: boolean;
  careNeeds?: CareNeedsProfile; // Care needs profile (optional, added in v3.1)
}

// ─── Sleep Input (v4.1) — 枚举键，用于AI分析管道 ───────────────────────────
export type SleepInput = {
  nightSleepDuration: 'lt4' | '4to6' | '6to7' | '7to9' | 'gt9';
  awakenCount: '0' | '1to2' | '3to4' | '5plus';
  awakeDuration: 'none' | '10to30' | '30to60' | 'gt60';
  napDuration?: 'none' | 'lt20' | '20to60' | 'gt60';
  sleepLatency?: 'fast' | 'normal' | 'slow' | 'very_slow';
  tags?: string[];
  notes?: string;
};

// ─── Sleep Segment (v5.0) — 详细睡眠时间段 ──────────────────────────────────
export interface SleepSegment {
  start: string;  // ISO 8601, e.g. "2026-03-22T23:00:00Z"
  end: string;    // ISO 8601, e.g. "2026-03-23T06:30:00Z"
}

export interface DailyCheckIn {
  id: string;
  date: string;            // YYYY-MM-DD
  // 早上打卡
  sleepHours: number;
  sleepQuality: 'poor' | 'fair' | 'good';
  // v4.1 结构化睡眠输入（枚举键，用于评分引擎）
  sleepInput?: SleepInput;
  sleepScore?: number;       // 0-100，规则引擎计算，非AI
  sleepProblems?: string[];  // 规则引擎推导的问题标签
  // v5.0 睡眠记录模式
  sleepType?: 'quick' | 'detailed';  // 快捷 or 详细
  sleepSegments?: SleepSegment[];    // 详细模式：多段睡眠时间
  awakeHours?: number;               // 详细模式：时段间清醒总时长（小时）
  nightWakings?: number;             // 夜里醒来次数
  daytimeNap?: boolean;              // 白天是否有小睡
  napMinutes?: number;               // 白天小睡时长（分钟，30为单位）
  // v4.0 展示字段（兼容旧数据，用于UI显示）
  sleepRange?: string;       // 如 "7-9小时"
  nightAwakenings?: string;  // 如 "1-2次"
  nightAwakeTime?: string;   // 如 "几乎没有"
  napDuration?: string;      // 如 "没有"
  morningNotes: string;    // 早上补充说明（可语音）
  caregiverMoodEmoji?: string;   // 照顾者早间心情 emoji (deprecated: moved to diary)
  caregiverMoodScore?: number;   // 照顾者早间心情分数 (deprecated: moved to diary)
  morningDone: boolean;
  // 晚上打卡
  moodEmoji: string;
  moodScore: number;       // 1-10
  medicationTaken: boolean;
  medicationNotes: string;
  mealNotes: string;       // 饮食情况描述
  mealOption?: string;     // v4.0 选项：正常进食/食量偏少/几乎没吃/吃了特别的东西
  eveningNotes: string;    // 晚上补充说明（可语音）
  eveningDone: boolean;
  // AI 生成
  aiMessage: string;
  careScore: number;       // 1-100
  completedAt: string;
  /** 仅本地使用：打卡尚未成功写入家庭云端。 */
  syncPending?: boolean;
}

export type MedicationChangeType = 'added' | 'updated' | 'paused' | 'resumed' | 'deleted';

export interface MedicationSnapshot {
  name: string;
  dosage: string;
  frequency: string;
  times: string[];
  notes: string;
  icon: string;
  active: boolean;
  reminderEnabled?: boolean;
}

export interface MedicationChangeEvent {
  id?: number;
  eventId: string;
  medicationId?: number | null;
  changeType: MedicationChangeType;
  reason?: string;
  previousSnapshot?: MedicationSnapshot | null;
  nextSnapshot?: MedicationSnapshot | null;
  changedAt: string;
  changedByName?: string;
  syncPending?: boolean;
}

export interface Medication {
  id: string;
  /** 云端 medication 主键，用于更新和删除同一条记录。 */
  serverMedId?: number;
  name: string;
  dosage: string;
  frequency: string;       // e.g. '每天一次'
  times: string[];         // ['08:00', '20:00']
  notes: string;
  icon: string;            // emoji
  active: boolean;
  reminderEnabled?: boolean;
  color?: string;
  notificationIds?: string[];
  /** 仅本地使用：新增或修改尚未成功同步到云端。 */
  syncPending?: boolean;
  /** 随当前药物等待云端确认的调整事件；eventId 使重试保持幂等。 */
  pendingChanges?: MedicationChangeEvent[];
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'ai';
  text: string;
  createdAt: string;
}

export interface DiaryDraft {
  content: string;
  selectedMood: number;
  caregiverMoodIdx: number;
  selectedTags: string[];
  savedAt: string;
}

export interface DiaryEntry {
  id: string;
  /** 本地缓存所属家庭；用于多 profile 场景下的二次隔离校验。 */
  roomId?: string;
  date: string;
  content: string;
  moodEmoji: string;
  moodLabel?: string;
  moodScore?: number;
  tags?: string[];
  createdAt?: string;
  /** 本地或云端最后一次修改时间，用于草稿与发布状态展示。 */
  updatedAt?: string;
  caregiverMoodEmoji?: string;  // v5.0: 照顾者心情（从打卡移过来）
  caregiverMoodLabel?: string;
  serverDiaryId?: number;
  authorName?: string;           // 记录人姓名（本地写入时填充 caregiverName，云端同步时也会填充）
  authorUserId?: number;          // 记录人的用户 ID（云端同步时填充，用于判断是否是当前用户写的日记）
  // AI reply fields (legacy — kept for backward compatibility)
  aiReply?: string;
  aiEmoji?: string;
  aiTip?: string;
  // Smart reply fields (new naming, maps to aiReply/aiTip)
  smartReply?: string;
  smartTip?: string;
  // Multi-turn conversation history (new in v3.0)
  conversation?: ConversationMessage[];
  conversationFinished?: boolean; // true when user tapped "End and Save"
  /** 仅本地使用：正式发布尚未成功同步到云端，进入列表时会自动重试。 */
  syncPending?: boolean;
  localTimeStr?: string;  // e.g. "14:23" — writer's local time, timezone-safe
}

export interface CareBriefing {
  date: string;
  careScore: number;
  summary: string;
  encouragement: string;
  generatedAt: string;
  checkInDate: string;
}

// ─── Family Types ───────────────────────────────────────────────────────────

export interface FamilyMember {
  id: string;
  name: string;
  role: 'caregiver' | 'family' | 'nurse';  // 照顾者/家人/护工
  roleLabel: string;   // 显示名称，如「女儿」「儿子」「护工」
  emoji: string;       // 头像 emoji
  color: string;       // 主题色
  photoUri?: string;   // 真实照片 URI
  birthYear?: number;   // 出生年份，用于计算生肖
  joinedAt: string;
  isCurrentUser?: boolean;
  isCreator?: boolean;       // true = 创建者（管理员），false/undefined = 加入者（只读）
  relationship?: string;     // 与被照顾者的关系，如「孙女」「女婿」
}

export interface AnnouncementReaction {
  emoji: string;
  members: { memberId: string; memberName: string; memberEmoji: string }[];
}

export interface FamilyAnnouncement {
  id: string;
  authorId: string;    // FamilyMember.id
  authorName: string;
  authorEmoji: string;
  authorColor: string;
  content: string;
  emoji?: string;      // 可选的表情装饰
  type: 'news' | 'visit' | 'medical' | 'daily' | 'reminder';
  createdAt: string;
  date: string;        // YYYY-MM-DD
  localTimeStr?: string; // HH:MM — 发布者本地时间，避免时区偏差
  reactions?: AnnouncementReaction[];
}

export interface FamilyRoom {
  id: string;
  roomCode: string;    // 6位邀请码
  elderName: string;
  elderEmoji?: string;
  elderPhotoUri?: string;
  members: FamilyMember[];
  createdAt: string;
}

// 用户在某个家庭中的成员关系（多家庭支持）
export interface FamilyMembership {
  familyId: string;       // FamilyRoom.id
  myMemberId: string;     // 我在这个家庭中的 FamilyMember.id
  role: 'creator' | 'joiner';
  room: FamilyRoom;       // 缓存的家庭信息
  joinedAt: string;
  memberEmoji?: string;
  memberPhotoUri?: string;
}

// ─── UserProfile & FamilyProfile (split from legacy ElderProfile) ────────────

/** Global user (caregiver) profile — NOT family-scoped */
export interface UserProfile {
  caregiverName?: string;
  caregiverBirthYear?: string;
  caregiverZodiacEmoji?: string;
  caregiverZodiacName?: string;
  caregiverPhotoUri?: string;
  caregiverAvatarType?: 'photo' | 'zodiac';
}

/** Per-family (elder) profile — stored per roomId */
export interface FamilyProfile {
  id?: string;
  name?: string;
  nickname?: string;
  birthDate?: string;        // YYYY-MM-DD
  zodiacEmoji?: string;
  zodiacName?: string;
  elderPhotoUri?: string;
  elderAvatarType?: 'photo' | 'zodiac';
  city?: string;
  reminderMorning?: string;  // e.g. '08:00'
  reminderEvening?: string;  // e.g. '21:00'
  setupComplete?: boolean;
  careNeeds?: CareNeedsProfile;
}

// ─── Keys ─────────────────────────────────────────────────────────────────────

const KEYS = {
  PROFILE: 'elder_profile_v3',          // legacy global profile (kept for migration)
  USER_PROFILE: 'user_profile_v1',       // global caregiver-only fields
  FAMILY_PROFILE: 'elder_profile_v3',    // per-family elder fields (roomId-scoped)
  // Global (non-room-scoped) keys:
  FAMILY_ROOM: 'family_room_v1',
  CURRENT_MEMBER: 'current_family_member_v1',
  MEMBERSHIPS: 'family_memberships_v1',
  ACTIVE_FAMILY_ID: 'active_family_id_v1',
  // Legacy (non-scoped) keys — kept for migration only:
  CHECK_INS: 'daily_checkins_v2',
  MEDICATIONS: 'medications',
  MEDICATION_CHANGES: 'medication_changes_v1',
  DIARY: 'diary_entries',
  DIARY_DRAFT: 'diary_draft_v1',
  FAMILY_ANNOUNCEMENTS: 'family_announcements_v1',
  BRIEFINGS: 'care_briefings_v1',
} as const;

// Room-scoped key helpers — all family data is isolated per roomId
function roomKey(base: string, roomId: string | null | undefined): string {
  if (!roomId) return base; // fallback to legacy key for backward compat
  return `${base}:${roomId}`;
}

/** Get the active roomId from the active membership (sync-safe helper) */
let _activeRoomIdCache: string | null = null;
export function setActiveRoomIdCache(id: string | null) { _activeRoomIdCache = id; }
export function getActiveRoomIdCache(): string | null { return _activeRoomIdCache; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

// ─── Profile ─────────────────────────────────────────────────────────────────────

/** Legacy global profile — kept for backward compat and migration */
export async function getProfile(): Promise<ElderProfile | null> {
  const raw = await AsyncStorage.getItem(KEYS.PROFILE);
  return raw ? JSON.parse(raw) : null;
}

export async function saveProfile(profile: Omit<ElderProfile, 'id'>): Promise<ElderProfile> {
  const existing = await getProfile();
  const saved: ElderProfile = { id: existing?.id ?? generateId(), ...profile };
  await AsyncStorage.setItem(KEYS.PROFILE, JSON.stringify(saved));
  // Cloud sync: update elder profile on server
  cloudUpdateElderProfile(saved).catch(() => {});
  return saved;
}

// ─── UserProfile (global caregiver fields) ───────────────────────────────────────

export async function getUserProfile(): Promise<UserProfile | null> {
  const raw = await AsyncStorage.getItem(KEYS.USER_PROFILE);
  if (raw) return JSON.parse(raw);
  // Migrate from legacy ElderProfile if available
  const legacy = await getProfile();
  if (legacy) {
    const up: UserProfile = {
      caregiverName: legacy.caregiverName,
      caregiverBirthYear: legacy.caregiverBirthYear,
      caregiverZodiacEmoji: legacy.caregiverZodiacEmoji,
      caregiverZodiacName: legacy.caregiverZodiacName,
      caregiverPhotoUri: legacy.caregiverPhotoUri,
      caregiverAvatarType: legacy.caregiverAvatarType,
    };
    await AsyncStorage.setItem(KEYS.USER_PROFILE, JSON.stringify(up));
    return up;
  }
  return null;
}

export async function saveUserProfile(profile: UserProfile): Promise<UserProfile> {
  await AsyncStorage.setItem(KEYS.USER_PROFILE, JSON.stringify(profile));
  return profile;
}

// ─── FamilyProfile (per-family elder fields, roomId-scoped) ─────────────────────

export async function getFamilyProfile(roomId?: string): Promise<FamilyProfile | null> {
  const rid = roomId ?? _activeRoomIdCache;
  const key = roomKey(KEYS.FAMILY_PROFILE, rid);
  const raw = await AsyncStorage.getItem(key);
  if (raw) return JSON.parse(raw);
  // 旧版全局 ElderProfile 没有家庭归属；仅在账号明确只有当前一个家庭时才可安全迁移。
  if (rid) {
    const memberships = await getAllMemberships().catch(() => [] as FamilyMembership[]);
    const canClaimLegacy = memberships.length === 1 && memberships[0]?.familyId === String(rid);
    const legacy = canClaimLegacy ? await getProfile() : null;
    if (legacy) {
      const fp: FamilyProfile = {
        id: legacy.id,
        name: legacy.name,
        nickname: legacy.nickname,
        birthDate: legacy.birthDate,
        zodiacEmoji: legacy.zodiacEmoji,
        zodiacName: legacy.zodiacName,
        elderPhotoUri: legacy.elderPhotoUri,
        elderAvatarType: legacy.elderAvatarType,
        city: legacy.city,
        reminderMorning: legacy.reminderMorning,
        reminderEvening: legacy.reminderEvening,
        setupComplete: legacy.setupComplete,
        careNeeds: legacy.careNeeds,
      };
      await AsyncStorage.setItem(key, JSON.stringify(fp));
      return fp;
    }
  }
  return null;
}

export async function saveFamilyProfile(profile: Partial<FamilyProfile>, roomId?: string): Promise<FamilyProfile> {
  const rid = roomId ?? _activeRoomIdCache;
  const key = roomKey(KEYS.FAMILY_PROFILE, rid);
  // Read-then-merge: always merge with existing local data so partial updates
  // (e.g. only changing reminderMorning) never wipe out other fields.
  const raw = await AsyncStorage.getItem(key);
  const existing: FamilyProfile | null = raw ? JSON.parse(raw) : null;
  const merged: FamilyProfile = { ...(existing ?? {}), ...profile };
  await AsyncStorage.setItem(key, JSON.stringify(merged));
  // Cloud sync: bind the update to this family instead of the mutable global active-room pointer.
  cloudUpdateElderProfile(merged as any, rid ? Number(rid) : undefined).catch(() => {});
  return merged;
}

// ─── Daily Check-ins ──────────────────────────────────────────────────────────

// 权威 emoji→moodScore 映射（与 checkin.tsx 的 MOODS 数组保持同步）
const MOOD_EMOJI_SCORE: Record<string, number> = {
  '😄': 10, '😊': 9, '😌': 8, '😕': 5, '😢': 3, '😤': 2,
};

/** 用当前权威分值覆盖历史打卡里可能已过时的 moodScore */
function normalizeMoodScore(c: DailyCheckIn): DailyCheckIn {
  if (c.moodEmoji && MOOD_EMOJI_SCORE[c.moodEmoji] !== undefined) {
    return { ...c, moodScore: MOOD_EMOJI_SCORE[c.moodEmoji] };
  }
  return c;
}

export async function getAllCheckIns(roomId?: string): Promise<DailyCheckIn[]> {
  const rid = roomId ?? _activeRoomIdCache;
  const key = roomKey(KEYS.CHECK_INS, rid);
  const raw = await AsyncStorage.getItem(key);
  // 旧版全局缓存只有在账号明确仅有一个家庭时才能安全认领。
  if (!raw && rid) {
    const legacy = await AsyncStorage.getItem(KEYS.CHECK_INS);
    if (legacy) {
      const memberships = await getAllMemberships().catch(() => [] as FamilyMembership[]);
      const onlyMembership = memberships.length === 1 && memberships[0]?.familyId === String(rid);
      if (onlyMembership) {
        await AsyncStorage.setItem(key, legacy);
        await AsyncStorage.removeItem(KEYS.CHECK_INS);
        const list: DailyCheckIn[] = JSON.parse(legacy);
        return list.map(normalizeMoodScore);
      }
      await AsyncStorage.setItem(`${KEYS.CHECK_INS}:legacy_unassigned_backup`, legacy);
      await AsyncStorage.removeItem(KEYS.CHECK_INS);
    }
  }
  const list: DailyCheckIn[] = raw ? JSON.parse(raw) : [];
  return list.map(normalizeMoodScore);
}

export async function getTodayCheckIn(roomId?: string): Promise<DailyCheckIn | null> {
  const all = await getAllCheckIns(roomId);
  return all.find(c => c.date === todayStr()) ?? null;
}

export async function getCheckInByDate(dateStr: string, roomId?: string): Promise<DailyCheckIn | null> {
  const all = await getAllCheckIns(roomId);
  return all.find(c => c.date === dateStr) ?? null;
}

export async function getYesterdayCheckIn(roomId?: string): Promise<DailyCheckIn | null> {
  const all = await getAllCheckIns(roomId);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
  return all.find(c => c.date === yStr) ?? null;
}

export async function upsertCheckIn(data: Partial<DailyCheckIn> & { date: string }, roomId?: string): Promise<DailyCheckIn> {
  const rid = roomId ?? _activeRoomIdCache;
  const key = roomKey(KEYS.CHECK_INS, rid);
  const all = await getAllCheckIns(rid ?? undefined);
  const idx = all.findIndex(c => c.date === data.date);
  const defaults: DailyCheckIn = {
    id: generateId(),
    date: data.date,
    sleepHours: 7,
    sleepQuality: 'fair',
    morningNotes: '',
    morningDone: false,
    moodEmoji: '😌',
    moodScore: 5,
    medicationTaken: true,
    medicationNotes: '',
    mealNotes: '',
    eveningNotes: '',
    eveningDone: false,
    aiMessage: '',
    careScore: 50,
    completedAt: new Date().toISOString(),
  };
  const checkIn: DailyCheckIn = idx >= 0
    ? { ...all[idx], ...data, completedAt: new Date().toISOString(), syncPending: true }
    : { ...defaults, ...data, syncPending: true };
  if (idx >= 0) all[idx] = checkIn;
  else all.unshift(checkIn);
  await AsyncStorage.setItem(key, JSON.stringify(all));
  // Cloud sync: 失败时保留 syncPending，后续进入首页/打卡页会自动重试。
  cloudSyncCheckIn(checkIn, rid).then(async result => {
    if (!result?.success) return;
    const latestRaw = await AsyncStorage.getItem(key);
    const latest: DailyCheckIn[] = latestRaw ? JSON.parse(latestRaw) : [];
    const latestIdx = latest.findIndex(item => item.date === checkIn.date);
    if (latestIdx >= 0) {
      latest[latestIdx] = { ...latest[latestIdx], syncPending: false };
      await AsyncStorage.setItem(key, JSON.stringify(latest));
    }
  }).catch((e) => console.warn('[xiaomahu] 打卡云端同步失败，已保存到本地', e));
  return checkIn;
}

/** Retry check-ins that were saved locally while the cloud was unavailable. */
export async function syncPendingCheckIns(roomId: string): Promise<void> {
  const key = roomKey(KEYS.CHECK_INS, roomId);
  const entries = await getAllCheckIns(roomId);
  for (const entry of entries.filter(item => item.syncPending)) {
    const result = await cloudSyncCheckIn(entry, roomId);
    if (!result?.success) continue;
    const latestRaw = await AsyncStorage.getItem(key);
    const latest: DailyCheckIn[] = latestRaw ? JSON.parse(latestRaw) : [];
    const idx = latest.findIndex(item => item.date === entry.date);
    if (idx >= 0) {
      latest[idx] = { ...latest[idx], syncPending: false };
      await AsyncStorage.setItem(key, JSON.stringify(latest));
    }
  }
}

export async function getRecentCheckIns(days = 7, roomId?: string): Promise<DailyCheckIn[]> {
  const all = await getAllCheckIns(roomId);
  return all.slice(0, days);
}

/**
 * 首页专用：只返回当年的打卡数据（最多 365 条）。
 * TrendChart year 模式需要当年数据，7d 模式只需最近 7 天。
 * 比全量读取轻得多，尤其是老用户可能有几年数据的情况。
 */
export async function getCheckInsForHome(roomId?: string): Promise<DailyCheckIn[]> {
  const all = await getAllCheckIns(roomId);
  const currentYear = new Date().getFullYear().toString();
  return all.filter(c => c.date && c.date.startsWith(currentYear));
}

export async function getWeeklySleepData(days = 7, roomId?: string): Promise<Array<{
  date: string;
  sleepHours: number;
  awakeHours: number;
  sleepType: 'quick' | 'detailed' | undefined;
  sleepSegments: SleepSegment[];
  nightWakings: number;
  daytimeNap: boolean;
  napMinutes: number;
  hasMorningData: boolean;
}>> {
  const all = await getAllCheckIns(roomId);
  const result: Array<{
    date: string;
    sleepHours: number;
    awakeHours: number;
    sleepType: 'quick' | 'detailed' | undefined;
    sleepSegments: SleepSegment[];
    nightWakings: number;
    daytimeNap: boolean;
    napMinutes: number;
    hasMorningData: boolean;
  }> = [];
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    // 使用本地日期（避免 toISOString 返回 UTC 日期，在 UTC+8 凌晨0-8点时与本地日期相差1天）
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const checkin = all.find(c => c.date === dateStr);
    const sleepHours = checkin?.sleepHours ?? 0;
    const awakeHours = checkin?.awakeHours ?? 0;
    result.push({
      date: dateStr,
      sleepHours,
      awakeHours,
      sleepType: checkin?.sleepType,
      sleepSegments: checkin?.sleepSegments ?? [],
      nightWakings: checkin?.nightWakings ?? 0,
      daytimeNap: checkin?.daytimeNap ?? false,
      napMinutes: checkin?.napMinutes ?? (checkin?.daytimeNap ? 30 : 0),
      hasMorningData: checkin?.morningDone ?? false,
    });
  }
  return result;
}

// ─── Medications ──────────────────────────────────────────────────────────────

// 同一药物的云端操作按顺序执行：避免用户快速修改或立即删除时，请求乱序造成旧状态覆盖或重复创建。
const medicationSyncQueue = new Map<string, Promise<void>>();

function medicationQueueKey(roomId: string | undefined, medicationId: string) {
  return `${roomId || 'default'}:${medicationId}`;
}

function enqueueMedicationSync(roomId: string | undefined, medicationId: string, task: () => Promise<void>): Promise<void> {
  const key = medicationQueueKey(roomId, medicationId);
  const previous = medicationSyncQueue.get(key) ?? Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(task)
    .catch(error => console.warn('[xiaomahu] 用药云端同步失败，已保留本地待同步状态', error));
  medicationSyncQueue.set(key, next);
  next.finally(() => {
    if (medicationSyncQueue.get(key) === next) medicationSyncQueue.delete(key);
  });
  return next;
}

async function waitForMedicationSync(roomId: string | undefined, medicationId: string): Promise<void> {
  await medicationSyncQueue.get(medicationQueueKey(roomId, medicationId));
}

function medicationServerId(med: Medication): number | undefined {
  if (Number.isFinite(med.serverMedId)) return Number(med.serverMedId);
  const rawId = String(med.id ?? '').replace(/^cloud_/, '');
  const parsed = Number(rawId);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function medicationSnapshot(med: Partial<Medication>): MedicationSnapshot {
  return {
    name: med.name ?? '',
    dosage: med.dosage ?? '',
    frequency: med.frequency ?? '',
    times: Array.isArray(med.times) ? [...med.times] : [],
    notes: med.notes ?? '',
    icon: med.icon ?? '💊',
    active: med.active ?? true,
    reminderEnabled: med.reminderEnabled ?? false,
  };
}

export function createMedicationChangeEvent(params: {
  changeType: MedicationChangeType;
  reason?: string;
  previousSnapshot?: MedicationSnapshot | null;
  nextSnapshot?: MedicationSnapshot | null;
  changedByName?: string;
}): MedicationChangeEvent {
  return {
    eventId: `med_change_${generateId()}`,
    changeType: params.changeType,
    reason: params.reason?.trim() || undefined,
    previousSnapshot: params.previousSnapshot ?? null,
    nextSnapshot: params.nextSnapshot ?? null,
    changedAt: new Date().toISOString(),
    changedByName: params.changedByName,
    syncPending: true,
  };
}

function normalizeMedicationChange(change: any): MedicationChangeEvent {
  const changedAt = change?.changedAt instanceof Date
    ? change.changedAt.toISOString()
    : (typeof change?.changedAt === 'string' ? change.changedAt : new Date().toISOString());
  return {
    id: Number.isFinite(Number(change?.id)) ? Number(change.id) : undefined,
    eventId: String(change?.eventId ?? `legacy_${generateId()}`),
    medicationId: Number.isFinite(Number(change?.medicationId)) ? Number(change.medicationId) : null,
    changeType: change?.changeType ?? 'updated',
    reason: change?.reason ?? undefined,
    previousSnapshot: change?.previousSnapshot ?? null,
    nextSnapshot: change?.nextSnapshot ?? null,
    changedAt,
    changedByName: change?.changedByName ?? undefined,
    syncPending: change?.syncPending === true,
  };
}

export async function getMedicationChanges(roomId?: string): Promise<MedicationChangeEvent[]> {
  const rid = roomId ?? _activeRoomIdCache;
  const raw = await AsyncStorage.getItem(roomKey(KEYS.MEDICATION_CHANGES, rid));
  if (!raw) return [];
  try {
    return (JSON.parse(raw) as any[])
      .map(normalizeMedicationChange)
      .sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime());
  } catch {
    return [];
  }
}

export async function saveMedicationChanges(changes: MedicationChangeEvent[], roomId?: string): Promise<void> {
  const rid = roomId ?? _activeRoomIdCache;
  const deduped = new Map<string, MedicationChangeEvent>();
  changes.forEach(change => deduped.set(change.eventId, normalizeMedicationChange(change)));
  const sorted = [...deduped.values()]
    .sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime())
    .slice(0, 200);
  await AsyncStorage.setItem(roomKey(KEYS.MEDICATION_CHANGES, rid), JSON.stringify(sorted));
}

export async function mergeCloudMedicationChanges(changes: any[], roomId: string): Promise<MedicationChangeEvent[]> {
  const local = await getMedicationChanges(roomId);
  const remote = changes.map(change => ({ ...normalizeMedicationChange(change), syncPending: false }));
  const pendingOnly = local.filter(change => change.syncPending && !remote.some(item => item.eventId === change.eventId));
  const merged = [...remote, ...pendingOnly];
  await saveMedicationChanges(merged, roomId);
  return getMedicationChanges(roomId);
}

async function savePendingMedicationChange(change: MedicationChangeEvent | undefined, roomId?: string) {
  if (!change || !roomId) return;
  const all = await getMedicationChanges(roomId);
  await saveMedicationChanges([change, ...all], roomId);
}

async function markMedicationChangesSynced(eventIds: string[], serverRows: any[], roomId?: string) {
  if (!roomId || eventIds.length === 0) return;
  const current = await getMedicationChanges(roomId);
  const serverByEventId = new Map((serverRows ?? []).map((row: any) => [String(row.eventId), normalizeMedicationChange(row)]));
  const next = current.map(change => eventIds.includes(change.eventId)
    ? { ...change, ...(serverByEventId.get(change.eventId) ?? {}), syncPending: false }
    : change);
  await saveMedicationChanges(next, roomId);
}

export async function getMedications(roomId?: string): Promise<Medication[]> {
  const rid = roomId ?? _activeRoomIdCache;
  const key = roomKey(KEYS.MEDICATIONS, rid);
  const raw = await AsyncStorage.getItem(key);
  if (!raw && rid) {
    const legacy = await AsyncStorage.getItem(KEYS.MEDICATIONS);
    if (legacy) {
      const memberships = await getAllMemberships().catch(() => [] as FamilyMembership[]);
      const onlyMembership = memberships.length === 1 && memberships[0]?.familyId === String(rid);
      if (onlyMembership) {
        await AsyncStorage.setItem(key, legacy);
        await AsyncStorage.removeItem(KEYS.MEDICATIONS);
        return JSON.parse(legacy);
      }
      await AsyncStorage.setItem(`${KEYS.MEDICATIONS}:legacy_unassigned_backup`, legacy);
      await AsyncStorage.removeItem(KEYS.MEDICATIONS);
    }
  }
  return raw ? JSON.parse(raw) : [];
}

export async function saveMedication(data: Omit<Medication, 'id'>, roomId?: string, changeEvent?: MedicationChangeEvent): Promise<Medication> {
  const rid = roomId ?? _activeRoomIdCache;
  const key = roomKey(KEYS.MEDICATIONS, rid);
  const all = await getMedications(rid ?? undefined);
  const pendingChanges = changeEvent ? [changeEvent] : [];
  const med: Medication = { id: generateId(), ...data, pendingChanges, syncPending: true };
  all.push(med);
  await AsyncStorage.setItem(key, JSON.stringify(all));
  await savePendingMedicationChange(changeEvent, rid ?? undefined);
  // Cloud sync: sync medication and its idempotent adjustment events together.
  enqueueMedicationSync(rid ?? undefined, med.id, async () => {
    const result = await cloudSyncMedication(med, undefined, rid ? Number(rid) : undefined, pendingChanges);
    const serverMedId = result?.medication?.id;
    if (!result?.success || !serverMedId) return;
    const sentIds = pendingChanges.map(event => event.eventId);
    await markMedicationChangesSynced(sentIds, result.recordedChanges ?? [], rid ?? undefined);
    const latest = await getMedications(rid ?? undefined);
    const latestIdx = latest.findIndex(item => item.id === med.id);
    if (latestIdx < 0) return;
    const remaining = (latest[latestIdx].pendingChanges ?? []).filter(event => !sentIds.includes(event.eventId));
    latest[latestIdx] = { ...latest[latestIdx], serverMedId: Number(serverMedId), pendingChanges: remaining, syncPending: remaining.length > 0 };
    await AsyncStorage.setItem(key, JSON.stringify(latest));
  });
  return med;
}

export async function saveMedications(meds: Medication[], roomId?: string): Promise<void> {
  const rid = roomId ?? _activeRoomIdCache;
  const key = roomKey(KEYS.MEDICATIONS, rid);
  await AsyncStorage.setItem(key, JSON.stringify(meds));
}

export async function updateMedication(id: string, data: Partial<Medication>, roomId?: string, changeEvent?: MedicationChangeEvent): Promise<void> {
  const rid = roomId ?? _activeRoomIdCache;
  const key = roomKey(KEYS.MEDICATIONS, rid);
  const all = await getMedications(rid ?? undefined);
  const idx = all.findIndex(m => m.id === id);
  if (idx >= 0) {
    const pendingChanges = [...(all[idx].pendingChanges ?? []), ...(changeEvent ? [changeEvent] : [])];
    all[idx] = { ...all[idx], ...data, pendingChanges, syncPending: true };
    await AsyncStorage.setItem(key, JSON.stringify(all));
    await savePendingMedicationChange(changeEvent, rid ?? undefined);
    // Cloud sync: update the same server row together with all unsynced history events.
    const serverMedId = medicationServerId(all[idx]);
    enqueueMedicationSync(rid ?? undefined, id, async () => {
      const latestBeforeSync = await getMedications(rid ?? undefined);
      const target = latestBeforeSync.find(item => item.id === id);
      if (!target) return;
      const queuedChanges = target.pendingChanges ?? [];
      const currentServerId = medicationServerId(target) ?? serverMedId;
      const result = await cloudSyncMedication(target, currentServerId, rid ? Number(rid) : undefined, queuedChanges);
      const resolvedId = result?.medication?.id ?? currentServerId;
      if (!result?.success || !resolvedId) return;
      const sentIds = queuedChanges.map(event => event.eventId);
      await markMedicationChangesSynced(sentIds, result.recordedChanges ?? [], rid ?? undefined);
      const latest = await getMedications(rid ?? undefined);
      const latestIdx = latest.findIndex(item => item.id === id);
      if (latestIdx >= 0) {
        const remaining = (latest[latestIdx].pendingChanges ?? []).filter(event => !sentIds.includes(event.eventId));
        latest[latestIdx] = { ...latest[latestIdx], serverMedId: Number(resolvedId), pendingChanges: remaining, syncPending: remaining.length > 0 };
        await AsyncStorage.setItem(key, JSON.stringify(latest));
      }
    });
  }
}

export async function deleteMedication(id: string, roomId?: string, changeEvent?: MedicationChangeEvent): Promise<void> {
  const rid = roomId ?? _activeRoomIdCache;
  const key = roomKey(KEYS.MEDICATIONS, rid);
  // 新增/修改与删除严格串行，避免旧同步请求在删除成功后又把药物创建回来。
  await waitForMedicationSync(rid ?? undefined, id);
  const all = await getMedications(rid ?? undefined);
  const target = all.find(m => m.id === id);
  if (!target) return;

  let serverId = medicationServerId(target);
  const clientId = String(target.id || '').replace(/^cloud_/, '') || undefined;
  if (rid && !serverId && target.syncPending) {
    // 如果首次创建的响应丢失，clientId 会让服务端复用原记录；如果尚未创建，则先完成创建再删除。
    const pendingChanges = target.pendingChanges ?? [];
    const syncResult = await cloudSyncMedication(target, undefined, Number(rid), pendingChanges);
    if (syncResult?.success && syncResult.medication?.id) {
      serverId = Number(syncResult.medication.id);
      await markMedicationChangesSynced(
        pendingChanges.map(event => event.eventId),
        syncResult.recordedChanges ?? [],
        rid,
      );
    }
  }

  const deleteEvent = changeEvent ? { ...changeEvent, medicationId: serverId ?? changeEvent.medicationId } : undefined;
  await savePendingMedicationChange(deleteEvent, rid ?? undefined);
  if (rid) {
    const result = await cloudDeleteMedication(serverId, target.name, Number(rid), deleteEvent, clientId);
    if (!result?.success) {
      if (deleteEvent) {
        const history = await getMedicationChanges(rid);
        await saveMedicationChanges(history.filter(event => event.eventId !== deleteEvent.eventId), rid);
      }
      throw new Error('云端删除失败，请检查网络后重试');
    }
    if (deleteEvent) await markMedicationChangesSynced([deleteEvent.eventId], [], rid);
  }
  await AsyncStorage.setItem(key, JSON.stringify(all.filter(m => m.id !== id)));
}

/** Retry locally saved medication changes when connectivity returns. */
export async function syncPendingMedications(roomId: string): Promise<void> {
  const key = roomKey(KEYS.MEDICATIONS, roomId);
  const meds = await getMedications(roomId);
  for (const med of meds.filter(item => item.syncPending)) {
    const knownServerId = medicationServerId(med);
    const pendingChanges = med.pendingChanges ?? [];
    const result = await cloudSyncMedication(med, knownServerId, Number(roomId), pendingChanges);
    const resolvedId = result?.medication?.id ?? knownServerId;
    if (!result?.success || !resolvedId) continue;
    const sentIds = pendingChanges.map(event => event.eventId);
    await markMedicationChangesSynced(sentIds, result.recordedChanges ?? [], roomId);
    const latest = await getMedications(roomId);
    const idx = latest.findIndex(item => item.id === med.id);
    if (idx >= 0) {
      const remaining = (latest[idx].pendingChanges ?? []).filter(event => !sentIds.includes(event.eventId));
      latest[idx] = { ...latest[idx], serverMedId: Number(resolvedId), pendingChanges: remaining, syncPending: remaining.length > 0 };
      await AsyncStorage.setItem(key, JSON.stringify(latest));
    }
  }
}

// ─── Diary Entries ────────────────────────────────────────────────────────────

/** 将云端日记统一为本地结构；保留服务器 ID 以便后续更新同一条记录。 */
export function normalizeCloudDiaryEntry(diary: any, roomId?: string): DiaryEntry {
  const createdAt = diary.createdAt instanceof Date
    ? diary.createdAt.toISOString()
    : (typeof diary.createdAt === 'string' ? diary.createdAt : new Date().toISOString());
  const updatedAt = diary.updatedAt instanceof Date
    ? diary.updatedAt.toISOString()
    : (typeof diary.updatedAt === 'string' ? diary.updatedAt : createdAt);
  return {
    id: `server_${diary.id}`,
    roomId: roomId ? String(roomId) : (diary.roomId ? String(diary.roomId) : undefined),
    serverDiaryId: Number(diary.id),
    date: diary.date,
    content: diary.content ?? '',
    moodEmoji: diary.moodEmoji ?? '😊',
    moodLabel: diary.moodLabel,
    moodScore: diary.moodScore,
    tags: Array.isArray(diary.tags) ? diary.tags : [],
    caregiverMoodEmoji: diary.caregiverMoodEmoji,
    caregiverMoodLabel: diary.caregiverMoodLabel,
    aiReply: diary.aiReply,
    aiEmoji: diary.aiEmoji,
    aiTip: diary.aiTip,
    conversation: Array.isArray(diary.conversation) ? diary.conversation : [],
    conversationFinished: diary.conversationFinished ?? true,
    localTimeStr: diary.localTimeStr,
    authorName: diary.authorName ?? diary.author?.name,
    authorUserId: diary.authorUserId,
    createdAt,
    updatedAt,
  };
}

function sortDiaryEntries(entries: DiaryEntry[]): DiaryEntry[] {
  return [...entries].sort((a, b) => {
    const ta = new Date(a.createdAt || a.date).getTime();
    const tb = new Date(b.createdAt || b.date).getTime();
    if (isNaN(ta) && isNaN(tb)) return 0;
    if (isNaN(ta)) return 1;
    if (isNaN(tb)) return -1;
    if (tb !== ta) return tb - ta;
    return (b.localTimeStr || '00:00').localeCompare(a.localTimeStr || '00:00');
  });
}

/**
 * 将云端日记合并到指定家庭的本地缓存。
 * 不直接覆盖缓存：如果本地对话更多或本地已结束，说明刚保存的数据可能尚未上传，必须保留。
 */
export async function mergeCloudDiariesIntoLocal(cloudDiaries: any[], roomId?: string): Promise<DiaryEntry[]> {
  const rid = roomId ?? _activeRoomIdCache;
  const key = roomKey(KEYS.DIARY, rid);
  const localEntries = await getDiaryEntries(rid ?? undefined);
  const localByServerId = new Map<number, DiaryEntry>();
  localEntries.forEach(entry => {
    if (entry.serverDiaryId) localByServerId.set(Number(entry.serverDiaryId), entry);
  });

  const cloudIds = new Set<number>();
  const mergedCloudEntries = (cloudDiaries ?? []).map((raw: any) => {
    const remote = normalizeCloudDiaryEntry(raw, rid ?? undefined);
    const remoteId = Number(remote.serverDiaryId);
    cloudIds.add(remoteId);
    const local = localByServerId.get(remoteId);
    if (!local) return remote;

    const localConversation = Array.isArray(local.conversation) ? local.conversation : [];
    const remoteConversation = Array.isArray(remote.conversation) ? remote.conversation : [];
    const conversation = localConversation.length > remoteConversation.length
      ? localConversation
      : remoteConversation;

    return {
      ...local,
      ...remote,
      // 保留本地 id，所有现有详情页路由和待同步操作仍能正确找到该条记录。
      id: local.id,
      conversation,
      // 最后编辑时间只向前推进；较旧的云端响应不能把本地草稿时间回滚。
      updatedAt: new Date(local.updatedAt || local.createdAt || 0).getTime() > new Date(remote.updatedAt || remote.createdAt || 0).getTime()
        ? (local.updatedAt || local.createdAt)
        : (remote.updatedAt || remote.createdAt),
      // 云端明确结束或本地已经结束都不能被较旧响应回滚。
      conversationFinished: Boolean(local.conversationFinished || remote.conversationFinished),
      syncPending: remote.conversationFinished === true && remoteConversation.length >= localConversation.length
        ? false
        : local.syncPending,
      // 本地的 AI 回复存在而云端暂未返回时，保留本地值。
      aiReply: remote.aiReply ?? local.aiReply,
      aiEmoji: remote.aiEmoji ?? local.aiEmoji,
      aiTip: remote.aiTip ?? local.aiTip,
    };
  });

  // 保留尚未取得 serverDiaryId 的本地新建/草稿日记，避免网络慢时被后台拉取丢失。
  const localOnly = localEntries.filter(entry => !entry.serverDiaryId || !cloudIds.has(Number(entry.serverDiaryId)));
  const merged = sortDiaryEntries([...mergedCloudEntries, ...localOnly]);
  await AsyncStorage.setItem(key, JSON.stringify(merged));
  return merged;
}

/** 读取当前家庭未发布日记草稿；草稿只保存在本机，不会推送或同步给其他成员。 */
export async function getDiaryDraft(roomId?: string): Promise<DiaryDraft | null> {
  const rid = roomId ?? _activeRoomIdCache;
  const raw = await AsyncStorage.getItem(roomKey(KEYS.DIARY_DRAFT, rid));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DiaryDraft;
  } catch {
    return null;
  }
}

/** 保存当前家庭的未发布日记草稿。 */
export async function saveDiaryDraft(draft: Omit<DiaryDraft, 'savedAt'>, roomId?: string): Promise<DiaryDraft> {
  const rid = roomId ?? _activeRoomIdCache;
  const saved: DiaryDraft = { ...draft, savedAt: new Date().toISOString() };
  await AsyncStorage.setItem(roomKey(KEYS.DIARY_DRAFT, rid), JSON.stringify(saved));
  return saved;
}

/** 发布或放弃草稿时清除；只影响当前家庭。 */
export async function clearDiaryDraft(roomId?: string): Promise<void> {
  const rid = roomId ?? _activeRoomIdCache;
  await AsyncStorage.removeItem(roomKey(KEYS.DIARY_DRAFT, rid));
}

export async function getDiaryEntries(roomId?: string): Promise<DiaryEntry[]> {
  const rid = roomId ?? _activeRoomIdCache;
  const key = roomKey(KEYS.DIARY, rid);
  const raw = await AsyncStorage.getItem(key);

  if (raw) {
    try {
      const parsed = JSON.parse(raw) as DiaryEntry[];
      if (!rid) return parsed;

      const hasUnscopedEntries = parsed.some(entry => !entry.roomId);
      // 新格式缓存无需额外读取 memberships，保持本地秒开；只有升级旧缓存时才判断是否为多家庭。
      const memberships = hasUnscopedEntries ? await getAllMemberships().catch(() => [] as FamilyMembership[]) : [];
      const canClaimUnscopedEntries = memberships.length === 1 && memberships[0]?.familyId === String(rid);
      // 只有明确确认当前用户仅有这一个家庭时，才可接纳旧的无归属记录；
      // 多家庭或家庭上下文尚未就绪时绝不能猜测，否则会把主照顾者家庭的日记显示到 Joiner 家庭。
      const scoped = parsed.filter(entry => entry.roomId
        ? String(entry.roomId) === String(rid)
        : canClaimUnscopedEntries);
      const normalized = scoped.map(entry => entry.roomId ? entry : { ...entry, roomId: String(rid) });
      const { userId: currentUserId } = await getCloudSyncState().catch(() => ({ userId: null }));
      // 本地旧缓存也必须遵守服务端权限：明确属于他人的未发布内容不能继续显示。
      // authorUserId 缺失的本机旧记录视为作者本人的兼容数据，避免升级后丢失自己的草稿。
      const visible = normalized.filter(entry =>
        entry.conversationFinished !== false || !entry.authorUserId || entry.authorUserId === currentUserId
      );
      if (visible.length !== parsed.length || normalized.some((entry, index) => entry !== scoped[index])) {
        if (!canClaimUnscopedEntries && parsed.some(entry => !entry.roomId)) {
          await AsyncStorage.setItem(`${key}:legacy_unscoped_backup`, raw);
        }
        await AsyncStorage.setItem(key, JSON.stringify(visible));
      }
      return visible;
    } catch {
      return [];
    }
  }

  if (rid) {
    const legacy = await AsyncStorage.getItem(KEYS.DIARY);
    if (legacy) {
      const memberships = await getAllMemberships().catch(() => [] as FamilyMembership[]);
      // 只有明确只有一个家庭时才可安全迁移旧全局缓存；多家庭时保留备份并等待各自云端数据回填。
      const onlyMembership = memberships.length === 1 && memberships[0]?.familyId === String(rid);
      if (onlyMembership) {
        const migrated = (JSON.parse(legacy) as DiaryEntry[]).map(entry => ({ ...entry, roomId: String(rid) }));
        const { userId: currentUserId } = await getCloudSyncState().catch(() => ({ userId: null }));
        const parsed = migrated.filter(entry =>
          entry.conversationFinished !== false || !entry.authorUserId || entry.authorUserId === currentUserId
        );
        await AsyncStorage.setItem(key, JSON.stringify(parsed));
        await AsyncStorage.removeItem(KEYS.DIARY);
        return parsed;
      }
      await AsyncStorage.setItem(`${KEYS.DIARY}:legacy_unassigned_backup`, legacy);
      await AsyncStorage.removeItem(KEYS.DIARY);
    }
  }
  return [];
}

/**
 * 首页专用：返回已完成的日记，并做去重处理。
 *
 * 处理逻辑：
 * 1. 只保留 conversationFinished === true 的日记（过滤未完成的对话和旧脚数据）
 * 2. 按 serverDiaryId（优先）或 id 去重（清除历史重复写入的脚数据）
 * 3. 取最近 N 条（默认 20）
 */
export async function getDiaryEntriesForHome(roomId?: string, limit = 20): Promise<DiaryEntry[]> {
  const all = await getDiaryEntries(roomId);

  // Step 1: 只保留已完成的日记
  // 如果一条日记从未设置过 conversationFinished（就是 undefined），
  // 说明它是旧格式数据，保留以兼容。
  // 只排除明确设为 false 的（即对话进行中未保存的）。
  const finished = all.filter(d => d.conversationFinished !== false);

  // Step 2: 按 serverDiaryId 或 id 去重
  // serverDiaryId 相同的两条日记是重复写入的同一条，只保留第一条（最新的）
  const seenServerIds = new Set<number>();
  const seenLocalIds = new Set<string>();
  const deduped = finished.filter(d => {
    if (d.serverDiaryId) {
      if (seenServerIds.has(d.serverDiaryId)) return false;
      seenServerIds.add(d.serverDiaryId);
    } else {
      if (seenLocalIds.has(String(d.id))) return false;
      seenLocalIds.add(String(d.id));
    }
    return true;
  });

  // Step 3: 按 createdAt 降序排序，确保首页始终显示最新日记
  deduped.sort((a, b) => {
    const ta = new Date(a.createdAt || a.date).getTime();
    const tb = new Date(b.createdAt || b.date).getTime();
    if (isNaN(ta) && isNaN(tb)) return 0;
    if (isNaN(ta)) return 1;
    if (isNaN(tb)) return -1;
    if (tb !== ta) return tb - ta;
    const lta = a.localTimeStr || '00:00';
    const ltb = b.localTimeStr || '00:00';
    return ltb.localeCompare(lta);
  });

  return deduped.slice(0, limit);
}

// Map from local diary id to a promise that resolves with serverDiaryId once cloud sync completes
const _serverDiaryIdPromises: Map<string, Promise<number | null>> = new Map();

export function waitForServerDiaryId(localId: string): Promise<number | null> {
  return _serverDiaryIdPromises.get(localId) ?? Promise.resolve(null);
}

export async function saveDiaryEntry(data: Omit<DiaryEntry, 'id' | 'roomId'>, roomId?: string): Promise<DiaryEntry> {
  const rid = roomId ?? _activeRoomIdCache;
  const key = roomKey(KEYS.DIARY, rid);
  const all = await getDiaryEntries(rid ?? undefined);
  const now = new Date();
  // 使用 getHours/getMinutes 生成本地时间字符串（避免 Hermes 引擎 toLocaleTimeString 返回 "下午2:30" 格式）
  const localTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const entry: DiaryEntry = { id: generateId(), ...data, roomId: rid ?? undefined, createdAt: now.toISOString(), updatedAt: now.toISOString(), localTimeStr };
  all.unshift(entry);
  await AsyncStorage.setItem(key, JSON.stringify(all));
  // Cloud sync: sync diary entry to server, and expose the serverDiaryId promise
  const serverIdPromise = cloudSyncDiary(entry, undefined, rid).then(res => {
    // Server returns { success: true, diaryId: number }
    const serverId = res?.diaryId ?? res?.id;
    if (serverId) {
      updateDiaryEntry(entry.id, { serverDiaryId: serverId }, rid ?? undefined);
      return serverId as number;
    }
    return null;
  }).catch(() => null);
  _serverDiaryIdPromises.set(entry.id, serverIdPromise);
  // Clean up after 30s to avoid memory leak
  serverIdPromise.finally(() => {
    setTimeout(() => _serverDiaryIdPromises.delete(entry.id), 30000);
  });
  return entry;
}

export async function updateDiaryEntry(
  id: string,
  data: Partial<DiaryEntry>,
  roomId?: string,
  options?: { skipCloud?: boolean },
): Promise<DiaryEntry | null> {
  const rid = roomId ?? _activeRoomIdCache;
  const key = roomKey(KEYS.DIARY, rid);
  const all = await getDiaryEntries(rid ?? undefined);
  const idx = all.findIndex(e => e.id === id);
  if (idx < 0) return null;
  const updatedEntry: DiaryEntry = { ...all[idx], ...data, roomId: rid ?? all[idx].roomId, updatedAt: data.updatedAt ?? new Date().toISOString() };
  all[idx] = updatedEntry;
  // 写回前按 createdAt 降序重新排序，防止字段更新（如 serverDiaryId/conversationFinished）后破坏列表顺序
  all.splice(0, all.length, ...sortDiaryEntries(all));
  await AsyncStorage.setItem(key, JSON.stringify(all));
  // If the only field being updated is serverDiaryId (written back by saveDiaryEntry after cloud
  // creation), skip cloud sync entirely. Triggering a sync here would read the current local state
  // (which may already have conversationFinished:true if the user tapped "End & Save" concurrently)
  // and cause a duplicate push notification.
  if (options?.skipCloud) return updatedEntry;
  const dataKeys = Object.keys(data);
  if (dataKeys.length === 1 && dataKeys[0] === 'serverDiaryId') {
    return updatedEntry;
  }
  // Cloud sync: sync when conversation is finished, when an AI reply has been added,
  // OR when the conversation has been updated at all (including user follow-up messages)
  // This ensures follow-up messages are saved even if AI hasn't replied yet or user navigates away
  const shouldSync = updatedEntry.conversationFinished ||
    data.conversation !== undefined ||
    (data.aiReply !== undefined && !!updatedEntry.aiReply);
  if (shouldSync) {
    const syncEntry = updatedEntry;
    if (syncEntry.serverDiaryId) {
      // serverDiaryId already known — update existing cloud record (no push notification)
      cloudSyncDiary(syncEntry, syncEntry.serverDiaryId, rid).catch((e) => console.warn('[xiaomahu] 日记云端同步失败，已保存到本地', e));
    } else {
      // serverDiaryId not yet available (saveDiaryEntry's async .then() may still be in flight)
      // Wait up to 5 seconds for serverDiaryId to be written, then sync once.
      // IMPORTANT: use the snapshot (syncEntry) captured at call time, NOT latestEntry re-read
      // from storage. Re-reading could pick up a later write (e.g. conversationFinished:true from
      // handleEndAndSave) and cause a duplicate push notification.
      const syncSnapshot = { ...syncEntry }; // snapshot of data at this call
      ;(async () => {
        let foundServerId: number | null = null;
        for (let attempt = 0; attempt < 5; attempt++) {
          await new Promise(r => setTimeout(r, 1000));
          const latestEntry = await getDiaryEntryById(id, rid ?? undefined);
          if (latestEntry?.serverDiaryId) { foundServerId = latestEntry.serverDiaryId; break; }
        }
        if (foundServerId) {
          // Sync using the snapshot — preserves conversationFinished state at call time,
          // preventing a race-condition double-notification if handleEndAndSave ran concurrently.
          cloudSyncDiary({ ...syncSnapshot, serverDiaryId: foundServerId }, foundServerId, rid).catch((e) => console.warn('[xiaomahu] 日记云端同步失败，已保存到本地', e));
        }
        // If still no serverDiaryId after 5s, skip sync to avoid duplicate cloud entry
      })();
    }
  }
  return updatedEntry;
}

const _diaryPublishPromises = new Map<string, Promise<boolean>>();

/**
 * 将指定日记的当前完整快照同步到云端并等待结果。
 * 用于“结束并保存”和进入列表后的断网重试，避免页面先退出但家人只看到不完整对话。
 */
export async function syncDiaryEntryNow(id: string, roomId: string): Promise<boolean> {
  const existingPromise = _diaryPublishPromises.get(`${roomId}:${id}`);
  if (existingPromise) return existingPromise;

  const task = (async () => {
    const entry = await getDiaryEntryById(id, roomId);
    if (!entry) return false;

    let serverDiaryId = entry.serverDiaryId ?? null;
    if (!serverDiaryId) serverDiaryId = await waitForServerDiaryId(id);
    const result = await cloudSyncDiary(entry, serverDiaryId ?? undefined, roomId);
    const resolvedServerId = result?.diaryId ?? result?.id ?? serverDiaryId;
    if (!result?.success || !resolvedServerId) return false;

    const key = roomKey(KEYS.DIARY, roomId);
    const all = await getDiaryEntries(roomId);
    const idx = all.findIndex(item => item.id === id);
    if (idx >= 0) {
      all[idx] = { ...all[idx], serverDiaryId: Number(resolvedServerId), syncPending: false, roomId };
      await AsyncStorage.setItem(key, JSON.stringify(sortDiaryEntries(all)));
    }
    return true;
  })().finally(() => {
    _diaryPublishPromises.delete(`${roomId}:${id}`);
  });

  _diaryPublishPromises.set(`${roomId}:${id}`, task);
  return task;
}

/** Retry formally published diaries that previously failed to reach the cloud. */
export async function syncPendingDiaries(roomId: string): Promise<void> {
  let entries = await getDiaryEntries(roomId);
  let pending = entries.filter(entry => entry.conversationFinished === true && (entry.syncPending || !entry.serverDiaryId));
  if (pending.length === 0) return;

  // App 可能在“服务器已创建、serverDiaryId 尚未写回本地”的极短窗口被关闭。
  // 重试创建前先从云端匹配作者自己的同一条记录，避免重新上线后产生重复日记。
  const remoteEntries = await cloudGetDiaries(Number(roomId));
  if (Array.isArray(remoteEntries)) {
    const { userId } = await getCloudSyncState().catch(() => ({ userId: null }));
    for (const entry of pending.filter(item => !item.serverDiaryId)) {
      const matched = userId ? remoteEntries.find((remote: any) =>
        remote.authorUserId === userId &&
        remote.date === entry.date &&
        (remote.content ?? '') === entry.content &&
        (remote.localTimeStr ?? '') === (entry.localTimeStr ?? '')
      ) : undefined;
      if (matched?.id) {
        await updateDiaryEntry(entry.id, { serverDiaryId: Number(matched.id) }, roomId, { skipCloud: true });
      }
    }
    entries = await getDiaryEntries(roomId);
    pending = entries.filter(entry => entry.conversationFinished === true && (entry.syncPending || !entry.serverDiaryId));
  }

  for (const entry of pending) {
    await syncDiaryEntryNow(entry.id, roomId).catch(() => false);
  }
}

export async function getDiaryEntryById(id: string, roomId?: string): Promise<DiaryEntry | null> {
  const all = await getDiaryEntries(roomId);
  return all.find(e => e.id === id) ?? null;
}

export async function deleteDiaryEntry(id: string, roomId?: string): Promise<void> {
  const rid = roomId ?? _activeRoomIdCache;
  const key = roomKey(KEYS.DIARY, rid);
  const entries = await getDiaryEntries(rid ?? undefined);
  const target = entries.find(entry => entry.id === id);
  if (!target) return;

  // Server-first：已进入云端的日记必须先删除服务器记录；失败时保留本地，避免下次刷新“复活”。
  let serverDiaryId = target.serverDiaryId ?? null;
  if (!serverDiaryId) serverDiaryId = await waitForServerDiaryId(id);
  if (serverDiaryId && rid) {
    const result = await cloudDeleteDiary(serverDiaryId, Number(rid));
    if (!result?.success) throw new Error('云端删除失败，请检查网络后重试');
  }

  const filtered = entries.filter(entry => entry.id !== id);
  await AsyncStorage.setItem(key, JSON.stringify(filtered));
}

// ─── Family Room ──────────────────────────────────────────────────────────────

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function getFamilyRoom(): Promise<FamilyRoom | null> {
  const raw = await AsyncStorage.getItem(KEYS.FAMILY_ROOM);
  return raw ? JSON.parse(raw) : null;
}

export async function saveFamilyRoom(room: FamilyRoom): Promise<void> {
  await AsyncStorage.setItem(KEYS.FAMILY_ROOM, JSON.stringify(room));
}

export async function lookupFamilyByCode(code: string): Promise<FamilyRoom | null> {
  const upper = code.toUpperCase();
  // Cloud-first: look up room on server by invite code
  // Server returns { elderName, elderEmoji, memberCount } (no room wrapper)
  try {
    const cloudResult = await cloudLookupRoom(upper);
    if (cloudResult) {
      return {
        id: '',  // unknown until join; will be filled after joinFamilyRoom
        roomCode: upper,
        elderName: cloudResult.elderName ?? '家人',
        elderEmoji: cloudResult.elderEmoji ?? undefined,
        members: [],
        createdAt: new Date().toISOString(),
      };
    }
  } catch (e) {
    console.warn('[Storage] lookupFamilyByCode cloud lookup failed, trying local:', e);
  }
  // Local fallback (same-device scenario)
  const room = await getFamilyRoom();
  if (!room) return null;
  return room.roomCode === upper ? room : null;
}

export async function getCurrentUserIsCreator(): Promise<boolean> {
  const member = await getCurrentMember();
  return member?.isCreator === true;
}

export async function createFamilyRoom(
  elderName: string,
  firstMember: Omit<FamilyMember, 'id' | 'joinedAt'>,
  existingCode?: string,
  elderOpts?: { emoji?: string; photoUri?: string },
  familyProfileDraft?: Partial<FamilyProfile>,
): Promise<FamilyRoom> {
  // Step 1: Create on server first (cloud-first for shared invite code)
  // Server returns both roomId AND memberId — use both as authoritative IDs
  let serverRoomId: number | null = null;
  let serverMemberId: number | null = null;
  let serverRoomCode: string | null = null;
  // Prefer the caller-supplied draft (e.g. onboarding page state) so that the
  // cloud room is complete from the very first moment even before saveFamilyProfile
  // has been called.  Fall back to whatever is already persisted locally.
  const existingFamilyProfile = familyProfileDraft ?? await getFamilyProfile();
  try {
    const cloudResult = await cloudCreateRoom({
      roomCode: existingCode ?? generateRoomCode(),
      elderName,
      elderEmoji: elderOpts?.emoji,
      elderPhotoUri: elderOpts?.photoUri,
      memberName: firstMember.name,
      memberRole: firstMember.role,
      memberRoleLabel: firstMember.roleLabel,
      memberEmoji: firstMember.emoji,
      memberColor: firstMember.color,
      memberPhotoUri: firstMember.photoUri,
      memberBirthYear: firstMember.birthYear,
      // Pass full elder profile so cloud room is complete from creation instant
      elderProfile: existingFamilyProfile ? {
        name: existingFamilyProfile.name ?? elderName,
        nickname: existingFamilyProfile.nickname ?? existingFamilyProfile.name ?? elderName,
        birthDate: existingFamilyProfile.birthDate,
        zodiacEmoji: existingFamilyProfile.zodiacEmoji,
        zodiacName: existingFamilyProfile.zodiacName,
        elderPhotoUri: existingFamilyProfile.elderPhotoUri ?? elderOpts?.photoUri,
        elderAvatarType: existingFamilyProfile.elderAvatarType,
        city: existingFamilyProfile.city,
        reminderMorning: existingFamilyProfile.reminderMorning,
        reminderEvening: existingFamilyProfile.reminderEvening,
        careNeeds: existingFamilyProfile.careNeeds,
      } : undefined,
    });
    if (cloudResult?.roomId && cloudResult?.memberId) {
      serverRoomId = cloudResult.roomId;
      serverMemberId = cloudResult.memberId;
      serverRoomCode = cloudResult.roomCode ?? null;
      await setCloudSyncState({ activeRoomId: cloudResult.roomId });
    }
  } catch (e) {
    throw new Error('家庭创建失败，请确认已登录并重试');
  }
  if (!serverRoomId || !serverMemberId) {
    throw new Error('家庭创建失败，请确认已登录并重试');
  }
  // Step 2: Build local member and room using server IDs (both guaranteed non-null)
  const myMemberId = String(serverMemberId);
  const member: FamilyMember = {
    id: myMemberId,
    ...firstMember,
    isCreator: true,
    joinedAt: new Date().toISOString(),
    isCurrentUser: true,
  };
  const room: FamilyRoom = {
    id: String(serverRoomId),
    roomCode: serverRoomCode ?? existingCode ?? generateRoomCode(),
    elderName,
    elderEmoji: elderOpts?.emoji,
    elderPhotoUri: elderOpts?.photoUri,
    members: [member],
    createdAt: new Date().toISOString(),
  };
  await saveFamilyRoom(room);
  await setCurrentMember(member);
  // Step 3: Save membership and activate room-scoped cache
  const membership: FamilyMembership = {
    familyId: room.id,
    myMemberId,
    role: 'creator',
    room,
    joinedAt: member.joinedAt,
  };
  await addOrUpdateMembership(membership);
  await setActiveFamilyId(room.id);
  setActiveRoomIdCache(room.id);
  return room;
}

export async function joinFamilyRoom(roomCode: string, member: Omit<FamilyMember, 'id' | 'joinedAt'>): Promise<FamilyRoom | null> {
  const code = roomCode.toUpperCase();

  // Step 1: Join via server (cloud-first for cross-device sharing)
  try {
    const cloudResult = await cloudJoinRoom({
      roomCode: code,
      memberName: member.name,
      memberRole: member.role,
      memberRoleLabel: member.roleLabel,
      memberEmoji: member.emoji,
      memberColor: member.color,
      memberPhotoUri: member.photoUri,
      memberBirthYear: member.birthYear,
      relationship: member.relationship,
    });

    if (cloudResult?.success && cloudResult.roomId) {
      await setCloudSyncState({ activeRoomId: cloudResult.roomId });

      // Step 1a: Pull full room detail from server (members + elder profile)
      let fullRoom: FamilyRoom | null = null;
      try {
        const detail = await cloudGetRoomDetail(cloudResult.roomId);
        if (detail && detail.room) {
          const serverMembers: FamilyMember[] = (detail.members ?? []).map((m: any) => ({
            id: String(m.id),
            name: m.name,
            role: m.role ?? 'family',
            roleLabel: m.roleLabel ?? m.role ?? '家人',
            emoji: m.emoji ?? '👤',
            color: m.color ?? '#888',
            photoUri: m.photoUri,
            joinedAt: m.joinedAt ?? new Date().toISOString(),
            isCreator: m.isCreator ?? false,
            isCurrentUser: false, // Will be set correctly below via myMemberId lookup
            relationship: m.relationship,
            birthYear: m.birthYear ?? undefined,
          }));
          fullRoom = {
            id: String(cloudResult.roomId),
            roomCode: detail.room.roomCode ?? code,
            elderName: detail.room.elderName ?? '家人',
            elderEmoji: detail.room.elderEmoji,
            elderPhotoUri: detail.room.elderPhotoUri,
            members: serverMembers.length > 0 ? serverMembers : [],
            createdAt: detail.room.createdAt ?? new Date().toISOString(),
          };
        }
      } catch (detailErr) {
        console.warn('[Storage] joinFamilyRoom getRoomDetail failed, using minimal room:', detailErr);
      }

      // Step 1b: Use server memberId as the authoritative myMemberId
      const myMemberId = String(cloudResult.memberId);

      // Build room from full detail if available, else minimal fallback
      const room: FamilyRoom = fullRoom ?? {
        id: String(cloudResult.roomId),
        roomCode: cloudResult.roomCode ?? code,
        elderName: cloudResult.elderName ?? '家人',
        members: [],
        createdAt: new Date().toISOString(),
      };

      // Find the current user in the server member list
      let myServerMember = room.members.find(m => m.id === myMemberId);
      if (!myServerMember) {
        // Server member list may not include us yet; build a minimal member entry
        myServerMember = {
          id: myMemberId,
          ...member,
          isCreator: false,
          joinedAt: new Date().toISOString(),
          isCurrentUser: true,
        };
        room.members.push(myServerMember);
      } else {
        myServerMember.isCurrentUser = true;
      }

      await saveFamilyRoom(room);
      await setCurrentMember(myServerMember);
      const membership: FamilyMembership = {
        familyId: room.id,
        myMemberId,
        role: 'joiner',
        room,
        joinedAt: myServerMember.joinedAt,
      };
      await addOrUpdateMembership(membership);
      await setActiveFamilyId(room.id);
      setActiveRoomIdCache(room.id);
      return room;
    }
  } catch (e) {
    console.warn('[Storage] joinFamilyRoom cloud join failed:', e);
  }

  // Step 2: Fallback — check local storage (same-device scenario only)
  const localRoom = await getFamilyRoom();
  if (!localRoom || localRoom.roomCode !== code) return null;

  // 如果当前用户已经是该家庭的 creator，拒绝加入
  const existingMemberships = await getAllMemberships();
  const alreadyCreator = existingMemberships.find(m => m.familyId === localRoom.id && m.role === 'creator');
  if (alreadyCreator) return null;

  const newMember: FamilyMember = {
    id: generateId(),
    ...member,
    isCreator: false,
    joinedAt: new Date().toISOString(),
    isCurrentUser: true,
  };
  localRoom.members = localRoom.members.map(m => ({ ...m, isCurrentUser: false }));
  localRoom.members.push(newMember);
  await saveFamilyRoom(localRoom);
  await setCurrentMember(newMember);
  const membership: FamilyMembership = {
    familyId: localRoom.id,
    myMemberId: newMember.id,
    role: 'joiner',
    room: localRoom,
    joinedAt: newMember.joinedAt,
  };
  await addOrUpdateMembership(membership);
  await setActiveFamilyId(localRoom.id);
  setActiveRoomIdCache(localRoom.id);
  return localRoom;
}

export async function addFamilyMember(member: Omit<FamilyMember, 'id' | 'joinedAt'>): Promise<FamilyMember> {
  const room = await getFamilyRoom();
  const newMember: FamilyMember = {
    id: generateId(),
    ...member,
    joinedAt: new Date().toISOString(),
  };
  if (room) {
    room.members.push(newMember);
    await saveFamilyRoom(room);
  }
  return newMember;
}

export async function updateFamilyMemberPhoto(memberId: string, photoUri: string, familyId?: string): Promise<void> {
  const rid = familyId ?? _activeRoomIdCache;
  const memberships = await getAllMemberships();
  const membership = rid ? memberships.find(item => item.familyId === String(rid)) : undefined;
  const globalRoom = await getFamilyRoom();
  const baseRoom = membership?.room ?? (globalRoom && (!rid || globalRoom.id === String(rid)) ? globalRoom : null);
  if (!baseRoom) return;

  const room: FamilyRoom = { ...baseRoom, members: baseRoom.members.map(member => ({ ...member })) };
  const idx = room.members.findIndex(member => member.id === memberId);
  if (idx < 0) return;
  room.members[idx].photoUri = photoUri;

  if (membership) await addOrUpdateMembership({ ...membership, room });
  const activeId = await getActiveFamilyId();
  const isActiveFamily = !rid || activeId === String(rid);
  if (isActiveFamily) {
    await saveFamilyRoom(room);
    const current = await getCurrentMember();
    if (current && current.id === memberId) await setCurrentMember({ ...current, photoUri });
  }

  // Cloud sync: only sync https:// URLs (not local file:// URIs which are device-specific).
  if (photoUri.startsWith('https://')) {
    const numericRoomId = parseInt(String(rid ?? room.id));
    if (!isNaN(numericRoomId)) {
      cloudUpdateMemberProfile({ roomId: numericRoomId, photoUri })
        .catch(e => console.warn('[Storage] cloudUpdateMemberProfile failed:', e));
    }
  }
}

export async function getCurrentMember(): Promise<FamilyMember | null> {
  const raw = await AsyncStorage.getItem(KEYS.CURRENT_MEMBER);
  return raw ? JSON.parse(raw) : null;
}

export async function setCurrentMember(member: FamilyMember): Promise<void> {
  await AsyncStorage.setItem(KEYS.CURRENT_MEMBER, JSON.stringify(member));
}

// ─── Family Announcements ─────────────────────────────────────────────────────

export async function getFamilyAnnouncements(days = 30, roomId?: string): Promise<FamilyAnnouncement[]> {
  const rid = roomId ?? _activeRoomIdCache;
  const key = roomKey(KEYS.FAMILY_ANNOUNCEMENTS, rid);
  const raw = await AsyncStorage.getItem(key);
  const all: FamilyAnnouncement[] = raw ? JSON.parse(raw) : [];
  // Return last N days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return all.filter(a => new Date(a.createdAt) >= cutoff);
}

export async function getTodayAnnouncements(roomId?: string): Promise<FamilyAnnouncement[]> {
  const all = await getFamilyAnnouncements(1, roomId);
  return all.filter(a => a.date === todayStr());
}

export async function saveFamilyAnnouncement(data: Omit<FamilyAnnouncement, 'id' | 'createdAt' | 'date'>, roomId?: string): Promise<FamilyAnnouncement> {
  const rid = roomId ?? _activeRoomIdCache;
  const key = roomKey(KEYS.FAMILY_ANNOUNCEMENTS, rid);
  const raw = await AsyncStorage.getItem(key);
  const all: FamilyAnnouncement[] = raw ? JSON.parse(raw) : [];
  const now = new Date();
  // 使用 getHours/getMinutes 生成本地时间字符串（避免 Hermes 引擎 toLocaleTimeString 格式问题）
  const localTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const announcement: FamilyAnnouncement = {
    id: generateId(),
    ...data,
    date: todayStr(),
    createdAt: now.toISOString(),
    localTimeStr,
  };
  all.unshift(announcement);
  // Keep only last 200 announcements
  if (all.length > 200) all.splice(200);
  await AsyncStorage.setItem(key, JSON.stringify(all));
  // Cloud sync: post announcement to server
  cloudPostAnnouncement({
    content: announcement.content,
    emoji: announcement.emoji,
    type: announcement.type,
    date: announcement.date,
    localTimeStr: announcement.localTimeStr,
    roomId: rid ? Number(rid) : undefined,
  }).catch(() => {});
  return announcement;
}

export async function deleteFamilyAnnouncement(id: string, roomId?: string): Promise<void> {
  const rid = roomId ?? _activeRoomIdCache;
  const key = roomKey(KEYS.FAMILY_ANNOUNCEMENTS, rid);
  const raw = await AsyncStorage.getItem(key);
  const all: FamilyAnnouncement[] = raw ? JSON.parse(raw) : [];
  const filtered = all.filter(a => a.id !== id);
  await AsyncStorage.setItem(key, JSON.stringify(filtered));
}

export async function toggleAnnouncementReaction(
  announcementId: string,
  emoji: string,
  member: { memberId: string; memberName: string; memberEmoji: string },
  roomId?: string,
): Promise<void> {
  const rid = roomId ?? _activeRoomIdCache;
  const key = roomKey(KEYS.FAMILY_ANNOUNCEMENTS, rid);
  const raw = await AsyncStorage.getItem(key);
  const all: FamilyAnnouncement[] = raw ? JSON.parse(raw) : [];
  const ann = all.find(a => a.id === announcementId);
  if (!ann) return;
  if (!ann.reactions) ann.reactions = [];
  const group = ann.reactions.find(r => r.emoji === emoji);
  if (group) {
    const hasMe = group.members.some(m => m.memberId === member.memberId);
    if (hasMe) {
      group.members = group.members.filter(m => m.memberId !== member.memberId);
      if (group.members.length === 0) {
        ann.reactions = ann.reactions.filter(r => r.emoji !== emoji);
      }
    } else {
      group.members.push(member);
    }
  } else {
    ann.reactions.push({ emoji, members: [member] });
  }
  await AsyncStorage.setItem(key, JSON.stringify(all));
}

// ─── Multi-Family Support ─────────────────────────────────────────────────────

export async function getAllMemberships(): Promise<FamilyMembership[]> {
  // Migrate old data first if needed
  await migrateToMultiFamily();
  const raw = await AsyncStorage.getItem(KEYS.MEMBERSHIPS);
  return raw ? JSON.parse(raw) : [];
}

export async function saveMemberships(memberships: FamilyMembership[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.MEMBERSHIPS, JSON.stringify(memberships));
}

export async function addOrUpdateMembership(membership: FamilyMembership): Promise<void> {
  const raw = await AsyncStorage.getItem(KEYS.MEMBERSHIPS);
  const all: FamilyMembership[] = raw ? JSON.parse(raw) : [];
  const idx = all.findIndex(m => m.familyId === membership.familyId);
  if (idx >= 0) all[idx] = membership;
  else all.unshift(membership);
  await AsyncStorage.setItem(KEYS.MEMBERSHIPS, JSON.stringify(all));
}

export async function getActiveFamilyId(): Promise<string | null> {
  return AsyncStorage.getItem(KEYS.ACTIVE_FAMILY_ID);
}

export async function setActiveFamilyId(id: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.ACTIVE_FAMILY_ID, id);
}

export async function getActiveMembership(): Promise<FamilyMembership | null> {
  const all = await getAllMemberships();
  if (all.length === 0) return null;
  const activeId = await getActiveFamilyId();
  if (activeId) {
    const found = all.find(m => m.familyId === activeId);
    if (found) return found;
  }
  // Default to first membership
  return all[0] ?? null;
}

// Refresh the cached room data in a membership
export async function syncMembershipRoom(familyId: string): Promise<void> {
  const room = await getFamilyRoom();
  if (!room || room.id !== familyId) return;
  const all = await getAllMemberships();
  const idx = all.findIndex(m => m.familyId === familyId);
  if (idx >= 0) {
    all[idx].room = room;
    await saveMemberships(all);
  }
}

// Remove a membership (joiner leaves, or any cleanup)
export async function removeMembership(familyId: string): Promise<void> {
  const all = await getAllMemberships();
  const filtered = all.filter(m => m.familyId !== familyId);
  await AsyncStorage.setItem(KEYS.MEMBERSHIPS, JSON.stringify(filtered));
  // If this was active family, switch to first remaining or clear
  const activeId = await getActiveFamilyId();
  if (activeId === familyId) {
    if (filtered.length > 0) {
      await setActiveFamilyId(filtered[0].familyId);
      await saveFamilyRoom(filtered[0].room);
      const myMember = filtered[0].room.members.find(m => m.id === filtered[0].myMemberId);
      if (myMember) await setCurrentMember(myMember);
    } else {
      await AsyncStorage.removeItem(KEYS.ACTIVE_FAMILY_ID);
      await AsyncStorage.removeItem(KEYS.FAMILY_ROOM);
      await AsyncStorage.removeItem(KEYS.CURRENT_MEMBER);
    }
  }
}

/** Clear all room-scoped data for a given familyId/roomId */
export async function clearScopedFamilyData(roomId: string): Promise<void> {
  const keys = [
    roomKey(KEYS.FAMILY_PROFILE, roomId),
    roomKey(KEYS.CHECK_INS, roomId),
    roomKey(KEYS.MEDICATIONS, roomId),
    roomKey(KEYS.DIARY, roomId),
    roomKey(KEYS.DIARY_DRAFT, roomId),
    roomKey(KEYS.FAMILY_ANNOUNCEMENTS, roomId),
    roomKey(KEYS.BRIEFINGS, roomId),
  ];
  await AsyncStorage.multiRemove(keys);
}

// Delete a family and all associated data (creator only)
export async function deleteFamilyAndData(familyId: string): Promise<void> {
  // Clear all room-scoped data first
  await clearScopedFamilyData(familyId);
  // Also remove legacy non-scoped announcement key
  await AsyncStorage.removeItem(KEYS.FAMILY_ANNOUNCEMENTS);
  // Remove membership
  await removeMembership(familyId);
}

// ─── Care Briefings ──────────────────────────────────────────────────────────

export async function saveBriefing(briefing: CareBriefing, roomId?: string): Promise<void> {
  const rid = roomId ?? _activeRoomIdCache;
  const key = roomKey(KEYS.BRIEFINGS, rid);
  const raw = await AsyncStorage.getItem(key);
  const all: CareBriefing[] = raw ? JSON.parse(raw) : [];
  const idx = all.findIndex(b => b.date === briefing.date);
  if (idx >= 0) all[idx] = briefing;
  else all.unshift(briefing);
  const trimmed = all.slice(0, 30);
  await AsyncStorage.setItem(key, JSON.stringify(trimmed));
  // Cloud sync: bind the write to the family captured by the caller, not a mutable global pointer.
  cloudSaveBriefing(briefing, rid ? Number(rid) : undefined).catch(() => {});
}

export async function getTodayBriefing(roomId?: string): Promise<CareBriefing | null> {
  const rid = roomId ?? _activeRoomIdCache;
  const key = roomKey(KEYS.BRIEFINGS, rid);
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  const all: CareBriefing[] = JSON.parse(raw);
  return all.find(b => b.date === todayStr()) ?? null;
}

export async function getLatestBriefing(roomId?: string): Promise<CareBriefing | null> {
  const rid = roomId ?? _activeRoomIdCache;
  const key = roomKey(KEYS.BRIEFINGS, rid);
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  const all: CareBriefing[] = JSON.parse(raw);
  return all.length > 0 ? all[0] : null;
}

export async function getBriefingByDate(date: string, roomId?: string): Promise<CareBriefing | null> {
  const rid = roomId ?? _activeRoomIdCache;
  const key = roomKey(KEYS.BRIEFINGS, rid);
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  const all: CareBriefing[] = JSON.parse(raw);
  return all.find(b => b.date === date) ?? null;
}

let _migrated = false;
export async function migrateToMultiFamily(): Promise<void> {
  if (_migrated) return;
  _migrated = true;
  const existing = await AsyncStorage.getItem(KEYS.MEMBERSHIPS);
  if (existing) return; // Already migrated
  // Check for existing single-family data
  const roomRaw = await AsyncStorage.getItem(KEYS.FAMILY_ROOM);
  const memberRaw = await AsyncStorage.getItem(KEYS.CURRENT_MEMBER);
  if (!roomRaw || !memberRaw) return;
  const room: FamilyRoom = JSON.parse(roomRaw);
  const member: FamilyMember = JSON.parse(memberRaw);
  const membership: FamilyMembership = {
    familyId: room.id,
    myMemberId: member.id,
    role: member.isCreator ? 'creator' : 'joiner',
    room,
    joinedAt: member.joinedAt,
  };
  await AsyncStorage.setItem(KEYS.MEMBERSHIPS, JSON.stringify([membership]));
  await AsyncStorage.setItem(KEYS.ACTIVE_FAMILY_ID, room.id);
}

// ─── Account Deletion ─────────────────────────────────────────────────────────
/**
 * Clears all local user data from AsyncStorage.
 * Called during account deletion to ensure complete data removal.
 */
export async function clearAllLocalData(): Promise<void> {
  // First clear all room-scoped data for every membership
  try {
    const raw = await AsyncStorage.getItem(KEYS.MEMBERSHIPS);
    const memberships: FamilyMembership[] = raw ? JSON.parse(raw) : [];
    for (const m of memberships) {
      await clearScopedFamilyData(m.familyId);
    }
  } catch (e) {
    console.warn('[Storage] clearAllLocalData: failed to clear scoped data:', e);
  }
  // Then clear all global keys
  const allKeys = Object.values(KEYS);
  await AsyncStorage.multiRemove(allKeys);
  // Clear in-memory caches to prevent stale data on next login
  _activeRoomIdCache = null;
}
