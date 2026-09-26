/**
 * UX Batch9 追加：家人页悬浮"发布公告"按钮
 *
 * 用户反馈：家人共享页的"发布公告"按钮在"今日公告"标题栏里，往下滚就没了，
 * 不方便找。改成右下角悬浮按钮，滚到哪里都能点到。
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO = path.resolve(__dirname, '..');
const FAMILY = fs.readFileSync(path.join(REPO, 'app/(tabs)/family.tsx'), 'utf8');

describe('家人页悬浮发布公告按钮', () => {
  it('有 FAB 按钮，点击打开发布弹窗', () => {
    expect(FAMILY).toContain('fabPostButton');
    expect(FAMILY).toMatch(/fabPostButton[\s\S]{0,200}setShowCompose\(true\)/);
  });

  it('FAB 用绝对定位固定在右下角，不随 ScrollView 滚动', () => {
    expect(FAMILY).toContain("position: 'absolute'");
    expect(FAMILY).toMatch(/fabPostButton: \{[\s\S]*?right: 20/);
  });

  it('FAB 底部留出安全区 + 底部导航的高度', () => {
    expect(FAMILY).toMatch(/bottom: Math\.max\(110, insets\.bottom \+ 96\)/);
  });

  it('只在"公告" Tab 显示，简报 Tab 不显示', () => {
    expect(FAMILY).toMatch(/activeSection === 'broadcast' && \([\s\S]*?fabPostButton/);
  });

  it('FAB 有阴影/层级，浮在内容上层', () => {
    expect(FAMILY).toMatch(/fabPostButton: \{[\s\S]*?elevation: 6/);
  });
});
