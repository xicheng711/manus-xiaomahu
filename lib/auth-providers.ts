import { Platform } from 'react-native';
import * as Auth from '@/lib/_core/auth';
import { getApiBaseUrl } from '@/constants/oauth';
import type { Router } from 'expo-router';
import {
  getProfile, getFamilyProfile,
  addOrUpdateMembership, saveFamilyRoom, saveFamilyProfile,
  setActiveFamilyId, setActiveRoomIdCache,
  FamilyMembership, FamilyRoom,
} from '@/lib/storage';
import {
  cloudGetMyRooms, cloudGetRoomDetail, setCloudSyncState,
  cloudGetCheckIns, cloudGetDiaries, cloudGetAnnouncements, cloudGetBriefings, cloudGetMedications,
} from '@/lib/cloud-sync';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE = getApiBaseUrl();

async function exchangeProviderToken(provider: 'wechat' | 'apple', payload: Record<string, any>) {
  const res = await fetch(`${API_BASE}/api/auth/${provider}/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `${provider} 登录失败`);
  }
  const data = await res.json();
  if (data.sessionToken) {
    await Auth.setSessionToken(data.sessionToken);
    if (data.user) {
      await Auth.setUserInfo({
        id: data.user.id,
        openId: data.user.openId,
        name: data.user.name,
        email: data.user.email,
        loginMethod: data.user.loginMethod,
        lastSignedIn: new Date(data.user.lastSignedIn),
      });
    }
  }
  return data;
}

/**
 * After login, determine where to navigate:
 *
 * 1. Query the server for the user's existing rooms (cloud-authoritative).
 * 2. If the server returns rooms → restore local data and go to /(tabs).
 *    This handles the "reinstall" scenario: user deletes the app and
 *    reinstalls — their data is restored from the server automatically.
 * 3. If the server returns nothing → check local setupComplete.
 *    - If local setup exists → go to /(tabs) (same-device, no reinstall).
 *    - Otherwise → go to /onboarding (truly new user).
 */
async function navigateAfterLogin(router: Router) {
  try {
    // Step 1: Ask the server what rooms this user belongs to
    const serverRooms = await cloudGetMyRooms();

    if (Array.isArray(serverRooms) && serverRooms.length > 0) {
      // Step 2: Restore all memberships from server data
      for (const sr of serverRooms) {
        try {
          const detail = await cloudGetRoomDetail(sr.roomId);
          const members = (detail?.members ?? []).map((m: any) => ({
            id: String(m.id),
            name: m.name,
            role: m.role ?? 'family',
            roleLabel: m.roleLabel ?? m.role ?? '家人',
            emoji: m.emoji ?? '👤',
            color: m.color ?? '#888',
            photoUri: m.photoUri ?? null,
            joinedAt: m.joinedAt ?? new Date().toISOString(),
            isCreator: m.isCreator ?? false,
            isCurrentUser: false,
          }));

          const room: FamilyRoom = {
            id: String(sr.roomId),
            roomCode: sr.roomCode ?? '',
            elderName: sr.elderName ?? '家人',
            elderEmoji: sr.elderEmoji ?? undefined,
            elderPhotoUri: sr.elderPhotoUri ?? undefined,
            members,
            createdAt: detail?.room?.createdAt ?? new Date().toISOString(),
          };

          // Find my member entry using the server-provided myMemberId
          const myMemberId = sr.myMemberId ? String(sr.myMemberId) : String(sr.roomId);
          const myMember = members.find((m: any) => m.id === myMemberId) ?? members[0];
          if (myMember) myMember.isCurrentUser = true;

          const membership: FamilyMembership = {
            familyId: String(sr.roomId),
            myMemberId,
            role: sr.isCreator ? 'creator' : 'joiner',
            room,
            joinedAt: myMember?.joinedAt ?? new Date().toISOString(),
            memberEmoji: sr.memberEmoji ?? undefined,
            memberPhotoUri: sr.memberPhotoUri ?? undefined,
          };

          await saveFamilyRoom(room);
          await addOrUpdateMembership(membership);

          // Restore UserProfile (caregiver name + photo) from my member entry
          // This ensures the homepage avatar is correct after reinstall/login
          if (myMember) {
            try {
              const { getUserProfile, saveUserProfile } = await import('@/lib/storage');
              const existing = await getUserProfile();
              const updatedName = myMember.name || existing?.caregiverName;
              // 只有主照顾者（isCreator=true）才恢复照片；joiner 不恢复照片，避免旧照片覆盖自选 emoji
              const isCreatorMember = myMember.isCreator === true;
              const updatedPhoto = isCreatorMember ? (myMember.photoUri || existing?.caregiverPhotoUri) : undefined;
              if (updatedName || updatedPhoto) {
                await saveUserProfile({
                  ...existing,
                  ...(updatedName ? { caregiverName: updatedName } : {}),
                  ...(updatedPhoto ? { caregiverPhotoUri: updatedPhoto, caregiverAvatarType: 'photo' } : {}),
                });
              }
            } catch (e) {
              console.warn('[navigateAfterLogin] Failed to restore UserProfile', e);
            }
          }

          // Restore elder profile if available
          if (detail?.elderProfile) {
            const ep = detail.elderProfile;
            await saveFamilyProfile({
              name: ep.name ?? undefined,
              nickname: ep.nickname ?? undefined,
              birthDate: ep.birthDate ?? undefined,
              zodiacEmoji: ep.zodiacEmoji ?? undefined,
              zodiacName: ep.zodiacName ?? undefined,
              elderPhotoUri: ep.elderPhotoUri ?? undefined,
              elderAvatarType: ep.elderAvatarType ?? undefined,
              city: ep.city ?? undefined,
              reminderMorning: ep.reminderMorning ?? undefined,
              reminderEvening: ep.reminderEvening ?? undefined,
              setupComplete: true,
              careNeeds: ep.careNeeds ?? undefined,
            }, String(sr.roomId));
          }
        } catch (e) {
          console.warn('[navigateAfterLogin] Failed to restore room', sr.roomId, e);
        }
      }

      // Set the first room as active
      const firstRoomId = String(serverRooms[0].roomId);
      await setActiveFamilyId(firstRoomId);
      setActiveRoomIdCache(firstRoomId);

      // 登录成功后保存 userId 到 CloudSyncState，为日记合并等功能提供精确的用户识别
      try {
        const userInfo = await Auth.getUserInfo();
        if (userInfo?.id) {
          await setCloudSyncState({ userId: userInfo.id });
        }
      } catch {}

      // 登录成功后重新注册 push token，确保 Joiner 和主照顾者都能收到服务器推送通知
      try {
        const { registerPushToken } = await import('@/lib/notifications');
        registerPushToken().catch(() => {});
      } catch {}

      // 预拉取所有数据写入本地缓存，确保退出重新登录后数据立即可见
      // 对每个 room 都拉取一次，但主要用 firstRoomId
      try {
        const firstRoomIdNum = serverRooms[0].roomId;
        const roomIdStr = firstRoomId; // already set above

        const [checkInsData, diariesData, announcementsData, briefingsData, medsData] = await Promise.all([
          cloudGetCheckIns(firstRoomIdNum, 60),
          cloudGetDiaries(firstRoomIdNum, 100),
          cloudGetAnnouncements(firstRoomIdNum, 50),
          cloudGetBriefings(firstRoomIdNum, 14),
          cloudGetMedications(firstRoomIdNum),
        ]);

        // Helper: room-scoped key
        const rk = (base: string) => roomIdStr ? `${base}:${roomIdStr}` : base;

        // Write check-ins
        if (Array.isArray(checkInsData) && checkInsData.length > 0) {
          // Map server fields to local DailyCheckIn shape
          const localCheckIns = checkInsData.map((c: any) => ({
            id: String(c.id),
            date: c.date,
            sleepHours: c.sleepHours ?? 7,
            sleepQuality: c.sleepQuality ?? 'fair',
            sleepInput: c.sleepInput,
            sleepScore: c.sleepScore,
            sleepProblems: c.sleepProblems,
            sleepType: c.sleepType,
            morningNotes: c.morningNotes ?? '',
            morningDone: c.morningDone ?? false,
            moodEmoji: c.moodEmoji ?? '😌',
            moodScore: c.moodScore ?? 5,
            medicationTaken: c.medicationTaken ?? true,
            medicationNotes: c.medicationNotes ?? '',
            mealNotes: c.mealNotes ?? '',
            mealOption: c.mealOption,
            eveningNotes: c.eveningNotes ?? '',
            eveningDone: c.eveningDone ?? false,
            aiMessage: c.aiMessage ?? '',
            careScore: c.careScore ?? 50,
            completedAt: c.completedAt ?? c.createdAt ?? new Date().toISOString(),
            serverCheckInId: c.id,
          }));
          await AsyncStorage.setItem(rk('daily_checkins_v2'), JSON.stringify(localCheckIns));
        }

        // Write diaries
        if (Array.isArray(diariesData) && diariesData.length > 0) {
          const localDiaries = diariesData.map((d: any) => ({
            id: `server_${d.id}`,
            serverDiaryId: d.id,
            date: d.date,
            content: d.content ?? '',
            moodEmoji: d.moodEmoji,
            moodLabel: d.moodLabel,
            moodScore: d.moodScore,
            tags: d.tags ?? [],
            caregiverMoodEmoji: d.caregiverMoodEmoji,
            caregiverMoodLabel: d.caregiverMoodLabel,
            aiReply: d.aiReply,
            aiEmoji: d.aiEmoji,
            aiTip: d.aiTip,
            conversation: d.conversation ?? [],
            conversationFinished: d.conversationFinished ?? true,
            localTimeStr: d.localTimeStr,
            authorName: d.authorName,
            authorUserId: d.authorUserId,
            createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : new Date().toISOString(),
          }));
          await AsyncStorage.setItem(rk('diary_entries'), JSON.stringify(localDiaries));
        }

        // Write announcements
        if (Array.isArray(announcementsData) && announcementsData.length > 0) {
          const localAnnouncements = announcementsData.map((a: any) => ({
            id: String(a.id),
            serverId: a.id,
            content: a.content,
            emoji: a.emoji,
            type: a.type ?? 'daily',
            date: a.date,
            authorName: a.authorName,
            authorEmoji: a.authorEmoji,
            authorColor: a.authorColor,
            reactions: a.reactions ?? {},
            createdAt: a.createdAt ? new Date(a.createdAt).toISOString() : new Date().toISOString(),
          }));
          await AsyncStorage.setItem(rk('family_announcements_v1'), JSON.stringify(localAnnouncements));
        }

        // Write briefings
        if (Array.isArray(briefingsData) && briefingsData.length > 0) {
          const localBriefings = briefingsData.map((b: any) => ({
            id: String(b.id),
            date: b.date,
            careScore: b.careScore,
            summary: b.summary,
            encouragement: b.encouragement,
            highlights: b.highlights ?? [],
            attention: b.attention,
            shareText: b.shareText,
            generatedAt: b.generatedAt,
            checkInDate: b.checkInDate,
          }));
          await AsyncStorage.setItem(rk('care_briefings_v1'), JSON.stringify(localBriefings));
        }

        // Write medications
        if (Array.isArray(medsData) && medsData.length > 0) {
          const localMeds = medsData.map((m: any) => ({
            id: String(m.id),
            serverMedId: m.id,
            name: m.name,
            dosage: m.dosage,
            frequency: m.frequency,
            times: m.times ?? [],
            notes: m.notes,
            icon: m.icon ?? '💊',
            active: m.active ?? true,
            reminderEnabled: m.reminderEnabled ?? true,
            color: m.color,
          }));
          await AsyncStorage.setItem(rk('medications'), JSON.stringify(localMeds));
        }

        console.log('[navigateAfterLogin] Pre-fetched data for room', roomIdStr,
          '- checkIns:', checkInsData?.length ?? 0,
          'diaries:', diariesData?.length ?? 0,
          'announcements:', announcementsData?.length ?? 0,
          'briefings:', briefingsData?.length ?? 0,
          'medications:', medsData?.length ?? 0);
      } catch (e) {
        console.warn('[navigateAfterLogin] Pre-fetch failed (non-fatal):', e);
      }

      // Navigate to main app — data is restored
      router.replace('/(tabs)' as any);
      return;
    }
  } catch (e) {
    // Server unavailable — fall through to local check
    console.warn('[navigateAfterLogin] Server query failed, falling back to local check:', e);
  }

  // Step 3: Fallback — check local storage (server unavailable or truly new user)
  try {
    const [legacyProfile, familyProfile] = await Promise.all([
      getProfile(),
      getFamilyProfile(),
    ]);
    const setupDone = legacyProfile?.setupComplete || familyProfile?.setupComplete;
    if (setupDone) {
      router.replace('/(tabs)' as any);
    } else {
      router.replace('/onboarding' as any);
    }
  } catch {
    router.replace('/onboarding' as any);
  }
}

export async function loginWithWeChat(router: Router) {
  if (Platform.OS === 'web') {
    throw new Error('微信登录需要在手机 App 中使用');
  }

  let WechatLib: any;
  try {
    WechatLib = require('react-native-wechat-lib');
  } catch {
    throw new Error('微信 SDK 未安装，请在原生构建中使用');
  }

  const isInstalled = await WechatLib.isWXAppInstalled();
  if (!isInstalled) {
    throw new Error('请先安装微信客户端');
  }

  const response = await WechatLib.sendAuthRequest('snsapi_userinfo', 'xiaomahulogin');

  if (response.errCode !== 0) {
    throw new Error('微信授权被取消');
  }

  await exchangeProviderToken('wechat', { code: response.code });
  await navigateAfterLogin(router);
}

export async function loginWithApple(router: Router) {
  if (Platform.OS !== 'ios') {
    throw new Error('Apple 登录仅支持 iOS 设备');
  }

  let AppleAuth: any;
  try {
    AppleAuth = require('expo-apple-authentication');
  } catch {
    throw new Error('Apple 登录 SDK 未安装');
  }

  const isAvailable = await AppleAuth.isAvailableAsync();
  if (!isAvailable) {
    throw new Error('此设备不支持 Apple 登录');
  }

  const credential = await AppleAuth.signInAsync({
    requestedScopes: [
      AppleAuth.AppleAuthenticationScope.FULL_NAME,
      AppleAuth.AppleAuthenticationScope.EMAIL,
    ],
  });

  if (!credential.identityToken) {
    throw new Error('Apple 登录失败：未获取到身份令牌');
  }

  await exchangeProviderToken('apple', {
    identityToken: credential.identityToken,
    user: credential.user,
    fullName: credential.fullName,
    email: credential.email,
  });

  await navigateAfterLogin(router);
}
