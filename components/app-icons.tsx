// 小马虎统一图标库 — SF Symbols 版
// 2026-09-29 大体拍板：图标与整体都往 Apple 设计靠。
// 图标改用 iOS 原生 SF Symbols（expo-symbols SymbolView），
// 跟系统图标同一语言：单色 tint、medium 字重，小尺寸依然清晰。
// API 保持不变（name / color / size），weight 可选；
// strokeWidth 保留仅为兼容旧调用方。
import React from 'react';
import type { SymbolViewProps, SymbolWeight } from 'expo-symbols';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { AppColors } from '@/lib/design-tokens';

export type AppIconName =
  | 'home' | 'checkin' | 'pill' | 'book' | 'family'
  | 'moon' | 'smile' | 'bowl' | 'note' | 'chart'
  | 'sunrise' | 'night' | 'heart' | 'eye'
  | 'clock' | 'bell' | 'pencil' | 'trash' | 'chat' | 'link' | 'megaphone' | 'sun' | 'alert' | 'calendar' | 'zap' | 'copy' | 'plus';

const SYMBOL_MAP: Record<AppIconName, SymbolViewProps['name']> = {
  home: 'house.fill',
  checkin: 'checkmark.circle.fill',
  pill: 'pill.fill',
  book: 'book.fill',
  family: 'person.2.fill',
  moon: 'moon.fill',
  smile: 'face.smiling.fill',
  bowl: 'fork.knife',
  note: 'note.text',
  chart: 'chart.bar.fill',
  sunrise: 'sunrise.fill',
  night: 'moon.stars.fill',
  heart: 'heart.fill',
  eye: 'eye.fill',
  clock: 'clock.fill',
  bell: 'bell.fill',
  pencil: 'pencil',
  trash: 'trash.fill',
  chat: 'message.fill',
  link: 'link',
  megaphone: 'megaphone.fill',
  sun: 'sun.max.fill',
  alert: 'exclamationmark.triangle.fill',
  calendar: 'calendar',
  zap: 'bolt.fill',
  copy: 'doc.on.doc.fill',
  plus: 'plus',
};

export function AppIcon({
  name,
  color,
  size = 24,
  weight = 'medium',
  strokeWidth: _strokeWidth = 2,
}: {
  name: AppIconName;
  color: string;
  size?: number;
  weight?: SymbolWeight;
  strokeWidth?: number;
}) {
  return (
    <IconSymbol
      name={SYMBOL_MAP[name]}
      size={size}
      color={color}
      weight={weight}
    />
  );
}

// ─── 底部 Tab 配置：label 与图标名 ───
// Apple 式 Tab 栏：未选中统一系统灰，高亮用珊瑚 accent，不再每 tab 独立淡彩色。
export const TAB_CONFIG: Record<string, { label: string; icon: AppIconName }> = {
  index:      { label: '首页',     icon: 'home' },
  checkin:    { label: '每日打卡', icon: 'checkin' },
  medication: { label: '用药记录', icon: 'pill' },
  diary:      { label: '日记',     icon: 'book' },
  family:     { label: '家人共享', icon: 'family' },
};

export const TAB_ACTIVE_BG = AppColors.coral.primary; // 保留导出以兼容旧引用
export const TAB_ACTIVE_LABEL = AppColors.coral.primary;
export const TAB_INACTIVE_TINT = '#8E8E93'; // iOS 系统灰
