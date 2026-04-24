/**
 * 小马虎 Family Router — Cloud sync API for family sharing
 * Handles family rooms, members, check-ins, diary, announcements, briefings, medications
 */

import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import {
  createFamilyRoom, getFamilyRoomByCode, getFamilyRoomById, getUserFamilyRooms,
  addFamilyMember, getRoomMembers, getMemberByUserId,
  removeFamilyMember, deleteFamilyRoom,
  upsertElderProfile, getElderProfile,
  upsertCheckIn, getCheckInsByRoom, getCheckInByDate,
  createDiaryEntry, updateDiaryEntry, getDiaryEntriesByRoom,
  createAnnouncement, getAnnouncementsByRoom,
  deleteAnnouncement, toggleReaction,
  createBriefing, getBriefingsByRoom, getBriefingByDate,
  upsertMedication, getMedicationsByRoom, deleteMedication,
} from "./family-db";
import { updatePushToken, getUsersByIds } from "./db";

// ─── Expo Push Notification Helper ──────────────────────────────────────────

async function sendExpoPushNotifications(
  pushTokens: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>,
) {
  const validTokens = pushTokens.filter(t => t && t.startsWith('ExponentPushToken['));
  if (validTokens.length === 0) return;
  try {
    const messages = validTokens.map(to => ({
      to,
      title,
      body,
      sound: 'default' as const,
      data: data ?? {},
    }));
    const resp = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(messages ),
    });
    const result = await resp.json();
    console.log('[Push] Sent to', validTokens.length, 'devices:', JSON.stringify(result?.data?.slice(0,2)));
  } catch (e) {
    console.warn('[Push] Failed to send push notifications:', e);
  }
}

// Helper: verify user is member of room
async function requireRoomMember(userId: number, roomId: number) {
  const member = await getMemberByUserId(roomId, userId);
  if (!member) throw new Error("您不是该家庭的成员");
  return member;
}

/**
 * Unified push notification helper.
 * Fetches all room members, excludes the actor, looks up their push tokens,
 * and sends a push notification. All errors are swallowed (non-fatal).
 *
 * @param roomId     - The family room to notify
 * @param actorUserId - The user who triggered the event (excluded from recipients)
 * @param title      - Push notification title
 * @param body       - Push notification body
 * @param data       - Optional payload forwarded to the app
 * @param tag        - Short tag for log messages (e.g. 'syncCheckIn')
 */
async function notifyRoomMembers(
  roomId: number,
  actorUserId: number,
  title: string,
  body: string,
  data?: Record<string, unknown>,
  tag = 'notifyRoomMembers',
): Promise<void> {
  try {
    const allMembers = await getRoomMembers(roomId);
    const otherUserIds = allMembers
      .filter(m => m.userId !== actorUserId)
      .map(m => m.userId);
    if (otherUserIds.length === 0) return;
    const otherUsers = await getUsersByIds(otherUserIds);
    const pushTokens = otherUsers
      .map(u => u.pushToken)
      .filter((t): t is string => !!t);
    if (pushTokens.length > 0) {
      await sendExpoPushNotifications(pushTokens, title, body, data);
    }
  } catch (e) {
    console.warn(`[${tag}] Push notification failed (non-fatal):`, e);
  }
}

