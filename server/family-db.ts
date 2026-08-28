/**
 * Family cloud sync — database access layer
 * All family-related CRUD operations for cloud sync
 */

import { eq, and, desc, asc, inArray, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  familyRooms, InsertFamilyRoom,
  familyMembers, InsertFamilyMember,
  elderProfiles, InsertElderProfile,
  checkIns, InsertCheckIn,
  diaryEntries, InsertDiaryEntry,
  diaryReads, InsertDiaryRead,
  diaryComments, InsertDiaryComment,
  announcements, InsertAnnouncement,
  briefings, InsertBriefing,
  medications, InsertMedication,
  medicationChanges, InsertMedicationChange,
} from "../drizzle/schema";

// ─── Family Rooms ────────────────────────────────────────────────────────────

export async function createFamilyRoom(data: InsertFamilyRoom) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(familyRooms).values(data);
  const insertId = result[0].insertId;
  return { id: insertId, ...data };
}

export async function getFamilyRoomByCode(roomCode: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(familyRooms).where(eq(familyRooms.roomCode, roomCode)).limit(1);
  return rows[0] ?? null;
}

export async function getFamilyRoomById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(familyRooms).where(eq(familyRooms.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function updateFamilyRoom(id: number, data: Partial<InsertFamilyRoom>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(familyRooms).set(data).where(eq(familyRooms.id, id));
}

export async function getUserFamilyRooms(userId: number) {
  const db = await getDb();
  if (!db) return [];
  // Find all rooms where user is a member
  const memberships = await db.select().from(familyMembers).where(eq(familyMembers.userId, userId));
  if (memberships.length === 0) return [];
  const roomIds = memberships.map(m => m.roomId);
  const rooms = [];
  for (const roomId of roomIds) {
    const room = await getFamilyRoomById(roomId);
    if (room) rooms.push({ room, membership: memberships.find(m => m.roomId === roomId)! });
  }
  // 关键修复：将 creator 家庭排在最前，确保客户端激活第一个家庭时优先选择 creator 身份
  rooms.sort((a, b) => {
    if (a.membership.isCreator && !b.membership.isCreator) return -1;
    if (!a.membership.isCreator && b.membership.isCreator) return 1;
    return 0;
  });
  return rooms;
}

// ─── Family Members ──────────────────────────────────────────────────────────

export async function addFamilyMember(data: InsertFamilyMember) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Check if user already in this room
  const existing = await db.select().from(familyMembers)
    .where(and(eq(familyMembers.roomId, data.roomId), eq(familyMembers.userId, data.userId)))
    .limit(1);
  if (existing.length > 0) return existing[0];
  const result = await db.insert(familyMembers).values(data);
  return { id: result[0].insertId, ...data };
}

export async function getRoomMembers(roomId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(familyMembers).where(eq(familyMembers.roomId, roomId));
}

export async function getMemberByUserId(roomId: number, userId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(familyMembers)
    .where(and(eq(familyMembers.roomId, roomId), eq(familyMembers.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateFamilyMember(id: number, data: Partial<InsertFamilyMember>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(familyMembers).set(data).where(eq(familyMembers.id, id));
}

// ─── Elder Profiles ──────────────────────────────────────────────────────────

export async function upsertElderProfile(data: InsertElderProfile) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(elderProfiles)
    .where(eq(elderProfiles.roomId, data.roomId)).limit(1);
  if (existing.length > 0) {
    await db.update(elderProfiles).set(data).where(eq(elderProfiles.roomId, data.roomId));
    return { ...existing[0], ...data };
  }
  const result = await db.insert(elderProfiles).values(data);
  return { id: result[0].insertId, ...data };
}

export async function getElderProfile(roomId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(elderProfiles).where(eq(elderProfiles.roomId, roomId)).limit(1);
  return rows[0] ?? null;
}

// ─── Check-ins ───────────────────────────────────────────────────────────────

export async function upsertCheckIn(data: InsertCheckIn) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(checkIns)
    .where(and(eq(checkIns.roomId, data.roomId!), eq(checkIns.date, data.date!)))
    .limit(1);
  if (existing.length > 0) {
    await db.update(checkIns).set(data).where(eq(checkIns.id, existing[0].id));
    return { ...existing[0], ...data };
  }
  const result = await db.insert(checkIns).values(data);
  return { id: result[0].insertId, ...data };
}

export async function getCheckInsByRoom(roomId: number, limit = 30) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(checkIns)
    .where(eq(checkIns.roomId, roomId))
    .orderBy(desc(checkIns.date))
    .limit(limit);
}

export async function getCheckInByDate(roomId: number, date: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(checkIns)
    .where(and(eq(checkIns.roomId, roomId), eq(checkIns.date, date)))
    .limit(1);
  return rows[0] ?? null;
}

// ─── Diary Entries ───────────────────────────────────────────────────────────

export async function createDiaryEntry(data: InsertDiaryEntry) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(diaryEntries).values(data);
  return { id: result[0].insertId, ...data };
}

export async function updateDiaryEntry(id: number, data: Partial<InsertDiaryEntry>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(diaryEntries).set(data).where(eq(diaryEntries.id, id));
}

export async function deleteDiaryEntryById(roomId: number, diaryId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // MySQL 表未依赖级联删除，先清互动记录，再删除日记本身。
  await db.delete(diaryReads).where(and(eq(diaryReads.roomId, roomId), eq(diaryReads.diaryId, diaryId)));
  await db.delete(diaryComments).where(and(eq(diaryComments.roomId, roomId), eq(diaryComments.diaryId, diaryId)));
  await db.delete(diaryEntries).where(and(eq(diaryEntries.roomId, roomId), eq(diaryEntries.id, diaryId)));
}

export async function getDiaryEntriesByRoom(roomId: number, limit = 100) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: diaryEntries.id,
      roomId: diaryEntries.roomId,
      authorUserId: diaryEntries.authorUserId,
      date: diaryEntries.date,
      content: diaryEntries.content,
      moodEmoji: diaryEntries.moodEmoji,
      moodLabel: diaryEntries.moodLabel,
      moodScore: diaryEntries.moodScore,
      tags: diaryEntries.tags,
      caregiverMoodEmoji: diaryEntries.caregiverMoodEmoji,
      caregiverMoodLabel: diaryEntries.caregiverMoodLabel,
      aiReply: diaryEntries.aiReply,
      aiEmoji: diaryEntries.aiEmoji,
      aiTip: diaryEntries.aiTip,
      conversation: diaryEntries.conversation,
      conversationFinished: diaryEntries.conversationFinished,
      localTimeStr: diaryEntries.localTimeStr,
      createdAt: diaryEntries.createdAt,
      updatedAt: diaryEntries.updatedAt,
      authorName: familyMembers.name,
    })
    .from(diaryEntries)
    .leftJoin(
      familyMembers,
      and(
        eq(familyMembers.userId, diaryEntries.authorUserId),
        eq(familyMembers.roomId, diaryEntries.roomId),
      )
    )
    .where(eq(diaryEntries.roomId, roomId))
    .orderBy(desc(diaryEntries.date), desc(diaryEntries.createdAt), desc(diaryEntries.id))
    .limit(limit);
  return rows;
}

