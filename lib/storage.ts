import AsyncStorage from '@react-native-async-storage/async-storage';

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

// ─── Keys ─────────────────────────────────────────────────────────────────────

const KEYS = {
  PROFILE: 'elder_profile_v3',
  CHECK_INS: 'daily_checkins_v2',
  MEDICATIONS: 'medications',
  DIARY: 'diary_entries',
  FAMILY_ROOM: 'family_room_v1',
  FAMILY_ANNOUNCEMENTS: 'family_announcements_v1',
  CURRENT_MEMBER: 'current_family_member_v1',
  MEMBERSHIPS: 'family_memberships_v1',
  ACTIVE_FAMILY_ID: 'active_family_id_v1',
  BRIEFINGS: 'care_briefings_v1',
} as const;

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

// ─── Profile ──────────────────────────────────────────────────────────────────

export async function getProfile(): Promise<ElderProfile | null> {
  const raw = await AsyncStorage.getItem(KEYS.PROFILE);
  return raw ? JSON.parse(raw) : null;
}

export async function saveProfile(profile: Omit<ElderProfile, 'id'>): Promise<ElderProfile> {
  const existing = await getProfile();
  const saved: ElderProfile = { id: existing?.id ?? generateId(), ...profile };
  await AsyncStorage.setItem(KEYS.PROFILE, JSON.stringify(saved));
  return saved;
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

export async function getAllCheckIns(): Promise<DailyCheckIn[]> {
  const raw = await AsyncStorage.getItem(KEYS.CHECK_INS);
  const list: DailyCheckIn[] = raw ? JSON.parse(raw) : [];
  return list.map(normalizeMoodScore);
}

export async function getTodayCheckIn(): Promise<DailyCheckIn | null> {
  const all = await getAllCheckIns();
  return all.find(c => c.date === todayStr()) ?? null;
}

export async function getCheckInByDate(dateStr: string): Promise<DailyCheckIn | null> {
  const all = await getAllCheckIns();
  return all.find(c => c.date === dateStr) ?? null;
}

export async function getYesterdayCheckIn(): Promise<DailyCheckIn | null> {
  const all = await getAllCheckIns();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
  return all.find(c => c.date === yStr) ?? null;
}

export async function upsertCheckIn(data: Partial<DailyCheckIn> & { date: string }): Promise<DailyCheckIn> {
  const all = await getAllCheckIns();
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
  await AsyncStorage.setItem(KEYS.CHECK_INS, JSON.stringify(all));
  return checkIn;
}

export async function getRecentCheckIns(days = 7): Promise<DailyCheckIn[]> {
  const all = await getAllCheckIns();
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

export async function getMedications(): Promise<Medication[]> {
  const raw = await AsyncStorage.getItem(KEYS.MEDICATIONS);
  return raw ? JSON.parse(raw) : [];
}

export async function saveMedication(data: Omit<Medication, 'id'>): Promise<Medication> {
  const all = await getMedications();
  const med: Medication = { id: generateId(), ...data };
  all.push(med);
  await AsyncStorage.setItem(KEYS.MEDICATIONS, JSON.stringify(all));
  return med;
}

export async function saveMedications(meds: Medication[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.MEDICATIONS, JSON.stringify(meds));
}

export async function updateMedication(id: string, data: Partial<Medication>): Promise<void> {
  const all = await getMedications();
  const idx = all.findIndex(m => m.id === id);
  if (idx >= 0) {
    all[idx] = { ...all[idx], ...data };
    await AsyncStorage.setItem(KEYS.MEDICATIONS, JSON.stringify(all));
  }
}

export async function deleteMedication(id: string): Promise<void> {
  const filtered = (await getMedications()).filter(m => m.id !== id);
  await AsyncStorage.setItem(KEYS.MEDICATIONS, JSON.stringify(filtered));
}

// ─── Diary Entries ────────────────────────────────────────────────────────────

export async function getDiaryEntries(): Promise<DiaryEntry[]> {
  const raw = await AsyncStorage.getItem(KEYS.DIARY);
  return raw ? JSON.parse(raw) : [];
}

export async function saveDiaryEntry(data: Omit<DiaryEntry, 'id'>): Promise<DiaryEntry> {
  const all = await getDiaryEntries();
  const entry: DiaryEntry = { id: generateId(), createdAt: new Date().toISOString(), ...data };
  all.unshift(entry);
  await AsyncStorage.setItem(KEYS.DIARY, JSON.stringify(all));
  return entry;
}

export async function updateDiaryEntry(id: string, data: Partial<DiaryEntry>): Promise<DiaryEntry | null> {
  const all = await getDiaryEntries();
  const idx = all.findIndex(e => e.id === id);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], ...data };
  await AsyncStorage.setItem(KEYS.DIARY, JSON.stringify(all));
  return all[idx];
}

export async function getDiaryEntryById(id: string): Promise<DiaryEntry | null> {
  const all = await getDiaryEntries();
  return all.find(e => e.id === id) ?? null;
}

export async function deleteDiaryEntry(id: string): Promise<void> {
  const filtered = (await getDiaryEntries()).filter(e => e.id !== id);
  await AsyncStorage.setItem(KEYS.DIARY, JSON.stringify(filtered));
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
  const room = await getFamilyRoom();
  if (!room) return null;
  return room.roomCode === code.toUpperCase() ? room : null;
}

export async function getCurrentUserIsCreator(): Promise<boolean> {
  const member = await getCurrentMember();
  return member?.isCreator === true;
}

