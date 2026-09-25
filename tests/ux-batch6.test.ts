/**
 * UX batch6: 修复 family 页 Tab 对齐 + 发布公告按钮 discoverability
 * 1. sectionTabText 去掉 paddingVertical（曾导致非活跃 Tab 比活跃态高 11px，视觉错位）
 * 2. 活跃/非活跃两态的垂直 padding 唯一来源是 sectionTabInner
 * 3. 发布按钮：放大 + plus 线条图标 + 文字改为"发布公告"；空状态提示同步
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const repo = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(repo, 'app/(tabs)/family.tsx'), 'utf8');

describe('ux-batch6: section tab 对齐', () => {
  it('sectionTabText 不再自带 paddingVertical', () => {
    const m = src.match(/sectionTabText:\s*\{([^}]*)\}/);
    expect(m).toBeTruthy();
    expect(m![1]).not.toContain('paddingVertical');
  });

  it('sectionTabGradient 不再自带 paddingVertical', () => {
    const m = src.match(/sectionTabGradient:\s*\{([^}]*)\}/);
    expect(m).toBeTruthy();
    expect(m![1]).not.toContain('paddingVertical');
  });

  it('sectionTabInner 是两态唯一的垂直 padding 来源', () => {
    const m = src.match(/sectionTabInner:\s*\{([^}]*)\}/);
    expect(m).toBeTruthy();
    expect(m![1]).toContain('paddingVertical');
  });
});

describe('ux-batch6: 发布公告按钮更醒目', () => {
  it('按钮使用 plus 线条图标 + "发布公告"文字', () => {
    expect(src).toContain('<AppIcon name="plus" color="#FFFFFF"');
    expect(src).toContain('>发布公告</Text>');
  });

  it('不再使用小字"＋ 发布"', () => {
    expect(src).not.toContain('＋ 发布');
  });

  it('按钮尺寸放大（padding 与字号）', () => {
    const m = src.match(/inlinePostButton:\s*\{([^}]*)\}/);
    expect(m).toBeTruthy();
    expect(m![1]).toContain('paddingHorizontal: 16');
    expect(m![1]).toContain('paddingVertical: 10');
    const t = src.match(/inlinePostButtonText:\s*\{([^}]*)\}/);
    expect(t).toBeTruthy();
    expect(t![1]).toContain('fontSize: 14');
  });

  it('空状态提示与新按钮文案一致', () => {
    expect(src).toContain('点击右上角“发布公告”');
  });
});

describe('ux-batch6: 成员头像照片显示', () => {
  it('MemberAvatarChip 不再只给主照顾者显示照片（去掉 isCreator 门控）', () => {
    // 旧逻辑：const showPhoto = isCreator && !!m.photoUri && !imgError && !zodiacInfo;
    expect(src).not.toMatch(/showPhoto\s*=\s*isCreator\s*&&/);
  });

  it('有 photoUri 就显示照片（优先于生肖/emoji）', () => {
    expect(src).toMatch(/const showPhoto = !!m\.photoUri && !imgError;/);
  });
});

describe('ux-batch6: 图标更粗更高级', () => {
  const icons = fs.readFileSync(path.join(repo, 'components/app-icons.tsx'), 'utf8');
  const header = fs.readFileSync(path.join(repo, 'components/page-header.tsx'), 'utf8');

  it('AppIcon 默认线宽为 2（Lucide/Feather 标准）', () => {
    expect(icons).toMatch(/strokeWidth\s*=\s*2,/);
  });

  it('页头图标放大到 28', () => {
    expect(header).toContain('<AppIcon name={theme.icon} color="#fff" size={28} />');
  });
});
