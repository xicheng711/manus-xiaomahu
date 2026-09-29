// 小马虎统一图标库 — emoji 版
// 2026-09-29 大体拍板：线条图标太 simple、AI 方向稿几轮都不对味，
// 直接用原生 emoji —— 识别度高、跟剪贴簿风天然搭、iOS 渲染一致。
// API 保持不变（name / color / size / strokeWidth），color 与 strokeWidth
// 对 emoji 无效，仅为兼容调用方而保留。
import React from 'react';
import { Text } from 'react-native';
import { AppColors } from '@/lib/design-tokens';

export type AppIconName =
  | 'home' | 'checkin' | 'pill' | 'book' | 'family'
  | 'moon' | 'smile' | 'bowl' | 'note' | 'chart'
  | 'sunrise' | 'night' | 'heart' | 'eye'
  | 'clock' | 'bell' | 'pencil' | 'trash' | 'chat' | 'link' | 'megaphone' | 'sun' | 'alert' | 'calendar' | 'zap' | 'copy' | 'plus';

function iconEmoji(name: AppIconName): string {
  switch (name) {
    case 'home': return '🏠';
    case 'checkin': return '✅';
    case 'pill': return '💊';
    case 'book': return '📖';
    case 'family': return '👨‍👩‍👧';
    case 'moon': return '🌙';
    case 'smile': return '😊';
    case 'bowl': return '🍚';
    case 'note': return '📝';
    case 'chart': return '📊';
    case 'sunrise': return '🌅';
    case 'night': return '🌃';
    case 'heart': return '❤️';
    case 'eye': return '👀';
    case 'clock': return '🕐';
    case 'bell': return '🔔';
    case 'pencil': return '✏️';
    case 'trash': return '🗑️';
    case 'chat': return '💬';
    case 'link': return '🔗';
    case 'megaphone': return '📢';
    case 'sun': return '☀️';
    case 'alert': return '⚠️';
    case 'calendar': return '📅';
    case 'zap': return '⚡';
    case 'copy': return '📋';
    case 'plus': return '➕';
  }
}

export function AppIcon({
  name,
  color: _color,
  size = 24,
  strokeWidth: _strokeWidth = 2,
}: {
  name: AppIconName;
  color: string;
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <Text
      style={{ fontSize: size, lineHeight: size * 1.25, textAlign: 'center' }}
      accessibilityRole="image"
    >
      {iconEmoji(name)}
    </Text>
  );
}

// ─── 底部 Tab 配置：label 与图标名；idleColor 保留字段（emoji 不吃 color）───
export const TAB_CONFIG: Record<string, { label: string; icon: AppIconName; idleColor: string }> = {
  index:      { label: '首页',     icon: 'home',    idleColor: '#DCA78F' },
  checkin:    { label: '每日打卡', icon: 'checkin', idleColor: '#9CC0A4' },
  medication: { label: '用药记录', icon: 'pill',    idleColor: '#A3BBD9' },
  diary:      { label: '日记',     icon: 'book',    idleColor: '#C2AEE2' },
  family:     { label: '家人共享', icon: 'family',  idleColor: '#E7BE8A' },
};

export const TAB_ACTIVE_BG = AppColors.coral.primary; // '#E8897B'
export const TAB_ACTIVE_LABEL = AppColors.coral.primary;