export async function getDiaryEntryForInteraction(roomId: number, diaryId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(diaryEntries)
    .where(and(eq(diaryEntries.id, diaryId), eq(diaryEntries.roomId, roomId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function markDiaryRead(data: InsertDiaryRead) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // 唯一键 (diaryId, readerUserId) + upsert，确保页面重复挂载或并发请求不会生成重复回执。
  await db.insert(diaryReads).values(data).onDuplicateKeyUpdate({
    set: {
      readerName: data.readerName,
      readerEmoji: data.readerEmoji,
      readAt: new Date(),
    },
  });
  const rows = await db.select().from(diaryReads)
    .where(and(eq(diaryReads.diaryId, data.diaryId!), eq(diaryReads.readerUserId, data.readerUserId!)))
    .limit(1);
  return rows[0];
}

export async function getDiaryInteractions(roomId: number, diaryId: number) {
  const db = await getDb();
  if (!db) return { readers: [], comments: [] };
  const [readers, comments] = await Promise.all([
    db.select().from(diaryReads)
      .where(and(eq(diaryReads.roomId, roomId), eq(diaryReads.diaryId, diaryId)))
      .orderBy(desc(diaryReads.readAt)),
    db.select().from(diaryComments)
      .where(and(eq(diaryComments.roomId, roomId), eq(diaryComments.diaryId, diaryId)))
      .orderBy(asc(diaryComments.createdAt), asc(diaryComments.id)),
  ]);
  return { readers, comments };
}

export async function addDiaryComment(data: InsertDiaryComment) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(diaryComments).values(data);
  const rows = await db.select().from(diaryComments)
    .where(eq(diaryComments.id, result[0].insertId))
    .limit(1);
  return rows[0];
}

export async function deleteDiaryCommentByAuthor(roomId: number, commentId: number, authorUserId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select({ id: diaryComments.id }).from(diaryComments)
    .where(and(
      eq(diaryComments.id, commentId),
      eq(diaryComments.roomId, roomId),
      eq(diaryComments.authorUserId, authorUserId),
    ))
    .limit(1);
  if (!existing[0]) return false;
  await db.delete(diaryComments).where(and(
    eq(diaryComments.id, commentId),
    eq(diaryComments.roomId, roomId),
    eq(diaryComments.authorUserId, authorUserId),
  ));
  return true;
}

export async function getDiaryInteractionSummaries(roomId: number, diaryIds: number[]) {
  const db = await getDb();
  if (!db || diaryIds.length === 0) return [];
  const [allReaders, allComments] = await Promise.all([
    db.select().from(diaryReads).where(and(
      eq(diaryReads.roomId, roomId),
      inArray(diaryReads.diaryId, diaryIds),
    )),
    db.select().from(diaryComments).where(and(
      eq(diaryComments.roomId, roomId),
      inArray(diaryComments.diaryId, diaryIds),
    )),
  ]);
  return diaryIds.map(diaryId => ({
    diaryId,
    readers: allReaders
      .filter(reader => reader.diaryId === diaryId)
      .map(reader => ({
        readerUserId: reader.readerUserId,
        readerName: reader.readerName,
        readerEmoji: reader.readerEmoji,
      })),
    commentCount: allComments.filter(comment => comment.diaryId === diaryId).length,
  }));
}

// ─── Announcements ───────────────────────────────────────────────────────────

export async function createAnnouncement(data: InsertAnnouncement) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(announcements).values(data);
  return { id: result[0].insertId, ...data };
}

export async function getAnnouncementsByRoom(roomId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(announcements)
    .where(eq(announcements.roomId, roomId))
    .orderBy(desc(announcements.createdAt))
    .limit(limit);
}

export async function addReaction(announcementId: number, reactions: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(announcements).set({ reactions }).where(eq(announcements.id, announcementId));
}

// ─── Briefings ───────────────────────────────────────────────────────────────

export async function createBriefing(data: InsertBriefing) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(briefings).values(data);
  return { id: result[0].insertId, ...data };
}

