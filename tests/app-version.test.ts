import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(import.meta.dirname, '..');

describe('App 发布版本配置', () => {
  it('Expo 公开版本统一为 2.1.1', () => {
    const appConfig = fs.readFileSync(path.join(ROOT, 'app.config.ts'), 'utf8');
    expect(appConfig).toContain('version: "2.1.1"');
    expect(appConfig).not.toContain('version: "2.1.0"');
  });

  it('EAS production 使用远端版本源并自动递增 Build Number', () => {
    const eas = JSON.parse(fs.readFileSync(path.join(ROOT, 'eas.json'), 'utf8'));
    expect(eas.cli.appVersionSource).toBe('remote');
    expect(eas.build.production.autoIncrement).toBe(true);
  });
});
