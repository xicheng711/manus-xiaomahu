/**
 * 小马虎 Family Router — Cloud sync API for family sharing
 * Handles family rooms, members, check-ins, diary, announcements, briefings, medications
 */

import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import {
  createFamilyRoom, getFamilyRoomByCode, getFamilyRoomById, getUserFamilyRooms,
  addFamilyMember, getRoomMembers, getMemberByUserId,
  upsertElderProfile, getElderProfile,
  upsertCheckIn, getCheckInsByRoom, getCheckInByDate,
  createDiaryEntry, updateDiaryEntry, getDiaryEntriesByRoom,
  createAnnouncement, getAnnouncementsByRoom, addReaction,
  createBriefing, getBriefingsByRoom, getBriefingByDate,
  upsertMedication, getMedicationsByRoom, deleteMedication,
} from "./family-db";

// Helper: get current user ID from context, throw if not logged in
function requireUser(ctx: any): { userId: number; openId: string } {
  if (!ctx.user?.id) throw new Error("请先登录");
  return { userId: ctx.user.id, openId: ctx.user.openId };
}

// Helper: verify user is member of room
async function requireRoomMember(userId: number, roomId: number) {
  const member = await getMemberByUserId(roomId, userId);
  if (!member) throw new Error("您不是该家庭的成员");
  return member;
}

