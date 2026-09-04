import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('iOS protected resource purpose strings', () => {
  const appConfig = read('app.config.ts');
  const packageJson = read('package.json');
  const lockfile = read('pnpm-lock.yaml');

  it('does not ship microphone capability when the app has no recording feature', () => {
    expect(appConfig).not.toContain('NSMicrophoneUsageDescription');
    expect(appConfig).toContain('microphonePermission: false');
    expect(appConfig).toContain('cameraPermission: false');
    expect(appConfig).toContain('locationAlwaysAndWhenInUsePermission: false');
    expect(appConfig).toContain('locationAlwaysPermission: false');
    expect(appConfig).not.toContain('"expo-audio"');
    expect(packageJson).not.toContain('"expo-audio"');
    expect(lockfile).not.toMatch(/^\s{2}expo-audio:/m);
  });

  it('keeps specific user-facing explanations for the protected resources that are used', () => {
    expect(appConfig).toContain('允许小马虎访问您的相册，用于上传头像和家庭照片。');
    expect(appConfig).toContain('locationWhenInUsePermission: "允许小马虎获取您的位置，用于显示当地天气信息。"');
    expect(appConfig).not.toContain('locationAlwaysPermission: "');
    expect(appConfig).toContain('允许小马虎保存护理简报图片到相册。');
  });
});