export async function createFamilyRoom(elderName: string, firstMember: Omit<FamilyMember, 'id' | 'joinedAt'>, existingCode?: string, elderOpts?: { emoji?: string; photoUri?: string }): Promise<FamilyRoom> {
  const member: FamilyMember = {
    id: generateId(),
    ...firstMember,
    isCreator: true,
    joinedAt: new Date().toISOString(),
    isCurrentUser: true,
  };
  const room: FamilyRoom = {
    id: generateId(),
    roomCode: existingCode ?? generateRoomCode(),
    elderName,
    elderEmoji: elderOpts?.emoji,
    elderPhotoUri: elderOpts?.photoUri,
    members: [member],
    createdAt: new Date().toISOString(),
  };
  await saveFamilyRoom(room);
  await setCurrentMember(member);
  // Save membership record
  const membership: FamilyMembership = {
    familyId: room.id,
    myMemberId: member.id,
    role: 'creator',
    room,
    joinedAt: member.joinedAt,
  };
  await addOrUpdateMembership(membership);
  await setActiveFamilyId(room.id);
  return room;
}

export async function joinFamilyRoom(roomCode: string, member: Omit<FamilyMember, 'id' | 'joinedAt'>): Promise<FamilyRoom | null> {
  const room = await getFamilyRoom();
  if (!room || room.roomCode !== roomCode.toUpperCase()) return null;
  const newMember: FamilyMember = {
    id: generateId(),
    ...member,
    isCreator: false,
    joinedAt: new Date().toISOString(),
    isCurrentUser: true,
  };
  // Mark all existing as not current user
  room.members = room.members.map(m => ({ ...m, isCurrentUser: false }));
  room.members.push(newMember);
  await saveFamilyRoom(room);
  await setCurrentMember(newMember);
  // Save membership record
  const membership: FamilyMembership = {
    familyId: room.id,
    myMemberId: newMember.id,
    role: 'joiner',
    room,
    joinedAt: newMember.joinedAt,
  };
  await addOrUpdateMembership(membership);
  await setActiveFamilyId(room.id);
  return room;
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

export async function getFamilyAnnouncements(days = 30): Promise<FamilyAnnouncement[]> {
  const raw = await AsyncStorage.getItem(KEYS.FAMILY_ANNOUNCEMENTS);
  const all: FamilyAnnouncement[] = raw ? JSON.parse(raw) : [];
  // Return last N days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return all.filter(a => new Date(a.createdAt) >= cutoff);
}

export async function getTodayAnnouncements(): Promise<FamilyAnnouncement[]> {
  const all = await getFamilyAnnouncements(1);
  return all.filter(a => a.date === todayStr());
}

export async function saveFamilyAnnouncement(data: Omit<FamilyAnnouncement, 'id' | 'createdAt' | 'date'>): Promise<FamilyAnnouncement> {
  const raw = await AsyncStorage.getItem(KEYS.FAMILY_ANNOUNCEMENTS);
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
  await AsyncStorage.setItem(KEYS.FAMILY_ANNOUNCEMENTS, JSON.stringify(all));
  return announcement;
}

export async function deleteFamilyAnnouncement(id: string): Promise<void> {
  const raw = await AsyncStorage.getItem(KEYS.FAMILY_ANNOUNCEMENTS);
  const all: FamilyAnnouncement[] = raw ? JSON.parse(raw) : [];
  const filtered = all.filter(a => a.id !== id);
  await AsyncStorage.setItem(KEYS.FAMILY_ANNOUNCEMENTS, JSON.stringify(filtered));
}

export async function toggleAnnouncementReaction(
  announcementId: string,
  emoji: string,
  member: { memberId: string; memberName: string; memberEmoji: string }
): Promise<void> {
  const raw = await AsyncStorage.getItem(KEYS.FAMILY_ANNOUNCEMENTS);
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
  await AsyncStorage.setItem(KEYS.FAMILY_ANNOUNCEMENTS, JSON.stringify(all));
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

// Delete a family and all associated data (creator only)
export async function deleteFamilyAndData(familyId: string): Promise<void> {
  // Remove announcements
  await AsyncStorage.removeItem(KEYS.FAMILY_ANNOUNCEMENTS);
  // Remove membership
  await removeMembership(familyId);
}

// ─── Care Briefings ──────────────────────────────────────────────────────────

export async function saveBriefing(briefing: CareBriefing): Promise<void> {
  const raw = await AsyncStorage.getItem(KEYS.BRIEFINGS);
  const all: CareBriefing[] = raw ? JSON.parse(raw) : [];
  const idx = all.findIndex(b => b.date === briefing.date);
  if (idx >= 0) all[idx] = briefing;
  else all.unshift(briefing);
  const trimmed = all.slice(0, 30);
  await AsyncStorage.setItem(KEYS.BRIEFINGS, JSON.stringify(trimmed));
}

export async function getTodayBriefing(): Promise<CareBriefing | null> {
  const raw = await AsyncStorage.getItem(KEYS.BRIEFINGS);
  if (!raw) return null;
  const all: CareBriefing[] = JSON.parse(raw);
  return all.find(b => b.date === todayStr()) ?? null;
}

export async function getLatestBriefing(): Promise<CareBriefing | null> {
  const raw = await AsyncStorage.getItem(KEYS.BRIEFINGS);
  if (!raw) return null;
  const all: CareBriefing[] = JSON.parse(raw);
  return all.length > 0 ? all[0] : null;
}

export async function getBriefingByDate(date: string): Promise<CareBriefing | null> {
  const raw = await AsyncStorage.getItem(KEYS.BRIEFINGS);
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
  const allKeys = Object.values(KEYS);
  await AsyncStorage.multiRemove(allKeys);
}
