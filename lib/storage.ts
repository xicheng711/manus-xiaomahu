import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  cloudSyncCheckIn,
  cloudSyncDiary,
  cloudSyncMedication,
  cloudPostAnnouncement,
  cloudSaveBriefing,
  cloudCreateRoom,
  cloudJoinRoom,
  cloudGetRoomDetail,
  cloudLookupRoom,
  cloudUpdateElderProfile,
  setCloudSyncState,
} from './cloud-sync';

// ─── Types ────────────────────────────────────────────────────────────────────

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
}

export interface Medication {
  id: string;
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
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'ai';
  text: string;
  createdAt: string;
}

export interface DiaryEntry {
  id: string;
  date: string;
  content: string;
  voiceUri?: string;
  moodEmoji: string;
  moodLabel?: string;
  moodScore?: number;
  tags?: string[];
  createdAt?: string;
  caregiverMoodEmoji?: string;  // v5.0: 照顾者心情（从打卡移过来）
  caregiverMoodLabel?: string;
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
  DIARY: 'diary_entries',
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
  // Migrate from legacy global ElderProfile if available
  if (rid) {
    const legacy = await getProfile();
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
  // Cloud sync: update elder profile on server
  cloudUpdateElderProfile(merged as any).catch(() => {});
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
  // If scoped key is empty but we have a rid, try migrating from legacy
  if (!raw && rid) {
    const legacy = await AsyncStorage.getItem(KEYS.CHECK_INS);
    if (legacy) {
      await AsyncStorage.setItem(key, legacy);
      await AsyncStorage.removeItem(KEYS.CHECK_INS);
      const list: DailyCheckIn[] = JSON.parse(legacy);
      return list.map(normalizeMoodScore);
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
    ? { ...all[idx], ...data, completedAt: new Date().toISOString() }
    : { ...defaults, ...data };
  if (idx >= 0) all[idx] = checkIn;
  else all.unshift(checkIn);
  await AsyncStorage.setItem(key, JSON.stringify(all));
  // Cloud sync: sync check-in to server
  cloudSyncCheckIn(checkIn).catch(() => {});
  return checkIn;
}

export async function getRecentCheckIns(days = 7, roomId?: string): Promise<DailyCheckIn[]> {
  const all = await getAllCheckIns(roomId);
  return all.slice(0, days);
}

export async function getWeeklySleepData(days = 7): Promise<Array<{
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
  const all = await getAllCheckIns();
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
    const dateStr = d.toISOString().split('T')[0];
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

export async function getMedications(roomId?: string): Promise<Medication[]> {
  const rid = roomId ?? _activeRoomIdCache;
  const key = roomKey(KEYS.MEDICATIONS, rid);
  const raw = await AsyncStorage.getItem(key);
  if (!raw && rid) {
    const legacy = await AsyncStorage.getItem(KEYS.MEDICATIONS);
    if (legacy) {
      await AsyncStorage.setItem(key, legacy);
      await AsyncStorage.removeItem(KEYS.MEDICATIONS);
      return JSON.parse(legacy);
    }
  }
  return raw ? JSON.parse(raw) : [];
}

export async function saveMedication(data: Omit<Medication, 'id'>, roomId?: string): Promise<Medication> {
  const rid = roomId ?? _activeRoomIdCache;
  const key = roomKey(KEYS.MEDICATIONS, rid);
  const all = await getMedications(rid ?? undefined);
  const med: Medication = { id: generateId(), ...data };
  all.push(med);
  await AsyncStorage.setItem(key, JSON.stringify(all));
  // Cloud sync: sync medication to server
  cloudSyncMedication(med).catch(() => {});
  return med;
}

export async function saveMedications(meds: Medication[], roomId?: string): Promise<void> {
  const rid = roomId ?? _activeRoomIdCache;
  const key = roomKey(KEYS.MEDICATIONS, rid);
  await AsyncStorage.setItem(key, JSON.stringify(meds));
}

export async function updateMedication(id: string, data: Partial<Medication>, roomId?: string): Promise<void> {
  const rid = roomId ?? _activeRoomIdCache;
  const key = roomKey(KEYS.MEDICATIONS, rid);
  const all = await getMedications(rid ?? undefined);
  const idx = all.findIndex(m => m.id === id);
  if (idx >= 0) {
    all[idx] = { ...all[idx], ...data };
    await AsyncStorage.setItem(key, JSON.stringify(all));
    // Cloud sync: sync updated medication to server
    cloudSyncMedication(all[idx]).catch(() => {});
  }
}

export async function deleteMedication(id: string, roomId?: string): Promise<void> {
  const rid = roomId ?? _activeRoomIdCache;
  const key = roomKey(KEYS.MEDICATIONS, rid);
  const filtered = (await getMedications(rid ?? undefined)).filter(m => m.id !== id);
  await AsyncStorage.setItem(key, JSON.stringify(filtered));
}

// ─── Diary Entries ────────────────────────────────────────────────────────────

export async function getDiaryEntries(roomId?: string): Promise<DiaryEntry[]> {
  const rid = roomId ?? _activeRoomIdCache;
  const key = roomKey(KEYS.DIARY, rid);
  const raw = await AsyncStorage.getItem(key);
  if (!raw && rid) {
    const legacy = await AsyncStorage.getItem(KEYS.DIARY);
    if (legacy) {
      await AsyncStorage.setItem(key, legacy);
      await AsyncStorage.removeItem(KEYS.DIARY);
      return JSON.parse(legacy);
    }
  }
  return raw ? JSON.parse(raw) : [];
}

export async function saveDiaryEntry(data: Omit<DiaryEntry, 'id'>, roomId?: string): Promise<DiaryEntry> {
  const rid = roomId ?? _activeRoomIdCache;
  const key = roomKey(KEYS.DIARY, rid);
  const all = await getDiaryEntries(rid ?? undefined);
  const entry: DiaryEntry = { id: generateId(), createdAt: new Date().toISOString(), ...data };
  all.unshift(entry);
  await AsyncStorage.setItem(key, JSON.stringify(all));
  // Cloud sync: sync diary entry to server
  cloudSyncDiary(entry).catch(() => {});
  return entry;
}

export async function updateDiaryEntry(id: string, data: Partial<DiaryEntry>, roomId?: string): Promise<DiaryEntry | null> {
  const rid = roomId ?? _activeRoomIdCache;
  const key = roomKey(KEYS.DIARY, rid);
  const all = await getDiaryEntries(rid ?? undefined);
  const idx = all.findIndex(e => e.id === id);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], ...data };
  await AsyncStorage.setItem(key, JSON.stringify(all));
  // Cloud sync: sync updated diary entry to server
  cloudSyncDiary(all[idx]).catch(() => {});
  return all[idx];
}

export async function getDiaryEntryById(id: string, roomId?: string): Promise<DiaryEntry | null> {
  const all = await getDiaryEntries(roomId);
  return all.find(e => e.id === id) ?? null;
}

export async function deleteDiaryEntry(id: string, roomId?: string): Promise<void> {
  const rid = roomId ?? _activeRoomIdCache;
  const key = roomKey(KEYS.DIARY, rid);
  const filtered = (await getDiaryEntries(rid ?? undefined)).filter(e => e.id !== id);
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

export async function createFamilyRoom(elderName: string, firstMember: Omit<FamilyMember, 'id' | 'joinedAt'>, existingCode?: string, elderOpts?: { emoji?: string; photoUri?: string }): Promise<FamilyRoom> {
  // Step 1: Create on server first (cloud-first for shared invite code)
  // Server returns both roomId AND memberId — use both as authoritative IDs
  let serverRoomId: number | null = null;
  let serverMemberId: number | null = null;
  let serverRoomCode: string | null = null;
  // Load the full FamilyProfile so the cloud room is complete from the very first moment.
  // Without this, a joiner who enters right after creation would see an incomplete elder profile.
  const existingFamilyProfile = await getFamilyProfile();
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
      // Pass full elder profile so cloud room is complete from creation instant
      elderProfile: existingFamilyProfile ? {
        nickname: existingFamilyProfile.nickname,
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

export async function updateFamilyMemberPhoto(memberId: string, photoUri: string): Promise<void> {
  const room = await getFamilyRoom();
  if (!room) return;
  const idx = room.members.findIndex(m => m.id === memberId);
  if (idx >= 0) {
    room.members[idx].photoUri = photoUri;
    await saveFamilyRoom(room);
    // Also update current member if it's the same
    const current = await getCurrentMember();
    if (current && current.id === memberId) {
      await setCurrentMember({ ...current, photoUri });
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
  const announcement: FamilyAnnouncement = {
    id: generateId(),
    ...data,
    date: todayStr(),
    createdAt: new Date().toISOString(),
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
  // Cloud sync: save briefing to server
  cloudSaveBriefing(briefing).catch(() => {});
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
}