export const familyRouter = router({

  // ─── Room Management ─────────────────────────────────────────────────────

  /** Create a new family room (called after onboarding by creator) */
  createRoom: publicProcedure
    .input(z.object({
      roomCode: z.string().min(4).max(10),
      elderName: z.string(),
      elderEmoji: z.string().optional(),
      elderPhotoUri: z.string().optional(),
      // Creator member info
      memberName: z.string(),
      memberRole: z.enum(["caregiver", "family", "nurse"]),
      memberRoleLabel: z.string(),
      memberEmoji: z.string(),
      memberColor: z.string(),
      memberPhotoUri: z.string().optional(),
      // Elder profile
      elderProfile: z.object({
        name: z.string(),
        nickname: z.string(),
        birthDate: z.string().optional(),
        zodiacEmoji: z.string().optional(),
        zodiacName: z.string().optional(),
        elderPhotoUri: z.string().optional(),
        elderAvatarType: z.string().optional(),
        city: z.string().optional(),
        reminderMorning: z.string().optional(),
        reminderEvening: z.string().optional(),
        careNeeds: z.any().optional(),
      }).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { userId } = requireUser(ctx);

      // Create the room
      const room = await createFamilyRoom({
        roomCode: input.roomCode,
        elderName: input.elderName,
        elderEmoji: input.elderEmoji ?? null,
        elderPhotoUri: input.elderPhotoUri ?? null,
        creatorUserId: userId,
      });

      // Add creator as first member
      const member = await addFamilyMember({
        roomId: room.id!,
        userId,
        name: input.memberName,
        role: input.memberRole,
        roleLabel: input.memberRoleLabel,
        emoji: input.memberEmoji,
        color: input.memberColor,
        photoUri: input.memberPhotoUri ?? null,
        isCreator: true,
      });

      // Save elder profile if provided
      if (input.elderProfile) {
        await upsertElderProfile({
          roomId: room.id!,
          name: input.elderProfile.name,
          nickname: input.elderProfile.nickname,
          birthDate: input.elderProfile.birthDate ?? null,
          zodiacEmoji: input.elderProfile.zodiacEmoji ?? null,
          zodiacName: input.elderProfile.zodiacName ?? null,
          elderPhotoUri: input.elderProfile.elderPhotoUri ?? null,
          elderAvatarType: input.elderProfile.elderAvatarType ?? null,
          city: input.elderProfile.city ?? null,
          reminderMorning: input.elderProfile.reminderMorning ?? null,
          reminderEvening: input.elderProfile.reminderEvening ?? null,
          careNeeds: input.elderProfile.careNeeds ?? null,
        });
      }

      return { success: true, roomId: room.id, roomCode: input.roomCode, memberId: member.id };
    }),

  /** Join an existing family room by invite code */
  joinRoom: publicProcedure
    .input(z.object({
      roomCode: z.string().min(4).max(10),
      memberName: z.string(),
      memberRole: z.enum(["caregiver", "family", "nurse"]).default("family"),
      memberRoleLabel: z.string(),
      memberEmoji: z.string(),
      memberColor: z.string(),
      memberPhotoUri: z.string().optional(),
      relationship: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { userId } = requireUser(ctx);

      const room = await getFamilyRoomByCode(input.roomCode);
      if (!room) throw new Error("未找到该家庭房间，请检查邀请码");

      const member = await addFamilyMember({
        roomId: room.id,
        userId,
        name: input.memberName,
        role: input.memberRole,
        roleLabel: input.memberRoleLabel,
        emoji: input.memberEmoji,
        color: input.memberColor,
        photoUri: input.memberPhotoUri ?? null,
        relationship: input.relationship ?? null,
        isCreator: false,
      });

      return {
        success: true,
        roomId: room.id,
        roomCode: room.roomCode,
        elderName: room.elderName,
        memberId: member.id,
      };
    }),

  /** Look up a room by invite code (for preview before joining) */
  lookupRoom: publicProcedure
    .input(z.object({ roomCode: z.string() }))
    .query(async ({ input }) => {
      const room = await getFamilyRoomByCode(input.roomCode);
      if (!room) return null;
      const members = await getRoomMembers(room.id);
      return {
        elderName: room.elderName,
        elderEmoji: room.elderEmoji,
        memberCount: members.length,
      };
    }),

  /** Get all family rooms the current user belongs to */
  myRooms: publicProcedure.query(async ({ ctx }) => {
    const { userId } = requireUser(ctx);
    const rooms = await getUserFamilyRooms(userId);
    return rooms.map(({ room, membership }) => ({
      roomId: room.id,
      roomCode: room.roomCode,
      elderName: room.elderName,
      elderEmoji: room.elderEmoji,
      isCreator: membership.isCreator,
      role: membership.role,
      roleLabel: membership.roleLabel,
    }));
  }),

  /** Get full room details including members and elder profile */
  getRoomDetail: publicProcedure
    .input(z.object({ roomId: z.number() }))
    .query(async ({ ctx, input }) => {
      const { userId } = requireUser(ctx);
      await requireRoomMember(userId, input.roomId);

      const room = await getFamilyRoomById(input.roomId);
      const members = await getRoomMembers(input.roomId);
      const profile = await getElderProfile(input.roomId);

      return { room, members, elderProfile: profile };
    }),

  // ─── Check-ins ───────────────────────────────────────────────────────────

  /** Sync a check-in to the cloud (upsert by roomId + date) */
  syncCheckIn: publicProcedure
    .input(z.object({
      roomId: z.number(),
      date: z.string(),
      sleepHours: z.number().optional(),
      sleepQuality: z.enum(["poor", "fair", "good"]).optional(),
      sleepInput: z.any().optional(),
      sleepScore: z.number().optional(),
      sleepProblems: z.any().optional(),
      sleepType: z.string().optional(),
      sleepSegments: z.any().optional(),
      awakeHours: z.number().optional(),
      nightWakings: z.number().optional(),
      daytimeNap: z.boolean().optional(),
      napMinutes: z.number().optional(),
      morningNotes: z.string().optional(),
      morningDone: z.boolean().optional(),
      moodEmoji: z.string().optional(),
      moodScore: z.number().optional(),
      medicationTaken: z.boolean().optional(),
      medicationNotes: z.string().optional(),
      mealNotes: z.string().optional(),
      mealOption: z.string().optional(),
      eveningNotes: z.string().optional(),
      eveningDone: z.boolean().optional(),
      aiMessage: z.string().optional(),
      careScore: z.number().optional(),
      completedAt: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { userId } = requireUser(ctx);
      await requireRoomMember(userId, input.roomId);
      const result = await upsertCheckIn({ ...input, authorUserId: userId });
      return { success: true, checkIn: result };
    }),

  /** Get check-ins for a room (family members can see shared data) */
  getCheckIns: publicProcedure
    .input(z.object({ roomId: z.number(), limit: z.number().default(30) }))
    .query(async ({ ctx, input }) => {
      const { userId } = requireUser(ctx);
      await requireRoomMember(userId, input.roomId);
      return getCheckInsByRoom(input.roomId, input.limit);
    }),

  /** Get a single check-in by date */
  getCheckInByDate: publicProcedure
    .input(z.object({ roomId: z.number(), date: z.string() }))
    .query(async ({ ctx, input }) => {
      const { userId } = requireUser(ctx);
      await requireRoomMember(userId, input.roomId);
      return getCheckInByDate(input.roomId, input.date);
    }),

  // ─── Diary ───────────────────────────────────────────────────────────────

  /** Sync a diary entry to the cloud */
  syncDiary: publicProcedure
    .input(z.object({
      roomId: z.number(),
      serverDiaryId: z.number().optional(),  // if updating existing
      date: z.string(),
      content: z.string(),
      voiceUri: z.string().optional(),
      moodEmoji: z.string().optional(),
      moodLabel: z.string().optional(),
      moodScore: z.number().optional(),
      tags: z.any().optional(),
      caregiverMoodEmoji: z.string().optional(),
      caregiverMoodLabel: z.string().optional(),
      aiReply: z.string().optional(),
      aiEmoji: z.string().optional(),
      aiTip: z.string().optional(),
      conversation: z.any().optional(),
      conversationFinished: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { userId } = requireUser(ctx);
      await requireRoomMember(userId, input.roomId);

      if (input.serverDiaryId) {
        await updateDiaryEntry(input.serverDiaryId, {
          content: input.content,
          moodEmoji: input.moodEmoji ?? null,
          moodLabel: input.moodLabel ?? null,
          moodScore: input.moodScore ?? null,
          tags: input.tags ?? null,
          aiReply: input.aiReply ?? null,
          conversation: input.conversation ?? null,
          conversationFinished: input.conversationFinished ?? false,
        });
        return { success: true, diaryId: input.serverDiaryId };
      }

      const entry = await createDiaryEntry({
        roomId: input.roomId,
        authorUserId: userId,
        date: input.date,
        content: input.content,
        voiceUri: input.voiceUri ?? null,
        moodEmoji: input.moodEmoji ?? null,
        moodLabel: input.moodLabel ?? null,
        moodScore: input.moodScore ?? null,
        tags: input.tags ?? null,
        caregiverMoodEmoji: input.caregiverMoodEmoji ?? null,
        caregiverMoodLabel: input.caregiverMoodLabel ?? null,
        aiReply: input.aiReply ?? null,
        aiEmoji: input.aiEmoji ?? null,
        aiTip: input.aiTip ?? null,
        conversation: input.conversation ?? null,
        conversationFinished: input.conversationFinished ?? false,
      });
      return { success: true, diaryId: entry.id };
    }),

  /** Get diary entries for a room */
  getDiaries: publicProcedure
    .input(z.object({ roomId: z.number(), limit: z.number().default(30) }))
    .query(async ({ ctx, input }) => {
      const { userId } = requireUser(ctx);
      await requireRoomMember(userId, input.roomId);
      return getDiaryEntriesByRoom(input.roomId, input.limit);
    }),

  // ─── Announcements ─────────────────────────────────────────────────────

  /** Post a family announcement / broadcast */
  postAnnouncement: publicProcedure
    .input(z.object({
      roomId: z.number(),
      content: z.string(),
      emoji: z.string().optional(),
      type: z.enum(["news", "visit", "medical", "daily", "reminder"]).default("daily"),
      date: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { userId } = requireUser(ctx);
      const member = await requireRoomMember(userId, input.roomId);

      const announcement = await createAnnouncement({
        roomId: input.roomId,
        authorUserId: userId,
        authorName: member.name,
        authorEmoji: member.emoji,
        authorColor: member.color,
        content: input.content,
        emoji: input.emoji ?? null,
        type: input.type,
        date: input.date,
      });
      return { success: true, announcement };
    }),

  /** Get announcements for a room */
  getAnnouncements: publicProcedure
    .input(z.object({ roomId: z.number(), limit: z.number().default(50) }))
    .query(async ({ ctx, input }) => {
      const { userId } = requireUser(ctx);
      await requireRoomMember(userId, input.roomId);
      return getAnnouncementsByRoom(input.roomId, input.limit);
    }),

  /** React to an announcement */
  reactToAnnouncement: publicProcedure
    .input(z.object({
      announcementId: z.number(),
      roomId: z.number(),
      emoji: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { userId } = requireUser(ctx);
      const member = await requireRoomMember(userId, input.roomId);
      // Fetch current reactions, add new one
      const announceList = await getAnnouncementsByRoom(input.roomId, 100);
      const target = announceList.find(a => a.id === input.announcementId);
      if (!target) throw new Error("公告不存在");

      const currentReactions: any[] = (target.reactions as any[]) ?? [];
      // Find or create reaction group for this emoji
      let group = currentReactions.find((r: any) => r.emoji === input.emoji);
      if (!group) {
        group = { emoji: input.emoji, members: [] };
        currentReactions.push(group);
      }
      // Add member if not already reacted
      if (!group.members.find((m: any) => m.memberId === String(member.id))) {
        group.members.push({
          memberId: String(member.id),
          memberName: member.name,
          memberEmoji: member.emoji,
        });
      }
      await addReaction(input.announcementId, currentReactions);
      return { success: true };
    }),

  // ─── Briefings ─────────────────────────────────────────────────────────

  /** Save a generated briefing to the cloud */
  saveBriefing: publicProcedure
    .input(z.object({
      roomId: z.number(),
      date: z.string(),
      careScore: z.number().optional(),
      summary: z.string().optional(),
      encouragement: z.string().optional(),
      highlights: z.any().optional(),
      attention: z.string().optional(),
      shareText: z.string().optional(),
      generatedAt: z.string().optional(),
      checkInDate: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { userId } = requireUser(ctx);
      await requireRoomMember(userId, input.roomId);
      const briefing = await createBriefing({
        roomId: input.roomId,
        date: input.date,
        careScore: input.careScore ?? null,
        summary: input.summary ?? null,
        encouragement: input.encouragement ?? null,
        highlights: input.highlights ?? null,
        attention: input.attention ?? null,
        shareText: input.shareText ?? null,
        generatedAt: input.generatedAt ?? null,
        checkInDate: input.checkInDate ?? null,
      });
      return { success: true, briefing };
    }),

  /** Get briefings for a room (family members can view) */
  getBriefings: publicProcedure
    .input(z.object({ roomId: z.number(), limit: z.number().default(14) }))
    .query(async ({ ctx, input }) => {
      const { userId } = requireUser(ctx);
      await requireRoomMember(userId, input.roomId);
      return getBriefingsByRoom(input.roomId, input.limit);
    }),

  // ─── Medications ───────────────────────────────────────────────────────

  /** Sync medications to the cloud */
  syncMedication: publicProcedure
    .input(z.object({
      roomId: z.number(),
      serverMedId: z.number().optional(),
      name: z.string(),
      dosage: z.string().optional(),
      frequency: z.string().optional(),
      times: z.any().optional(),
      notes: z.string().optional(),
      icon: z.string().optional(),
      active: z.boolean().default(true),
      reminderEnabled: z.boolean().optional(),
      color: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { userId } = requireUser(ctx);
      await requireRoomMember(userId, input.roomId);
      const med = await upsertMedication({
        id: input.serverMedId,
        roomId: input.roomId,
        name: input.name,
        dosage: input.dosage ?? null,
        frequency: input.frequency ?? null,
        times: input.times ?? null,
        notes: input.notes ?? null,
        icon: input.icon ?? null,
        active: input.active,
        reminderEnabled: input.reminderEnabled ?? true,
        color: input.color ?? null,
      });
      return { success: true, medication: med };
    }),

  /** Get medications for a room */
  getMedications: publicProcedure
    .input(z.object({ roomId: z.number() }))
    .query(async ({ ctx, input }) => {
      const { userId } = requireUser(ctx);
      await requireRoomMember(userId, input.roomId);
      return getMedicationsByRoom(input.roomId);
    }),

  /** Delete a medication */
  deleteMedication: publicProcedure
    .input(z.object({ roomId: z.number(), medicationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { userId } = requireUser(ctx);
      await requireRoomMember(userId, input.roomId);
      await deleteMedication(input.medicationId);
      return { success: true };
    }),

  // ─── Elder Profile ─────────────────────────────────────────────────────

  /** Update elder profile (creator only) */
  updateElderProfile: publicProcedure
    .input(z.object({
      roomId: z.number(),
      name: z.string().optional(),
      nickname: z.string().optional(),
      birthDate: z.string().optional(),
      zodiacEmoji: z.string().optional(),
      zodiacName: z.string().optional(),
      elderPhotoUri: z.string().optional(),
      elderAvatarType: z.string().optional(),
      city: z.string().optional(),
      reminderMorning: z.string().optional(),
      reminderEvening: z.string().optional(),
      careNeeds: z.any().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { userId } = requireUser(ctx);
      const member = await requireRoomMember(userId, input.roomId);
      if (!member.isCreator) throw new Error("只有创建者可以修改老人档案");
      const profile = await upsertElderProfile({
        roomId: input.roomId,
        name: input.name ?? "",
        nickname: input.nickname ?? "",
        birthDate: input.birthDate ?? null,
        zodiacEmoji: input.zodiacEmoji ?? null,
        zodiacName: input.zodiacName ?? null,
        elderPhotoUri: input.elderPhotoUri ?? null,
        elderAvatarType: input.elderAvatarType ?? null,
        city: input.city ?? null,
        reminderMorning: input.reminderMorning ?? null,
        reminderEvening: input.reminderEvening ?? null,
        careNeeds: input.careNeeds ?? null,
      });
      return { success: true, profile };
    }),

  /** Get elder profile (any family member) */
  getElderProfile: publicProcedure
    .input(z.object({ roomId: z.number() }))
    .query(async ({ ctx, input }) => {
      const { userId } = requireUser(ctx);
      await requireRoomMember(userId, input.roomId);
      return getElderProfile(input.roomId);
    }),
});
