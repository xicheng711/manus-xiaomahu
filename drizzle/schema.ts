import { int, float, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, json, index, uniqueIndex } from "drizzle-orm/mysql-core";

// ─── Users (existing) ────────────────────────────────────────────────────────

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  pushToken: varchar("pushToken", { length: 200 }),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Family Rooms ────────────────────────────────────────────────────────────

export const familyRooms = mysqlTable("family_rooms", {
  id: int("id").autoincrement().primaryKey(),
  roomCode: varchar("roomCode", { length: 10 }).notNull().unique(),
  elderName: varchar("elderName", { length: 100 }).notNull(),
  elderEmoji: varchar("elderEmoji", { length: 20 }),
  elderPhotoUri: text("elderPhotoUri"),
  creatorUserId: int("creatorUserId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FamilyRoom = typeof familyRooms.$inferSelect;
export type InsertFamilyRoom = typeof familyRooms.$inferInsert;

// ─── Family Members ──────────────────────────────────────────────────────────

export const familyMembers = mysqlTable("family_members", {
  id: int("id").autoincrement().primaryKey(),
  roomId: int("roomId").notNull(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  role: mysqlEnum("memberRole", ["caregiver", "family", "nurse"]).default("family").notNull(),
  roleLabel: varchar("roleLabel", { length: 50 }).notNull(),
  emoji: varchar("emoji", { length: 20 }).notNull(),
  color: varchar("color", { length: 20 }).notNull(),
  photoUri: text("photoUri"),
  birthYear: int("birthYear"),
  relationship: varchar("relationship", { length: 50 }),
  isCreator: boolean("isCreator").default(false).notNull(),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
});

export type FamilyMember = typeof familyMembers.$inferSelect;
export type InsertFamilyMember = typeof familyMembers.$inferInsert;

// ─── Elder Profiles (shared per family room) ─────────────────────────────────

export const elderProfiles = mysqlTable("elder_profiles", {
  id: int("id").autoincrement().primaryKey(),
  roomId: int("roomId").notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  nickname: varchar("nickname", { length: 100 }).notNull(),
  birthDate: varchar("birthDate", { length: 10 }),
  zodiacEmoji: varchar("zodiacEmoji", { length: 20 }),
  zodiacName: varchar("zodiacName", { length: 20 }),
  elderPhotoUri: text("elderPhotoUri"),
  elderAvatarType: varchar("elderAvatarType", { length: 10 }),
  city: varchar("city", { length: 50 }),
  reminderMorning: varchar("reminderMorning", { length: 10 }),
  reminderEvening: varchar("reminderEvening", { length: 10 }),
  careNeeds: json("careNeeds"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ElderProfile = typeof elderProfiles.$inferSelect;
export type InsertElderProfile = typeof elderProfiles.$inferInsert;

// ─── Daily Check-ins ─────────────────────────────────────────────────────────

export const checkIns = mysqlTable("check_ins", {
  id: int("id").autoincrement().primaryKey(),
  roomId: int("roomId").notNull(),
  authorUserId: int("authorUserId").notNull(),
  date: varchar("date", { length: 10 }).notNull(),         // YYYY-MM-DD
  // Morning check-in
  sleepHours: float("sleepHours"),
  sleepQuality: mysqlEnum("sleepQuality", ["poor", "fair", "good"]),
  sleepInput: json("sleepInput"),
  sleepScore: int("sleepScore"),
  sleepProblems: json("sleepProblems"),
  sleepType: varchar("sleepType", { length: 10 }),
  sleepSegments: json("sleepSegments"),
  awakeHours: int("awakeHours"),
  nightWakings: int("nightWakings"),
  daytimeNap: boolean("daytimeNap"),
  napMinutes: int("napMinutes"),
  morningNotes: text("morningNotes"),
  morningDone: boolean("morningDone").default(false).notNull(),
  // Evening check-in
  moodEmoji: varchar("moodEmoji", { length: 20 }),
  moodScore: int("moodScore"),
  medicationTaken: boolean("medicationTaken"),
  medicationNotes: text("medicationNotes"),
  mealNotes: text("mealNotes"),
  mealOption: varchar("mealOption", { length: 50 }),
  eveningNotes: text("eveningNotes"),
  eveningDone: boolean("eveningDone").default(false).notNull(),
  // AI generated
  aiMessage: text("aiMessage"),
  careScore: int("careScore"),
  completedAt: varchar("completedAt", { length: 30 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CheckIn = typeof checkIns.$inferSelect;
export type InsertCheckIn = typeof checkIns.$inferInsert;

// ─── Diary Entries ───────────────────────────────────────────────────────────

export const diaryEntries = mysqlTable("diary_entries", {
  id: int("id").autoincrement().primaryKey(),
  roomId: int("roomId").notNull(),
  authorUserId: int("authorUserId").notNull(),
  date: varchar("date", { length: 10 }).notNull(),
  content: text("content").notNull(),
  moodEmoji: varchar("moodEmoji", { length: 20 }),
  moodLabel: varchar("moodLabel", { length: 50 }),
  moodScore: int("moodScore"),
  tags: json("tags"),
  caregiverMoodEmoji: varchar("caregiverMoodEmoji", { length: 20 }),
  caregiverMoodLabel: varchar("caregiverMoodLabel", { length: 50 }),
  aiReply: text("aiReply"),
  aiEmoji: varchar("aiEmoji", { length: 20 }),
  aiTip: text("aiTip"),
  conversation: json("conversation"),
  conversationFinished: boolean("conversationFinished").default(false),
  localTimeStr: varchar("localTimeStr", { length: 10 }),  // e.g. "14:23" — writer's local time, timezone-safe
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DiaryEntry = typeof diaryEntries.$inferSelect;
export type InsertDiaryEntry = typeof diaryEntries.$inferInsert;

// ─── Diary Interactions ──────────────────────────────────────────────────────

// 每位家庭成员对每篇日记只保留一条阅读回执（服务端以 diaryId + readerUserId 做幂等更新）
export const diaryReads = mysqlTable("diary_reads", {
  id: int("id").autoincrement().primaryKey(),
  roomId: int("roomId").notNull(),
  diaryId: int("diaryId").notNull(),
  readerUserId: int("readerUserId").notNull(),
  readerName: varchar("readerName", { length: 100 }).notNull(),
  readerEmoji: varchar("readerEmoji", { length: 20 }).notNull(),
  readAt: timestamp("readAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("uq_diary_reader").on(table.diaryId, table.readerUserId),
  index("idx_diary_reads_room_diary").on(table.roomId, table.diaryId),
]);
export type DiaryRead = typeof diaryReads.$inferSelect;
export type InsertDiaryRead = typeof diaryReads.$inferInsert;

export const diaryComments = mysqlTable("diary_comments", {
  id: int("id").autoincrement().primaryKey(),
  roomId: int("roomId").notNull(),
  diaryId: int("diaryId").notNull(),
  authorUserId: int("authorUserId").notNull(),
  authorName: varchar("authorName", { length: 100 }).notNull(),
  authorEmoji: varchar("authorEmoji", { length: 20 }).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("idx_diary_comments_room_diary").on(table.roomId, table.diaryId),
  index("idx_diary_comments_created").on(table.createdAt),
]);
export type DiaryComment = typeof diaryComments.$inferSelect;
export type InsertDiaryComment = typeof diaryComments.$inferInsert;

// ─── Family Announcements ────────────────────────────────────────────────────

export const announcements = mysqlTable("announcements", {
  id: int("id").autoincrement().primaryKey(),
  roomId: int("roomId").notNull(),
  authorUserId: int("authorUserId").notNull(),
  authorName: varchar("authorName", { length: 100 }).notNull(),
  authorEmoji: varchar("authorEmoji", { length: 20 }).notNull(),
  authorColor: varchar("authorColor", { length: 20 }).notNull(),
  content: text("content").notNull(),
  emoji: varchar("emoji", { length: 20 }),
  type: mysqlEnum("announcementType", ["news", "visit", "medical", "daily", "reminder"]).default("daily").notNull(),
  date: varchar("date", { length: 10 }).notNull(),
  localTimeStr: varchar("localTimeStr", { length: 5 }),  // HH:MM — 发布者本地时间
  reactions: json("reactions"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Announcement = typeof announcements.$inferSelect;
export type InsertAnnouncement = typeof announcements.$inferInsert;

// ─── Care Briefings ──────────────────────────────────────────────────────────

export const briefings = mysqlTable("briefings", {
  id: int("id").autoincrement().primaryKey(),
  roomId: int("roomId").notNull(),
  date: varchar("date", { length: 10 }).notNull(),
  careScore: int("careScore"),
  summary: text("summary"),
  encouragement: text("encouragement"),
  highlights: json("highlights"),
  attention: text("attention"),
  shareText: text("shareText"),
  generatedAt: varchar("generatedAt", { length: 30 }),
  checkInDate: varchar("checkInDate", { length: 10 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Briefing = typeof briefings.$inferSelect;
export type InsertBriefing = typeof briefings.$inferInsert;

// ─── Medications ─────────────────────────────────────────────────────────────

export const medications = mysqlTable("medications", {
  id: int("id").autoincrement().primaryKey(),
  roomId: int("roomId").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  dosage: varchar("dosage", { length: 100 }),
  frequency: varchar("frequency", { length: 50 }),
  times: json("times"),
  notes: text("notes"),
  icon: varchar("icon", { length: 20 }),
  active: boolean("active").default(true).notNull(),
  reminderEnabled: boolean("reminderEnabled").default(true),
  color: varchar("color", { length: 20 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Medication = typeof medications.$inferSelect;
export type InsertMedication = typeof medications.$inferInsert;

// ─── Medication Change History ───────────────────────────────────────────────

export const medicationChanges = mysqlTable("medication_changes", {
  id: int("id").autoincrement().primaryKey(),
  roomId: int("roomId").notNull(),
  medicationId: int("medicationId"),
  eventId: varchar("eventId", { length: 100 }).notNull(),
  changedByUserId: int("changedByUserId").notNull(),
  changedByName: varchar("changedByName", { length: 100 }).notNull(),
  changeType: varchar("changeType", { length: 30 }).notNull(),
  reason: text("reason"),
  previousSnapshot: json("previousSnapshot"),
  nextSnapshot: json("nextSnapshot"),
  changedAt: timestamp("changedAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("uq_medication_change_event").on(table.eventId),
  index("idx_medication_changes_room_time").on(table.roomId, table.changedAt),
  index("idx_medication_changes_medication").on(table.roomId, table.medicationId),
]);

export type MedicationChange = typeof medicationChanges.$inferSelect;
export type InsertMedicationChange = typeof medicationChanges.$inferInsert;
