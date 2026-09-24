import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('iOS protected resource purpose strings', () => {
  const appConfig = read('app.config.ts');
  const loginScreen = read('app/login.tsx');
  const packageJson = read('package.json');
  const pnpmLockfile = read('pnpm-lock.yaml');
  const npmLockfile = read('package-lock.json');

  it('does not ship microphone capability when the app has no recording feature', () => {
    expect(appConfig).not.toContain('NSMicrophoneUsageDescription');
    expect(appConfig).toContain('microphonePermission: false');
    expect(appConfig).toContain('cameraPermission: false');
    expect(appConfig).toContain('locationAlwaysAndWhenInUsePermission: false');
    expect(appConfig).toContain('locationAlwaysPermission: false');
    expect(appConfig).not.toContain('"expo-audio"');
    expect(packageJson).not.toContain('"expo-audio"');
    expect(pnpmLockfile).not.toMatch(/^\s{2}expo-audio:/m);
    expect(npmLockfile).not.toContain('expo-audio');
    expect(npmLockfile).not.toContain('expo-av');
  });

  it('uses a custom Apple login button labeled exactly "Apple 登录" (batch2 设计)', () => {
    // batch2 决定：主按钮只写"Apple 登录"，原生按钮文案不可控，改用自定义按钮 + AppleLogo
    expect(loginScreen).toContain('>Apple 登录</Text>');
    expect(loginScreen).toContain('AppleLogo');
    expect(loginScreen).not.toContain('AppleAuthentication.AppleAuthenticationButton');
    expect(loginScreen).not.toContain('🍎');
  });

  it('does not ship the unused video module or declare background audio', () => {
    expect(appConfig).not.toContain('"expo-video"');
    expect(appConfig).not.toContain('supportsBackgroundPlayback');
    expect(appConfig).not.toContain('supportsPictureInPicture');
    expect(appConfig).not.toContain('UIBackgroundModes');
    expect(packageJson).not.toContain('"expo-video"');
    expect(pnpmLockfile).not.toMatch(/^\s{2}expo-video:/m);
    expect(npmLockfile).not.toContain('expo-video');
  });

  it('keeps specific user-facing explanations for the protected resources that are used', () => {
    expect(appConfig).toContain('允许小马虎访问您的相册，用于上传头像和家庭照片。');
    expect(appConfig).toContain('locationWhenInUsePermission: "允许小马虎获取您的位置，用于显示当地天气信息。"');
    expect(appConfig).not.toContain('locationAlwaysPermission: "');
    expect(appConfig).toContain('允许小马虎保存护理简报图片到相册。');
  });
});
