import type { Express, Request, Response } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { COOKIE_NAME, ONE_YEAR_MS } from '../shared/const.js';
import { getSessionCookieOptions } from './_core/cookies';
import { sdk } from './_core/sdk';
import { getUserByOpenId, upsertUser } from './db';
import { ENV } from './_core/env';
import {
  APPLE_ACCOUNT_FALLBACK_NAME,
  formatAppleFullName,
  normalizeProviderText,
  resolveProviderText,
} from '../shared/apple-auth.js';

const APPLE_JWKS = createRemoteJWKSet(
  new URL('https://appleid.apple.com/auth/keys')
);

async function createSessionAndRespond(
  req: Request,
  res: Response,
  openId: string,
  name: string | null,
  email: string | null,
  loginMethod: string,
) {
  const lastSignedIn = new Date();
  const existingUser = await getUserByOpenId(openId);
  const fallbackName = loginMethod === 'apple'
    ? APPLE_ACCOUNT_FALLBACK_NAME
    : openId.split('_')[1]?.substring(0, 8) || openId;
  const effectiveName = resolveProviderText(name, existingUser?.name, fallbackName);
  const effectiveEmail = resolveProviderText(email, existingUser?.email, null, 320);

  // Apple only supplies name/email during the initial authorization. Never
  // replace a previously stored value with null on a later sign-in.
  await upsertUser({
    openId,
    ...(normalizeProviderText(name) ? { name: effectiveName } : {}),
    ...(normalizeProviderText(email, 320) ? { email: effectiveEmail } : {}),
    loginMethod,
    lastSignedIn,
  });
  const user = await getUserByOpenId(openId);
  const responseName = resolveProviderText(user?.name, effectiveName, fallbackName);
  const responseEmail = resolveProviderText(user?.email, effectiveEmail, null, 320);

  const sessionToken = await sdk.createSessionToken(openId, {
    name: responseName ?? fallbackName,
    expiresInMs: ONE_YEAR_MS,
  });

  const cookieOptions = getSessionCookieOptions(req);
  res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

  res.json({
    sessionToken,
    user: {
      id: user?.id ?? null,
      openId,
      name: responseName,
      email: responseEmail,
      loginMethod,
      lastSignedIn: lastSignedIn.toISOString(),
    },
  });
}

export function registerAuthProviderRoutes(app: Express) {
  app.post('/api/auth/wechat/callback', async (req: Request, res: Response) => {
    const { code } = req.body;

    if (!code) {
      res.status(400).json({ error: '缺少微信授权码' });
      return;
    }

    if (!ENV.wechatAppId || !ENV.wechatAppSecret) {
      console.error('[WeChat] APP_ID or APP_SECRET not configured');
      res.status(500).json({ error: '微信登录未配置' });
      return;
    }

    try {
      const tokenUrl = `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${ENV.wechatAppId}&secret=${ENV.wechatAppSecret}&code=${code}&grant_type=authorization_code`;
      const tokenRes = await fetch(tokenUrl);
      const tokenData = await tokenRes.json() as any;

      if (tokenData.errcode) {
        console.error('[WeChat] Token exchange failed:', tokenData);
        res.status(400).json({ error: tokenData.errmsg || '微信授权失败' });
        return;
      }

      const { access_token, openid, unionid } = tokenData;

      const userInfoUrl = `https://api.weixin.qq.com/sns/userinfo?access_token=${access_token}&openid=${openid}&lang=zh_CN`;
      const userInfoRes = await fetch(userInfoUrl);
      const userInfo = await userInfoRes.json() as any;

      const wxOpenId = `wechat_${unionid || openid}`;
      const wxName = userInfo.nickname || null;

      await createSessionAndRespond(req, res, wxOpenId, wxName, null, 'wechat');
    } catch (error) {
      console.error('[WeChat] Login failed:', error);
      res.status(500).json({ error: '微信登录失败' });
    }
  });

  app.post('/api/auth/apple/callback', async (req: Request, res: Response) => {
    const { identityToken: rawIdentityToken, fullName, email } = req.body;

    if (!rawIdentityToken) {
      res.status(400).json({ error: '缺少 Apple 登录凭证' });
      return;
    }

    // 清理 identityToken：确保是字符串并去除空白字符
    const identityToken = typeof rawIdentityToken === 'string'
      ? rawIdentityToken.trim()
      : String(rawIdentityToken).trim();

    // 调试日志：打印 token 格式信息
    const tokenParts = identityToken.split('.');
    console.log('[Apple] identityToken type:', typeof rawIdentityToken, 'parts:', tokenParts.length, 'length:', identityToken.length);

    if (tokenParts.length !== 3) {
      console.error('[Apple] Invalid identityToken format, parts:', tokenParts.length, 'preview:', identityToken.substring(0, 80));
      res.status(400).json({ error: 'Apple 身份令牌格式无效' });
      return;
    }

    const expectedAudience = ENV.appleServiceId || ENV.appId;
    console.log('[Apple] expectedAudience:', expectedAudience);
    if (!expectedAudience) {
      console.error('[Apple] No APPLE_SERVICE_ID or APP_ID configured for audience check');
      res.status(500).json({ error: 'Apple 登录未配置' });
      return;
    }

    try {
      const { payload } = await jwtVerify(identityToken, APPLE_JWKS, {
        issuer: 'https://appleid.apple.com',
        audience: expectedAudience,
      });

      const sub = payload.sub;
      if (!sub) {
        res.status(400).json({ error: 'Apple 身份令牌缺少用户标识' });
        return;
      }

      const appleOpenId = `apple_${sub}`;
      const appleEmail = email || (payload.email as string) || null;
      const appleName = formatAppleFullName(fullName);

      console.log('[Apple] Login success, openId:', appleOpenId);
      await createSessionAndRespond(req, res, appleOpenId, appleName, appleEmail, 'apple');
    } catch (error: any) {
      if (error?.code === 'ERR_JWT_EXPIRED') {
        res.status(401).json({ error: 'Apple 身份令牌已过期，请重新登录' });
        return;
      }
      if (error?.code === 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED') {
        res.status(401).json({ error: 'Apple 身份令牌签名验证失败' });
        return;
      }
      if (error?.code === 'ERR_JWT_CLAIM_VALIDATION_FAILED') {
        console.error('[Apple] JWT claim validation failed:', error.message);
        res.status(401).json({ error: `Apple 身份令牌验证失败: ${error.message}` });
        return;
      }
      console.error('[Apple] Login failed:', error);
      res.status(500).json({ error: 'Apple 登录失败' });
    }
  });
}