export async function getBriefingsByRoom(roomId: number, limit = 14) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(briefings)
    .where(eq(briefings.roomId, roomId))
    .orderBy(desc(briefings.date))
    .limit(limit);
}

export async function getBriefingByDate(roomId: number, date: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(briefings)
    .where(and(eq(briefings.roomId, roomId), eq(briefings.date, date)))
    .limit(1);
  return rows[0] ?? null;
}

// ─── Medications ─────────────────────────────────────────────────────────────

export async function upsertMedication(data: InsertMedication & { id?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { id, ...values } = data;
  if (id) {
    const existing = await db.select({ id: medications.id }).from(medications)
      .where(and(eq(medications.id, id), eq(medications.roomId, values.roomId)))
      .limit(1);
    if (!existing[0]) throw new Error("Medication not found in this room");
    await db.update(medications).set(values)
      .where(and(eq(medications.id, id), eq(medications.roomId, values.roomId)));
    return { id, ...values };
  }
  // No id: find existing by roomId + name to avoid duplicate creates from legacy clients.
  const existing = await db.select().from(medications)
    .where(and(eq(medications.roomId, values.roomId), eq(medications.name, values.name)))
    .limit(1);
  if (existing.length > 0) {
    const existingId = existing[0].id;
    await db.update(medications).set(values)
      .where(and(eq(medications.id, existingId), eq(medications.roomId, values.roomId)));
    return { id: existingId, ...values };
  }
  const result = await db.insert(medications).values(values);
  return { id: result[0].insertId, ...values };
}

export async function getMedicationsByRoom(roomId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(medications).where(eq(medications.roomId, roomId));
}

export async function recordMedicationChange(data: InsertMedicationChange) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(medicationChanges).values(data).onDuplicateKeyUpdate({
    set: { eventId: data.eventId },
  });
  const rows = await db.select().from(medicationChanges)
    .where(eq(medicationChanges.eventId, data.eventId))
    .limit(1);
  return rows[0];
}

