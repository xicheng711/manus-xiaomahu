import { Platform } from 'react-native';
import * as Auth from '@/lib/_core/auth';
import { getApiBaseUrl } from '@/constants/oauth';
import type { Router } from 'expo-router';
import { getProfile, getFamilyProfile } from '@/lib/storage';

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

/** After login, go to onboarding if first-time user, otherwise go to tabs */
async function navigateAfterLogin(router: Router) {
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