export const familyRouter = router({

  // ─── Room Management ─────────────────────────────────────────────────────

  /** Create a new family room (called after onboarding by creator) */
  createRoom: protectedProcedure
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
      const userId = ctx.user.id;
      // 硬限制：一个用户最多只能是一个家庭的 creator
      const existingRooms = await getUserFamilyRooms(userId);
      const alreadyCreator = existingRooms.some(r => r.membership.isCreator);
      if (alreadyCreator) {
        throw new Error('您已经是一个家庭的主照顾者了，每位用户只能创建一个家庭档案');
      }

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
  joinRoom: protectedProcedure
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
      const userId = ctx.user.id;

      const room = await getFamilyRoomByCode(input.roomCode);
      if (!room) throw new Error("未找到该家庭房间，请检查邀请码");
      const existingMember = await requireRoomMember(userId, room.id).catch(() => null);
      if (existingMember) {
        if (existingMember.isCreator) throw new Error("您是这个家庭的主照顾者，无法以家庭成员身份加入");
        throw new Error("您已经在这个家庭中了，无需重复加入");
      }

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

      // Notify all existing members that someone new joined
      await notifyRoomMembers(
        room.id,
        userId,
        `🎉 新成员加入了！`,
        `${input.memberEmoji} ${input.memberName} 加入了你们的家庭空间`,
        { type: 'new_member', screen: 'family', memberName: input.memberName },
        'joinRoom',
      );

      return {
        roomId: room.id,
        roomCode: room?.roomCode,
        elderName: room.elderName,
        memberId: member.id,
      };
    }),
  lookupRoom: publicProcedure
    .input(z.object({ roomCode: z.string() }))
    .query(async ({ input }) => {
      const room = await getFamilyRoomByCode(input.roomCode);
      if (!room) return null;
      const members = await getRoomMembers(room.id);
        // Top-level fields kept for backward compat with older clients
      return {
        elderEmoji: room.elderEmoji,
        elderName: room.elderName,
        memberCount: members.length,
        // Structured room object for newer clients
        room: {
          id: room.id,
          roomCode: room?.roomCode,
          elderName: room.elderName,
          elderEmoji: room.elderEmoji,
          elderPhotoUri: room.elderPhotoUri,
          createdAt: room.createdAt,
        },
      };
    }),

  /** Get all family rooms the current user belongs to */
  myRooms: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;
    const rooms = await getUserFamilyRooms(userId);
    return rooms.map(({ room, membership }) => ({
      roomId: room.id,
      roomCode: room?.roomCode,
      elderName: room.elderName,
      elderEmoji: room.elderEmoji,
      isCreator: membership.isCreator,
      role: membership.role,
      roleLabel: membership.roleLabel,
    }));
  }),

  /** Get full room details including members and elder profile */
  getRoomDetail: protectedProcedure
    .input(z.object({ roomId: z.number() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      await requireRoomMember(userId, input.roomId);

      const room = await getFamilyRoomById(input.roomId);
      const members = await getRoomMembers(input.roomId);
      const profile = await getElderProfile(input.roomId);

      return { room, members, elderProfile: profile };
    }),

  // ─── Check-ins ───────────────────────────────────────────────────────────

  /** Sync a check-in to the cloud (upsert by roomId + date) */
  syncCheckIn: protectedProcedure
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
      const userId = ctx.user.id;
      await requireRoomMember(userId, input.roomId);
      const result = await upsertCheckIn({ ...input, authorUserId: userId });

      // Notify family members about the check-in
      const actorMember = (await getRoomMembers(input.roomId)).find(m => m.userId === userId);
      const period = input.morningDone ? '早间' : '晚间';
      await notifyRoomMembers(
        input.roomId,
        userId,
        `✅ ${actorMember?.name || '照顾者'}完成了${period}打卡`,
        input.morningNotes || input.eveningNotes || '点击查看今日照护记录',
        { type: 'checkin', screen: 'home' },
        'syncCheckIn',
      );

      return { success: true, checkIn: result };
    }),

  /** Get check-ins for a room (family members can see shared data) */
  getCheckIns: protectedProcedure
    .input(z.object({ roomId: z.number(), limit: z.number().default(30) }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      await requireRoomMember(userId, input.roomId);
      return getCheckInsByRoom(input.roomId, input.limit);
    }),

  /** Get a single check-in by date */
  getCheckInByDate: protectedProcedure
    .input(z.object({ roomId: z.number(), date: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      await requireRoomMember(userId, input.roomId);
      return getCheckInByDate(input.roomId, input.date);
    }),

  // ─── Diary ───────────────────────────────────────────────────────────────

  /** Sync a diary entry to the cloud */
  syncDiary: protectedProcedure
    .input(z.object({
      roomId: z.number(),
      serverDiaryId: z.number().optional(),  // if updating existing
      date: z.string(),
      content: z.string(),
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
      const userId = ctx.user.id;
      await requireRoomMember(userId, input.roomId);

      if (input.serverDiaryId) {
        await updateDiaryEntry(input.serverDiaryId, {
          content: input.content,
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
        return { success: true, diaryId: input.serverDiaryId };
      }

      const entry = await createDiaryEntry({
        roomId: input.roomId,
        authorUserId: userId,
        date: input.date,
        content: input.content,
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

      // Notify family members about the new diary entry
      const diaryActorMember = (await getRoomMembers(input.roomId)).find(m => m.userId === userId);
      const diaryPreview = input.content.length > 40 ? input.content.slice(0, 40) + '...' : input.content;
      await notifyRoomMembers(
        input.roomId,
        userId,
        `📖 ${diaryActorMember?.name || '照顾者'}写了一篇日记`,
        diaryPreview,
        { type: 'diary', screen: 'diary' },
        'syncDiary',
      );

      return { success: true, diaryId: entry.id };
    }),

  /** Get diary entries for a room */
  getDiaries: protectedProcedure
    .input(z.object({ roomId: z.number(), limit: z.number().default(30) }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      await requireRoomMember(userId, input.roomId);
      return getDiaryEntriesByRoom(input.roomId, input.limit);
    }),

  // ─── Announcements ─────────────────────────────────────────────────────

  /** Post a family announcement / broadcast */
  postAnnouncement: protectedProcedure
    .input(z.object({
      roomId: z.number(),
      content: z.string(),
      emoji: z.string().optional(),
      type: z.enum(["news", "visit", "medical", "daily", "reminder"]).default("daily"),
      date: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
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

      // Notify all other family members about the new announcement
      const announcementPreview = input.content.length > 50 ? input.content.slice(0, 50) + '...' : input.content;
      await notifyRoomMembers(
        input.roomId,
        userId,
        `${member.emoji} ${member.name} 发布了家庭公告`,
        announcementPreview,
        { type: 'announcement', screen: 'family' },
        'postAnnouncement',
      );

      return { success: true, announcement };
    }),

  /** Get announcements for a room */
  getAnnouncements: protectedProcedure
    .input(z.object({ roomId: z.number(), limit: z.number().default(50) }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      await requireRoomMember(userId, input.roomId);
      return getAnnouncementsByRoom(input.roomId, input.limit);
    }),

  // ─── Briefings ─────────────────────────────────────────────────────────

  /** Save a generated briefing to the cloud */
  saveBriefing: protectedProcedure
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
      const userId = ctx.user.id;
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
  getBriefings: protectedProcedure
    .input(z.object({ roomId: z.number(), limit: z.number().default(14) }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      await requireRoomMember(userId, input.roomId);
      return getBriefingsByRoom(input.roomId, input.limit);
    }),

  // ─── Medications ───────────────────────────────────────────────────────

  /** Sync medications to the cloud */
  syncMedication: protectedProcedure
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
      const userId = ctx.user.id;
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
  getMedications: protectedProcedure
    .input(z.object({ roomId: z.number() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      await requireRoomMember(userId, input.roomId);
      return getMedicationsByRoom(input.roomId);
    }),

  /** Delete a medication */
  deleteMedication: protectedProcedure
    .input(z.object({ roomId: z.number(), medicationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      await requireRoomMember(userId, input.roomId);
      await deleteMedication(input.medicationId);
      return { success: true };
    }),

  // ─── Elder Profile ─────────────────────────────────────────────────────

  /** Update elder profile (creator only) */
  updateElderProfile: protectedProcedure
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
      const userId = ctx.user.id;
      const member = await requireRoomMember(userId, input.roomId);
      if (!member.isCreator) throw new Error("只有创建者可以修改老人档案");
      // Read-then-merge: fetch existing profile first so partial updates
      // (e.g. only changing reminderMorning) never overwrite other fields with empty strings.
      const existing = await getElderProfile(input.roomId);
      const profile = await upsertElderProfile({
        roomId: input.roomId,
        name: input.name ?? existing?.name ?? "",
        nickname: input.nickname ?? existing?.nickname ?? "",
        birthDate: input.birthDate ?? existing?.birthDate ?? null,
        zodiacEmoji: input.zodiacEmoji ?? existing?.zodiacEmoji ?? null,
        zodiacName: input.zodiacName ?? existing?.zodiacName ?? null,
        elderPhotoUri: input.elderPhotoUri ?? existing?.elderPhotoUri ?? null,
        elderAvatarType: input.elderAvatarType ?? existing?.elderAvatarType ?? null,
        city: input.city ?? existing?.city ?? null,
        reminderMorning: input.reminderMorning ?? existing?.reminderMorning ?? null,
        reminderEvening: input.reminderEvening ?? existing?.reminderEvening ?? null,
        careNeeds: input.careNeeds ?? existing?.careNeeds ?? null,
      });
      return { success: true, profile };
    }),

  /** Get elder profile (any family member) */
  getElderProfile: protectedProcedure
    .input(z.object({ roomId: z.number() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      await requireRoomMember(userId, input.roomId);
      return getElderProfile(input.roomId);
    }),

  /** Leave a family room (joiner) */
  leaveRoom: protectedProcedure
    .input(z.object({ roomId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      await requireRoomMember(userId, input.roomId);
      await removeFamilyMember(input.roomId, userId);
      return { success: true };
    }),

  /** Delete a family room and all its data (creator only) */
  deleteRoom: protectedProcedure
    .input(z.object({ roomId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const member = await requireRoomMember(userId, input.roomId);
      if (!member.isCreator) throw new Error("只有创建者可以解散家庭");
      await deleteFamilyRoom(input.roomId);
      return { success: true };
    }),

  /** Delete an announcement (creator or original author) */
  deleteAnnouncement: protectedProcedure
    .input(z.object({ announcementId: z.number(), roomId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const member = await requireRoomMember(userId, input.roomId);
      // Allow creator or the announcement author to delete
      const announceList = await getAnnouncementsByRoom(input.roomId, 200);
      const target = announceList.find(a => a.id === input.announcementId);
      if (!target) throw new Error("公告不存在");
      if (!member.isCreator && target.authorUserId !== userId) {
        throw new Error("无权删除此公告");
      }
      await deleteAnnouncement(input.announcementId);
      return { success: true };
    }),

  /** Toggle reaction on an announcement (add if not present, remove if present) */
  toggleReaction: protectedProcedure
    .input(z.object({
      announcementId: z.number(),
      roomId: z.number(),
      emoji: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const member = await requireRoomMember(userId, input.roomId);
      const reactions = await toggleReaction(
        input.announcementId,
        member.id,
        member.name,
        member.emoji,
        input.emoji,
      );
      return { success: true, reactions };
    }),

  /** Register or update the Expo push token for the current user */
  updatePushToken: protectedProcedure
    .input(z.object({ pushToken: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      await updatePushToken(userId, input.pushToken);
      return { success: true };
    }),
});
