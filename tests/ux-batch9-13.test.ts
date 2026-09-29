/**
 * UX/性能审计 batch13：首屏与高频页的速度修复。
 * - M3：两个 Context value 用 useMemo 包住，避免 18 个消费方联动重渲染
 * - M1：打卡表单右滑返回手势配置修正（之前右滑永远无法激活）
 * - H5：首页三个本地读取并行，不再串行 waterfall
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('Context value memo 化（M3）', () => {
  it('family-context 的 Provider value 用 useMemo 包住', () => {
    const src = read('lib/family-context.tsx');
    expect(src).toContain('const contextValue = useMemo(() => ({');
    expect(src).toContain('<FamilyContext.Provider value={contextValue}>');
    // 依赖必须齐全，否则闭包过期
    expect(src).toContain('switchFamily, leaveFamily, deleteFamily, refresh,');
  });

  it('weather-context 的 Provider value 用 useMemo 包住', () => {
    const src = read('lib/weather-context.tsx');
    expect(src).toContain('const contextValue = useMemo(() => ({');
    expect(src).toContain('<WeatherContext.Provider value={contextValue}>');
  });
});

describe('打卡表单右滑返回手势（M1）', () => {
  it('右滑方向能激活手势，且竖向滚动优先', () => {
    const src = read('app/(tabs)/checkin.tsx');
    // [-999, 20]：右移超 20px 激活；之前 [-20, 999] 下右滑永不激活
    expect(src).toContain('.activeOffsetX([-999, 20])');
    expect(src).not.toContain('.activeOffsetX([-20, 999])');
    // 不跟内层 ScrollView 打架
    expect(src).toContain('.failOffsetY([-15, 15])');
    // 触发判定保持：右滑 60px 以上、竖向偏移不大才返回
    expect(src).toContain('if (e.translationX > 60 && Math.abs(e.translationY) < 80)');
  });
});

describe('首页本地读取并行（H5）', () => {
  it('今日打卡/当年打卡/日记三个本地读一次 Promise.all', () => {
    const src = read('app/(tabs)/index.tsx');
    const loadData = src.slice(src.indexOf('const fid = requestedFamilyId;'));
    expect(loadData).toContain('const [today, all, diaries] = await Promise.all([');
    expect(loadData).toContain('getTodayCheckIn(fid),');
    expect(loadData).toContain('getCheckInsForHome(fid),');
    expect(loadData).toContain('getDiaryEntriesForHome(fid, 20),');
  });
});
