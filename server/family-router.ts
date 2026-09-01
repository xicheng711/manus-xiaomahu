/**
 * 小马虎 Family Router — Cloud sync API for family sharing
 * Handles family rooms, members, check-ins, diary, announcements, briefings, medications
 */

import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import {
  createFamilyRoom, getFamilyRoomByCode, getFamilyRoomById, getUserFamilyRooms, updateFamilyRoom,
  addFamilyMember, getRoomMembers, getMemberByUserId, updateFamilyMember,
  removeFamilyMember, deleteFamilyRoom,
  upsertElderProfile, getElderProfile,
  upsertCheckIn, getCheckInsByRoom, getCheckInByDate,
  createDiaryEntry, updateDiaryEntry, deleteDiaryEntryById, getDiaryEntriesByRoom,
  getDiaryEntryByClientId, getDiaryEntryForInteraction, markDiaryRead, getDiaryInteractions, addDiaryComment,
  deleteDiaryCommentByAuthor, getDiaryInteractionSummaries,
  createAnnouncement, getAnnouncementByClientId, getAnnouncementsByRoom, getAnnouncementById,
  getAnnouncementComments, addAnnouncementComment, deleteAnnouncementCommentByAuthor,
  deleteAnnouncement, toggleReaction,
  createBriefing, getBriefingsByRoom, getBriefingByDate,
  upsertMedication, getMedicationsByRoom, deleteMedication,
  recordMedicationChange, getMedicationChangesByRoom,
} from "./family-db";
import { updatePushToken, getUsersByIds } from "./db";
import { ossUploadAvatar, storagePut } from "./storage";

// ─── Expo Push Notification Helper ──────────────────────────────────────────

async function sendExpoPushNotifications(
  pushTokens: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>,
) {
  console.log('[Push] Received tokens:', pushTokens.length, 'raw, filtering...');
  const validTokens = pushTokens.filter(t => t && (t.startsWith('ExponentPushToken[') || t.startsWith('ExpoPushToken[')));
  console.log('[Push] Valid tokens after filter:', validTokens.length);
  if (validTokens.length === 0) {
    console.warn('[Push] No valid Expo push tokens found. Raw tokens:', pushTokens.map(t => t ? t.slice(0, 20) + '...' : 'null'));
    return;
  }
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
      body: JSON.stringify(messages),
      // 推送是发布后的附加动作，不能因外部 Expo 服务长时间无响应而让日记保存一直卡住。
      signal: AbortSignal.timeout(8_000),
    });
    const result = await resp.json();
    console.log('[Push] Expo API response status:', resp.status);
    console.log('[Push] Sent to', validTokens.length, 'devices:', JSON.stringify(result?.data));
    // 检查每个 token 的发送结果
    if (result?.data) {
      result.data.forEach((item: any, i: number) => {
        if (item.status === 'error') {
          console.warn(`[Push] Token[${i}] error: ${item.message} (${item.details?.error})`);
        }
      });
    }
  } catch (e) {
    console.warn('[Push] Failed to send push notifications:', e);
  }
}

// ─── Diary notification dedup cache ────────────────────────────────────────
// Prevents duplicate push notifications when the client sends two concurrent
// syncDiary requests with conversationFinished:true (e.g. double-tap on
// "End & Save" or a race between handleSubmit's wait-loop and handleEndAndSave).
const _diaryNotifiedAt = new Map<number, number>(); // serverDiaryId → timestamp
const DIARY_NOTIFY_DEDUP_MS = 10_000; // 10 seconds