export async function getMedicationChangesByRoom(roomId: number, limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(medicationChanges)
    .where(eq(medicationChanges.roomId, roomId))
    .orderBy(desc(medicationChanges.changedAt), desc(medicationChanges.id))
    .limit(limit);
}

export async function deleteMedication(id: number, roomId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(medications)
    .where(and(eq(medications.id, id), eq(medications.roomId, roomId)));
}

// ─── Room Management ────────────────────────────────────────────────────────────────────

/** Remove a member from a room (leave or kick) */
export async function removeFamilyMember(roomId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(familyMembers)
    .where(and(eq(familyMembers.roomId, roomId), eq(familyMembers.userId, userId)));
}

/** Delete a family room and all associated data (creator only) */
export async function deleteFamilyRoom(roomId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Cascade delete all room data
  await db.delete(familyMembers).where(eq(familyMembers.roomId, roomId));
  await db.delete(elderProfiles).where(eq(elderProfiles.roomId, roomId));
  await db.delete(checkIns).where(eq(checkIns.roomId, roomId));
  await db.delete(diaryReads).where(eq(diaryReads.roomId, roomId));
  await db.delete(diaryComments).where(eq(diaryComments.roomId, roomId));
  await db.delete(diaryEntries).where(eq(diaryEntries.roomId, roomId));
  await db.delete(announcements).where(eq(announcements.roomId, roomId));
  await db.delete(briefings).where(eq(briefings.roomId, roomId));
  await db.delete(medicationChanges).where(eq(medicationChanges.roomId, roomId));
  await db.delete(medications).where(eq(medications.roomId, roomId));
  await db.delete(familyRooms).where(eq(familyRooms.id, roomId));
}

/** Delete a single announcement */
export async function deleteAnnouncement(announcementId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(announcements).where(eq(announcements.id, announcementId));
}

/** Toggle reaction on an announcement (add if not present, remove if present) */
export async function toggleReaction(announcementId: number, memberId: number, memberName: string, memberEmoji: string, emoji: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.select().from(announcements).where(eq(announcements.id, announcementId)).limit(1);
  if (rows.length === 0) throw new Error("公告不存在");
  const current: any[] = (rows[0].reactions as any[]) ?? [];
  let group = current.find((r: any) => r.emoji === emoji);
  if (!group) {
    group = { emoji, members: [] };
    current.push(group);
  }
  const memberIdStr = String(memberId);
  const hasMe = group.members.some((m: any) => m.memberId === memberIdStr);
  if (hasMe) {
    group.members = group.members.filter((m: any) => m.memberId !== memberIdStr);
    if (group.members.length === 0) {
      const idx = current.indexOf(group);
      current.splice(idx, 1);
    }
  } else {
    group.members.push({ memberId: memberIdStr, memberName, memberEmoji });
  }
  await db.update(announcements).set({ reactions: current }).where(eq(announcements.id, announcementId));
  return current;
}
