/**
 * UX batch9.5: 性能审计确认问题的回归测试
 * - A: 无限动画必须有 cleanup（卸载/effect 重跑时停掉 native 循环）
 * - B: TrendChart 派生数据包 useMemo
 * - C: 首页头像云端刷新不阻塞首屏本地读取
 * - D: 用药页 focus 拉云端加缓存门控
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const repo = path.join(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(repo, p), 'utf8');

const indexSrc = read('app/(tabs)/index.tsx');
const diaryEditSrc = read('app/diary-edit.tsx');
const medicationSrc = read('app/(tabs)/medication.tsx');
const diarySrc = read('app/(tabs)/diary.tsx');
const shareSrc = read('app/share.tsx');
const joinerSrc = read('components/joiner-locked-screen.tsx');
const loginSrc = read('app/login.tsx');
const trendSrc = read('components/trend-chart.tsx');

describe('A: 无限动画都有 cleanup', () => {
  it('A1: EnhancedCheckinBanner effect 重跑/卸载时停掉 loop 和星星递归链', () => {
    expect(indexSrc).toContain('loops.forEach((l) => l.stop())');
    expect(indexSrc).toContain('if (alive) runStar()');
    expect(indexSrc).toContain('alive = false');
  });

  it('A2: FloatingCloud/FloatingSparkle 清 timeout 并停 loop', () => {
    expect(indexSrc).toContain('clearTimeout(timer)');
    expect(indexSrc).toContain('loop?.stop()');
  });

  it('A3/A4: EnhancedSmartCard/QuickActionCard 的 loop 能停掉', () => {
    expect(indexSrc).toContain('scaleLoop.stop()');
    expect(indexSrc).toContain('emojiLoop?.stop()');
    expect(indexSrc).toContain('pulseLoop?.stop()');
  });

  it('A5/A6: diary-edit TypingIndicator 和 shimmer loop 有 cleanup', () => {
    expect(diaryEditSrc).toContain('return () => loops.forEach((l) => l.stop())');
    expect(diaryEditSrc).toContain('return () => shimmer.stop()');
  });

  it('A7/A8: 用药/日记空状态的 pulse loop 有 cleanup', () => {
    expect(medicationSrc).toContain('return () => pulse.stop()');
    expect(diarySrc).toContain('return () => pulse.stop()');
  });

  it('A9/A10: share.tsx 的 loading 动画和 sharePulse 有 cleanup', () => {
    expect(shareSrc).toContain('infinite.forEach((a) => a.stop())');
    expect(shareSrc).toContain('if (finished && alive) runProgress()');
  });

  it('A11/A12: joiner 锁屏和登录页 breathe loop 有 cleanup', () => {
    expect(joinerSrc).toContain('return () => pulseLoop.stop()');
    expect(loginSrc).toContain('return () => breatheLoop.stop()');
  });
});

describe('B: TrendChart 派生数据 memo 化', () => {
  it('重计算包在 useMemo 里，依赖只有数据源/周期', () => {
    expect(trendSrc).toContain('const derived = React.useMemo(() => {');
    expect(trendSrc).toContain('[checkIns, diaryMoodMap, period, offset, todayStr, currentYear, anchorMonth, yearLabel]');
  });

  it('render 函数体里不再裸算 yearSleepData', () => {
    // 包裹后首个声明应是 memo 内的缩进版本，不再有顶格裸算
    expect(trendSrc).not.toMatch(/^  const yearSleepData = Array\.from/m);
  });
});

describe('C: 首页头像云端刷新不阻塞首屏', () => {
  it('cloudGetRoomDetail 在后台 then 里刷新，不再 await 阻塞本地读取', () => {
    expect(indexSrc).toContain('cloudGetRoomDetail(roomId).then(');
    // 本地头像先渲染
    expect(indexSrc).toContain('const localPhotoUri = resolveLocalPhotoUri()');
    expect(indexSrc).toContain('setMemberPhotoUri(localPhotoUri)');
  });
});

describe('D: 用药页 focus 云端拉取有缓存门控', () => {
  it('loadMeds 接受 forceCloud，云端段受 shouldRefreshCloudCache 门控', () => {
    expect(medicationSrc).toContain('shouldRefreshCloudCache(roomIdNum, \'medication\', undefined, forceCloud)');
    expect(medicationSrc).toContain('await markCloudCacheFresh(roomIdNum, \'medication\')');
  });

  it('手动下拉刷新强制拉云端', () => {
    expect(medicationSrc).toContain('await loadMeds(true)');
  });
});
