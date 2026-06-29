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
import { cloudGetMyRooms, cloudGetRoomDetail, setCloudSyncState } from '@/lib/cloud-sync';

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
              // 接受任何非空 photoUri（包括 http://、自定义域名等），不强制要求 https://
              const updatedPhoto = myMember.photoUri || existing?.caregiverPhotoUri;
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