function shouldSendDiaryNotification(serverDiaryId: number | undefined): boolean {
  if (!serverDiaryId) return true; // new entry (no id yet) — always allow
  const last = _diaryNotifiedAt.get(serverDiaryId);
  const now = Date.now();
  if (last && now - last < DIARY_NOTIFY_DEDUP_MS) return false; // dedup
  _diaryNotifiedAt.set(serverDiaryId, now);
  // Clean up old entries to avoid memory leak
  if (_diaryNotifiedAt.size > 500) {
    for (const [k, v] of _diaryNotifiedAt) {
      if (now - v > DIARY_NOTIFY_DEDUP_MS * 6) _diaryNotifiedAt.delete(k);
    }
  }
  return true;
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
      memberBirthYear: z.number().optional(),
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
        birthYear: input.memberBirthYear ?? null,
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
      memberBirthYear: z.number().optional(),
      relationship: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      const room = await getFamilyRoomByCode(input.roomCode);
      if (!room) throw new Error("未找到该家庭房间，请检查邀请码");

      // 服务器端校验：Joiner 最多加入 3 个家庭
      const allRooms = await getUserFamilyRooms(userId);
      const joinedRooms = allRooms.filter(r => !r.membership.isCreator);
      if (joinedRooms.length >= 3) {
        throw new Error('您最多只能加入 3 个家庭，请先退出一个家庭后再加入新家庭');
      }

      const existingMember = await requireRoomMember(userId, room.id).catch(() => null);
      if (existingMember) {
        if (existingMember.isCreator) throw new Error("您是这个家庭的主照顾者，无法以家庭成员身份加入");
        // 用户已经是成员（可能是重新设置后重新加入）：幂等返回已有数据，不报错
        console.log(`[joinRoom] User ${userId} already member of room ${room.id}, returning existing member`);
        return {
          success: true,
          roomId: room.id,
          roomCode: room.roomCode,
          elderName: room.elderName,
          memberId: existingMember.id,
          alreadyMember: true,
        };
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
        birthYear: input.memberBirthYear ?? null,
        relationship: input.relationship ?? null,
        isCreator: false,
      });

      // Notify all existing members that someone new joined
      await notifyRoomMembers(
        room.id,
        userId,
        `🎉 ${input.memberName}加入了家庭！`,
        `${input.memberEmoji} ${input.memberName} 现在也能看到大家的照护记录了，一起加油吧 💕`,
        { type: 'new_member', screen: 'family', memberName: input.memberName, roomId: room.id },
        'joinRoom',
      );

      return {
        success: true,
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
      elderPhotoUri: room.elderPhotoUri,
      isCreator: membership.isCreator,
      role: membership.role,
      roleLabel: membership.roleLabel,
      memberEmoji: membership.emoji,
      memberPhotoUri: membership.photoUri,
      myMemberId: membership.id,  // the current user's member row ID in this room
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
      const member = await requireRoomMember(userId, input.roomId);
      if (!member.isCreator) throw new Error("只有主照顾者可以新增或修改打卡记录");
      const previous = await getCheckInByDate(input.roomId, input.date);
      // completedAt is generated on every local save. A delayed morning request must not
      // arrive after a completed evening save and replace the newer full-day snapshot.
      if (previous?.completedAt && input.completedAt && input.completedAt < previous.completedAt) {
        return { success: true, checkIn: previous, staleIgnored: true };
      }
      const safeInput = { ...input };
      // Completion is monotonic. Older clients may send defaults for the other phase;
      // preserve an already completed phase unless this snapshot also completed it.
      if (previous?.morningDone === true && input.morningDone !== true) {
        Object.assign(safeInput, {
          sleepHours: previous.sleepHours ?? undefined,
          sleepQuality: previous.sleepQuality ?? undefined,
          sleepInput: previous.sleepInput ?? undefined,
          sleepScore: previous.sleepScore ?? undefined,
          sleepProblems: previous.sleepProblems ?? undefined,
          sleepType: previous.sleepType ?? undefined,
          sleepSegments: previous.sleepSegments ?? undefined,
          awakeHours: previous.awakeHours ?? undefined,
          nightWakings: previous.nightWakings ?? undefined,
          morningNotes: previous.morningNotes ?? undefined,
          morningDone: true,
        });
      }
      if (previous?.eveningDone === true && input.eveningDone !== true) {
        Object.assign(safeInput, {
          daytimeNap: previous.daytimeNap ?? undefined,
          napMinutes: previous.napMinutes ?? undefined,
          moodEmoji: previous.moodEmoji ?? undefined,
          moodScore: previous.moodScore ?? undefined,
          medicationTaken: previous.medicationTaken ?? undefined,
          medicationNotes: previous.medicationNotes ?? undefined,
          mealNotes: previous.mealNotes ?? undefined,
          mealOption: previous.mealOption ?? undefined,
          eveningNotes: previous.eveningNotes ?? undefined,
          eveningDone: true,
          aiMessage: previous.aiMessage ?? undefined,
          careScore: previous.careScore ?? undefined,
        });
      }
      const result = await upsertCheckIn({ ...safeInput, authorUserId: userId });

      // 只在完成状态首次 false→true 时通知。断网重试或资料补写不会重复打扰家人。
      const newlyFinishedEvening = safeInput.eveningDone === true && previous?.eveningDone !== true;
      const newlyFinishedMorning = safeInput.morningDone === true && previous?.morningDone !== true;
      if (newlyFinishedEvening || newlyFinishedMorning) {
        const actorMember = (await getRoomMembers(input.roomId)).find(m => m.userId === userId);
        const period = newlyFinishedEvening ? '晚间' : '早间';
        await notifyRoomMembers(
          input.roomId,
          userId,
          `${actorMember?.name || '照顾者'}完成了${period}打卡 ✅`,
          (newlyFinishedEvening ? safeInput.eveningNotes : safeInput.morningNotes) || '点击查看今日照护记录，辛苦了！💕',
          { type: 'checkin', screen: 'home', roomId: input.roomId },
          'syncCheckIn',
        );
      }

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
      clientId: z.string().min(1).max(100).optional(), // persisted local draft identity
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
      localTimeStr: z.string().optional(),  // e.g. "14:23" — writer's local time
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      await requireRoomMember(userId, input.roomId);

      // serverDiaryId 可在首次响应丢失或 App 重启后缺失；clientId 可安全找回同一作者的同一篇草稿。
      const recoveredByClientId = !input.serverDiaryId && input.clientId
        ? await getDiaryEntryByClientId(input.roomId, userId, input.clientId)
        : null;
      const resolvedDiaryId = input.serverDiaryId ?? recoveredByClientId?.id;

      if (resolvedDiaryId) {
        const existingEntry = await getDiaryEntryForInteraction(input.roomId, resolvedDiaryId);
        if (!existingEntry) throw new Error("日记不存在或已删除");
        if (existingEntry.authorUserId !== userId) throw new Error("只能修改自己发布的日记");
        // Published diaries are immutable. A response-lost retry may resend the same payload;
        // acknowledge it idempotently without changing the published content or conversation.
        if (existingEntry.conversationFinished === true) {
          return { success: true, diaryId: resolvedDiaryId };
        }
        await updateDiaryEntry(resolvedDiaryId, {
          clientId: input.clientId ?? existingEntry.clientId,
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
          localTimeStr: input.localTimeStr ?? null,
        });
        // 只有服务器状态首次从未发布变为已发布时通知；断网重试和后续幂等更新不重复提醒。
        const newlyPublished = input.conversationFinished === true;
        if (newlyPublished && shouldSendDiaryNotification(resolvedDiaryId)) {
          const diaryActorMember = (await getRoomMembers(input.roomId)).find(m => m.userId === userId);
          const diaryPreview = input.content.length > 40 ? input.content.slice(0, 40) + '...' : input.content;
          await notifyRoomMembers(
            input.roomId,
            userId,
            `${diaryActorMember?.name || '照顾者'}写了一篇日记 📖`,
            diaryPreview || '点击查看完整日记',
            { type: 'diary', screen: 'diary', diaryId: resolvedDiaryId, roomId: input.roomId },
            'syncDiary-update',
          );
        }
        return { success: true, diaryId: resolvedDiaryId };
      }
      const createResult = await createDiaryEntry({
        roomId: input.roomId,
        authorUserId: userId,
        clientId: input.clientId ?? null,
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
        localTimeStr: input.localTimeStr ?? null,
      });

      const entry = createResult.entry;
      // 并发创建的另一条请求可能已先写入草稿；当前请求要继续把完整对话和正式发布状态更新到同一条。
      if (!createResult.created) {
        if (entry.conversationFinished === true) return { success: true, diaryId: entry.id };
        await updateDiaryEntry(entry.id, {
          clientId: input.clientId ?? entry.clientId,
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
          localTimeStr: input.localTimeStr ?? null,
        });
      }
      // 只有对话结束（日记正式保存）时才发推送通知，避免对话中途就发出通知。
      // shouldSendDiaryNotification 确保同一条日记 10 秒内只发一次通知（防止并发重试导致重复通知）。
      if (input.conversationFinished === true && shouldSendDiaryNotification(entry.id)) {
        const diaryActorMember = (await getRoomMembers(input.roomId)).find(m => m.userId === userId);
        const diaryPreview = input.content.length > 40 ? input.content.slice(0, 40) + '...' : input.content;
        await notifyRoomMembers(
          input.roomId,
          userId,
          `${diaryActorMember?.name || '照顾者'}写了一篇日记 📖`,
          diaryPreview || '点击查看完整日记',
          { type: 'diary', screen: 'diary', diaryId: entry.id, roomId: input.roomId },
          'syncDiary',
        );
      }

      return { success: true, diaryId: entry.id };
    }),

  /** Get diary entries for a room */
  getDiaries: protectedProcedure
    .input(z.object({ roomId: z.number(), limit: z.number().default(100) }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      await requireRoomMember(userId, input.roomId);
      const entries = await getDiaryEntriesByRoom(input.roomId, input.limit);
      // 未点击“结束并保存”的日记仍是作者草稿：作者可跨设备继续，其他家庭成员不可见。
      return entries.filter(entry => entry.conversationFinished === true || entry.authorUserId === userId);
    }),

  /** Delete one diary and its interactions; only the diary author may delete it. */
  deleteDiary: protectedProcedure
    .input(z.object({ roomId: z.number(), diaryId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      await requireRoomMember(userId, input.roomId);
      const entry = await getDiaryEntryForInteraction(input.roomId, input.diaryId);
      if (!entry) throw new Error("日记不存在或已删除");
      if (entry.authorUserId !== userId) throw new Error("只能删除自己发布的日记");
      await deleteDiaryEntryById(input.roomId, input.diaryId);
      return { success: true };
    }),

  /** Mark a diary as read by the current family member (authors do not read-receipt themselves) */
  markDiaryRead: protectedProcedure
    .input(z.object({ roomId: z.number(), diaryId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const member = await requireRoomMember(userId, input.roomId);
      const diary = await getDiaryEntryForInteraction(input.roomId, input.diaryId);
      if (!diary) throw new Error("日记不存在");
      // 尚未“结束并保存”的对话不应产生阅读回执；旧版 null 数据仍视为已发布以保持兼容。
      if (diary.conversationFinished === false || diary.authorUserId === userId) {
        return { success: true, recorded: false };
      }
      await markDiaryRead({
        roomId: input.roomId,
        diaryId: input.diaryId,
        readerUserId: userId,
        readerName: member.name,
        readerEmoji: member.emoji,
      });
      return { success: true, recorded: true };
    }),

  /** Get read receipts and family comments for one diary */
  getDiaryInteractions: protectedProcedure
    .input(z.object({ roomId: z.number(), diaryId: z.number() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      await requireRoomMember(userId, input.roomId);
      const diary = await getDiaryEntryForInteraction(input.roomId, input.diaryId);
      if (!diary) throw new Error("日记不存在");
      if (diary.conversationFinished === false) return { readers: [], comments: [] };
      const interactions = await getDiaryInteractions(input.roomId, input.diaryId);
      return {
        readers: interactions.readers,
        comments: interactions.comments.map(comment => ({
          ...comment,
          canDelete: comment.authorUserId === userId,
        })),
      };
    }),

  /** Add a family comment below a published diary */
  addDiaryComment: protectedProcedure
    .input(z.object({
      roomId: z.number(),
      diaryId: z.number(),
      content: z.string().trim().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const member = await requireRoomMember(userId, input.roomId);
      const diary = await getDiaryEntryForInteraction(input.roomId, input.diaryId);
      if (!diary) throw new Error("日记不存在");
      if (diary.conversationFinished === false) throw new Error("日记尚未发布，暂时不能留言");
      const comment = await addDiaryComment({
        roomId: input.roomId,
        diaryId: input.diaryId,
        authorUserId: userId,
        authorName: member.name,
        authorEmoji: member.emoji,
        content: input.content,
      });
      const members = await getRoomMembers(input.roomId);
      const diaryAuthorName = members.find(item => item.userId === diary.authorUserId)?.name || '家人';
      const preview = input.content.length > 60 ? `${input.content.slice(0, 60)}…` : input.content;
      await notifyRoomMembers(
        input.roomId,
        userId,
        `${member.name || '家人'} 在 ${diaryAuthorName} 的日记下留言了`,
        preview,
        { type: 'diary_comment', screen: 'diary', diaryId: input.diaryId, roomId: input.roomId },
        'addDiaryComment',
      );
      return { success: true, comment: { ...comment, canDelete: true } };
    }),

  /** Delete a diary comment; only the comment author can delete it. */
  deleteDiaryComment: protectedProcedure
    .input(z.object({ roomId: z.number(), commentId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      await requireRoomMember(userId, input.roomId);
      const deleted = await deleteDiaryCommentByAuthor(input.roomId, input.commentId, userId);
      if (!deleted) throw new Error("留言不存在，或你只能删除自己发布的留言");
      return { success: true };
    }),

  /** Batch summaries used by diary cards (readers + comment count) */
  getDiaryInteractionSummaries: protectedProcedure
    .input(z.object({
      roomId: z.number(),
      diaryIds: z.array(z.number()).max(100),
    }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      await requireRoomMember(userId, input.roomId);
      return getDiaryInteractionSummaries(input.roomId, [...new Set(input.diaryIds)]);
    }),

  // ─── Announcements ─────────────────────────────────────────────────────

  /** Post a family announcement / broadcast */
  postAnnouncement: protectedProcedure
    .input(z.object({
      roomId: z.number(),
      clientId: z.string().min(1).max(100).optional(),
      content: z.string(),
      emoji: z.string().optional(),
      type: z.enum(["news", "visit", "medical", "daily", "reminder"]).default("daily"),
      date: z.string(),
      localTimeStr: z.string().optional(),  // HH:MM — 发布者本地时间
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const member = await requireRoomMember(userId, input.roomId);

      const existingAnnouncement = input.clientId
        ? await getAnnouncementByClientId(input.roomId, input.clientId)
        : null;
      const announcement = await createAnnouncement({
        roomId: input.roomId,
        clientId: input.clientId ?? null,
        authorUserId: userId,
        authorName: member.name,
        authorEmoji: member.emoji,
        authorColor: member.color,
        content: input.content,
        emoji: input.emoji ?? null,
        type: input.type,
        date: input.date,
        localTimeStr: input.localTimeStr ?? null,
      });

      // Idempotent retries reuse the same announcement and must not send another push.
      if (!existingAnnouncement) {
        const announcementPreview = input.content.length > 50 ? input.content.slice(0, 50) + '...' : input.content;
        await notifyRoomMembers(
          input.roomId,
          userId,
          `${member.emoji} ${member.name} 有新消息要告诉你`,
          announcementPreview,
          { type: 'announcement', screen: 'family', roomId: input.roomId },
          'postAnnouncement',
        );
      }

      return { success: true, announcement };
    }),

  /** Get announcements for a room */
  getAnnouncements: protectedProcedure
    .input(z.object({ roomId: z.number(), limit: z.number().default(50) }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      await requireRoomMember(userId, input.roomId);
      const [rows, members] = await Promise.all([
        getAnnouncementsByRoom(input.roomId, input.limit),
        getRoomMembers(input.roomId),
      ]);
      const memberIdByUserId = new Map(members.map(member => [member.userId, String(member.id)]));
      return rows.map(row => ({
        ...row,
        authorId: memberIdByUserId.get(row.authorUserId) ?? String(row.authorUserId),
      }));
    }),

  /** Load comments only after one announcement is expanded, so the family tab stays fast. */
  getAnnouncementComments: protectedProcedure
    .input(z.object({ roomId: z.number(), announcementId: z.number() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      await requireRoomMember(userId, input.roomId);
      const announcement = await getAnnouncementById(input.roomId, input.announcementId);
      if (!announcement) throw new Error("公告不存在，或不属于当前家庭");
      const comments = await getAnnouncementComments(input.roomId, input.announcementId);
      return comments.map(comment => ({
        ...comment,
        canDelete: comment.authorUserId === userId,
      }));
    }),

  /** Add a flat family comment under one announcement. */
  addAnnouncementComment: protectedProcedure
    .input(z.object({
      roomId: z.number(),
      announcementId: z.number(),
      clientId: z.string().min(1).max(100),
      content: z.string().trim().min(1),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      localTimeStr: z.string().regex(/^\d{2}:\d{2}$/),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const member = await requireRoomMember(userId, input.roomId);
      const announcement = await getAnnouncementById(input.roomId, input.announcementId);
      if (!announcement) throw new Error("公告不存在，或不属于当前家庭");
      const result = await addAnnouncementComment({
        roomId: input.roomId,
        announcementId: input.announcementId,
        clientId: input.clientId,
        authorUserId: userId,
        authorName: member.name,
        authorEmoji: member.emoji,
        content: input.content,
        date: input.date,
        localTimeStr: input.localTimeStr,
      });
      if (result.created) {
        const preview = input.content.length > 80 ? `${input.content.slice(0, 80)}…` : input.content;
        await notifyRoomMembers(
          input.roomId,
          userId,
          `${member.name || '家人'} 回复了 ${announcement.authorName || '家人'} 的公告`,
          preview,
          {
            type: 'announcement_comment',
            screen: 'family',
            roomId: input.roomId,
            announcementId: input.announcementId,
            openComments: '1',
          },
          'addAnnouncementComment',
        );
      }
      return { success: true, comment: { ...result.comment, canDelete: true } };
    }),

  /** Delete an announcement comment; only its author can delete it. */
  deleteAnnouncementComment: protectedProcedure
    .input(z.object({ roomId: z.number(), announcementId: z.number(), commentId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      await requireRoomMember(userId, input.roomId);
      const announcement = await getAnnouncementById(input.roomId, input.announcementId);
      if (!announcement) throw new Error("公告不存在，或不属于当前家庭");
      const deleted = await deleteAnnouncementCommentByAuthor(
        input.roomId,
        input.announcementId,
        input.commentId,
        userId,
      );
      if (!deleted) throw new Error("评论不存在，或你只能删除自己发布的评论");
      return { success: true };
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
      clientId: z.string().min(1).max(100).optional(),
      name: z.string(),
      dosage: z.string().optional(),
      frequency: z.string().optional(),
      times: z.any().optional(),
      notes: z.string().optional(),
      icon: z.string().optional(),
      active: z.boolean().default(true),
      reminderEnabled: z.boolean().optional(),
      color: z.string().optional(),
      changeEvents: z.array(z.object({
        eventId: z.string().min(1).max(100),
        changeType: z.enum(["added", "updated", "paused", "resumed", "deleted"]),
        reason: z.string().trim().optional(),
        previousSnapshot: z.any().optional(),
        nextSnapshot: z.any().optional(),
        changedAt: z.string(),
      })).max(50).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const member = await requireRoomMember(userId, input.roomId);
      if (!member.isCreator) throw new Error("只有主照顾者可以修改用药记录");
      const med = await upsertMedication({
        id: input.serverMedId,
        roomId: input.roomId,
        clientId: input.clientId ?? null,
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
      const recordedChanges = [];
      for (const event of input.changeEvents ?? []) {
        const parsedChangedAt = new Date(event.changedAt);
        recordedChanges.push(await recordMedicationChange({
          roomId: input.roomId,
          medicationId: Number(med.id),
          eventId: event.eventId,
          changedByUserId: userId,
          changedByName: member.name,
          changeType: event.changeType,
          reason: event.reason || null,
          previousSnapshot: event.previousSnapshot ?? null,
          nextSnapshot: event.nextSnapshot ?? null,
          changedAt: Number.isNaN(parsedChangedAt.getTime()) ? new Date() : parsedChangedAt,
        }));
      }
      return { success: true, medication: med, recordedChanges };
    }),

  /** Get medications for a room */
  getMedications: protectedProcedure
    .input(z.object({ roomId: z.number() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      await requireRoomMember(userId, input.roomId);
      return getMedicationsByRoom(input.roomId);
    }),

  /** Get medication adjustment history; all current family members can view it. */
  getMedicationChanges: protectedProcedure
    .input(z.object({ roomId: z.number(), limit: z.number().min(1).max(200).default(100) }))
    .query(async ({ ctx, input }) => {
      await requireRoomMember(ctx.user.id, input.roomId);
      return getMedicationChangesByRoom(input.roomId, input.limit);
    }),

  /** Delete a medication */
  deleteMedication: protectedProcedure
    .input(z.object({
      roomId: z.number(),
      medicationId: z.number(),
      changeEvent: z.object({
        eventId: z.string().min(1).max(100),
        reason: z.string().trim().optional(),
        previousSnapshot: z.any().optional(),
        changedAt: z.string(),
      }).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const member = await requireRoomMember(userId, input.roomId);
      if (!member.isCreator) throw new Error("只有主照顾者可以删除用药记录");
      if (input.changeEvent) {
        const parsedChangedAt = new Date(input.changeEvent.changedAt);
        await recordMedicationChange({
          roomId: input.roomId,
          medicationId: input.medicationId,
          eventId: input.changeEvent.eventId,
          changedByUserId: userId,
          changedByName: member.name,
          changeType: "deleted",
          reason: input.changeEvent.reason || null,
          previousSnapshot: input.changeEvent.previousSnapshot ?? null,
          nextSnapshot: null,
          changedAt: Number.isNaN(parsedChangedAt.getTime()) ? new Date() : parsedChangedAt,
        });
      }
      await deleteMedication(input.medicationId, input.roomId);
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
      // 同时更新 familyRooms 表中的展示字段，确保 getRoomDetail 返回最新名字
      const roomUpdates: Record<string, any> = {};
      if (input.name !== undefined) roomUpdates.elderName = input.name;
      if (input.elderPhotoUri !== undefined) roomUpdates.elderPhotoUri = input.elderPhotoUri;
      if (Object.keys(roomUpdates).length > 0) {
        await updateFamilyRoom(input.roomId, roomUpdates).catch((e) => {
          console.warn('[updateElderProfile] Failed to sync elderName to familyRooms:', e);
        });
      }
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
      await deleteAnnouncement(input.announcementId, input.roomId);
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
      const announcementsInRoom = await getAnnouncementsByRoom(input.roomId, 200);
      const targetAnnouncement = announcementsInRoom.find(a => a.id === input.announcementId);
      if (!targetAnnouncement) throw new Error("公告不存在");
      const reactions = await toggleReaction(
        input.announcementId,
        member.id,
        member.name,
        member.emoji,
        input.emoji,
      );
      // 判断是添加还是取消 reaction（只有添加时才发通知）
      const isAdding = reactions.some((r: any) =>
        r.emoji === input.emoji &&
        r.members.some((m: any) => String(m.memberId) === String(member.id))
      );
      if (isAdding) {
        const senderName = member.name || '家人';
        await notifyRoomMembers(
          input.roomId,
          userId,
          `${senderName} 对 ${targetAnnouncement.authorName || '家人'} 的公告回应了 ${input.emoji}`,
          '点击查看这条家庭公告',
          { type: 'reaction', screen: 'family', announcementId: input.announcementId, roomId: input.roomId },
          'toggleReaction',
        );
      }
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
  /** Update current user's member profile in a room (e.g. photo, emoji) */
  updateMemberProfile: protectedProcedure
    .input(z.object({
      roomId: z.number(),
      name: z.string().optional(),
      emoji: z.string().optional(),
      photoUri: z.string().optional(),
      birthYear: z.number().optional(),
      relationship: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const member = await requireRoomMember(userId, input.roomId);
      await updateFamilyMember(member.id, {
        name: input.name,
        emoji: input.emoji,
        photoUri: input.photoUri,
        birthYear: input.birthYear,
        relationship: input.relationship,
      });
      return { success: true };
    }),
  /** Upload a photo (base64) to S3 and return the public URL */
  uploadPhoto: protectedProcedure
    .input(z.object({
      base64: z.string(),          // data:image/jpeg;base64,... or raw base64
      mimeType: z.string().default("image/jpeg"),
      scope: z.enum(["member", "elder"]).default("member"),
      roomId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      console.log(`[uploadPhoto] userId=${userId} scope=${input.scope} mimeType=${input.mimeType} base64Len=${input.base64.length}`);
      // Strip data URI prefix if present
      const raw = input.base64.replace(/^data:[^;]+;base64,/, "");
      const buffer = Buffer.from(raw, "base64");
      const ext = input.mimeType === "image/png" ? "png" : "jpg";
      const key = `avatars/${input.scope}/${userId}-${Date.now()}.${ext}`;
      console.log(`[uploadPhoto] Uploading key=${key} bufferSize=${buffer.length}`);
      let url: string;
      try {
        const result = await ossUploadAvatar(key, buffer, input.mimeType);
        url = result.url;
        console.log(`[uploadPhoto] OSS upload success, url=${url}`);
      } catch (ossErr) {
        console.warn(`[uploadPhoto] OSS upload failed, falling back to built-in storage:`, ossErr);
        try {
          const fallback = await storagePut(key, buffer, input.mimeType);
          url = fallback.url;
          console.log(`[uploadPhoto] Built-in storage upload success, url=${url}`);
        } catch (storageErr) {
          console.error(`[uploadPhoto] Both OSS and built-in storage failed:`, storageErr);
          throw storageErr;
        }
      }
      // If uploading member photo, update photoUri in ALL rooms the user belongs to
      if (input.scope === "member") {
        const allRooms = await getUserFamilyRooms(userId).catch(() => []);
        for (const { membership } of allRooms) {
          await updateFamilyMember(membership.id, { photoUri: url }).catch(() => {});
        }
      }
      return { success: true, url };
    }),
});
