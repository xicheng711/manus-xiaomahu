// 小马虎统一图标库 — 版本 C「利落高级」
// 2px 圆头圆角线条（Lucide/Feather 标准），24x24 视图，与底部 Tab 同风格，用于全 app 小图标统一。
import React from 'react';
import Svg, { Path, Rect, Circle } from 'react-native-svg';
import { AppColors } from '@/lib/design-tokens';

export type AppIconName =
  | 'home' | 'checkin' | 'pill' | 'book' | 'family'
  | 'moon' | 'smile' | 'bowl' | 'note' | 'chart'
  | 'sunrise' | 'night' | 'heart' | 'eye'
  | 'clock' | 'bell' | 'pencil' | 'trash' | 'chat' | 'link' | 'megaphone' | 'sun' | 'alert' | 'calendar' | 'zap' | 'copy' | 'plus';

function IconPaths({ name }: { name: AppIconName }) {
  switch (name) {
    case 'home':
      return (<>
        <Path d="M3.8 11.2 12 3.8l8.2 7.4" />
        <Path d="M6 9.4V20h12V9.4" />
        <Path d="M10.2 20v-5h3.6v5" />
      </>);
    case 'checkin':
      return (<>
        <Rect x="7" y="4.8" width="10" height="15.4" rx="2" />
        <Path d="M9.8 4.8V3.5a1 1 0 0 1 1-1h2.4a1 1 0 0 1 1 1v1.3" />
        <Path d="M10 13.2l2.1 2.1 3.3-4.2" />
      </>);
    case 'pill':
      return (<>
        <Rect x="4.8" y="9" width="14.4" height="6" rx="3" transform="rotate(-45 12 12)" />
        <Path d="M9.8 14.2l4.4-4.4" />
      </>);
    case 'book':
      return (<>
        <Path d="M12 5.8C10 4.4 7.8 4 5.5 4.5v14.9c2.3-.5 4.5-.1 6.5 1.3 2-1.4 4.2-1.8 6.5-1.3V4.5C16.2 4 14 4.4 12 5.8Z" />
        <Path d="M12 5.8v14.9" />
      </>);
    case 'family':
      return (<>
        <Circle cx="9.5" cy="8" r="3" />
        <Path d="M3.5 19.5c.6-3.6 3-5.4 6-5.4s5.4 1.8 6 5.4" />
        <Circle cx="16.8" cy="8.5" r="2.4" />
        <Path d="M15.2 14.3c2.3.6 3.9 2.1 4.3 4.7" />
      </>);
    case 'moon':
      return (<Path d="M19.5 14.2A7.8 7.8 0 1 1 9.8 4.5a6.3 6.3 0 0 0 9.7 9.7Z" />);
    case 'smile':
      return (<>
        <Circle cx="12" cy="12" r="8.5" />
        <Path d="M9 9.6h.01" />
        <Path d="M15 9.6h.01" />
        <Path d="M8.6 13.8c.9 1.7 2.1 2.5 3.4 2.5s2.5-.8 3.4-2.5" />
      </>);
    case 'bowl':
      return (<>
        <Path d="M4 11.5h16" />
        <Path d="M6.5 11.5a5.5 5.5 0 0 0 11 0" />
        <Path d="M10 18.6h4" />
      </>);
    case 'note':
      return (<>
        <Rect x="6" y="4.5" width="12" height="16" rx="2.5" />
        <Path d="M9.5 4.5V3.2a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.3" />
        <Path d="M9.3 10.5h5.4" />
        <Path d="M9.3 14h5.4" />
        <Path d="M9.3 17.5h3" />
      </>);
    case 'chart':
      return (<>
        <Path d="M4 4v15.5a1 1 0 0 0 1 1H20" />
        <Path d="M8.5 15.5v-3.5" />
        <Path d="M12.5 15.5v-6.5" />
        <Path d="M16.5 15.5V11" />
      </>);
    case 'sunrise':
      return (<>
        <Path d="M12 3v6.5" />
        <Path d="M9.3 5.7 12 3l2.7 2.7" />
        <Path d="M6.2 15a5.8 5.8 0 0 1 11.6 0" />
        <Path d="M4 18.2h16" />
      </>);
    case 'sun':
      return (<>
        <Circle cx="12" cy="12" r="4" />
        <Path d="M12 2.5v2.5" />
        <Path d="M12 19v2.5" />
        <Path d="M2.5 12H5" />
        <Path d="M19 12h2.5" />
        <Path d="M5.3 5.3l1.8 1.8" />
        <Path d="M16.9 16.9l1.8 1.8" />
        <Path d="M18.7 5.3l-1.8 1.8" />
        <Path d="M7.1 16.9l-1.8 1.8" />
      </>);
    case 'night':
      return (<Path d="M19.8 13.8A7.6 7.6 0 1 1 10.2 4.2a6.1 6.1 0 0 0 9.6 9.6Z" />);
    case 'heart':
      return (<Path d="M12 20.5C7 16.5 3.5 13.3 3.5 9.6A4.6 4.6 0 0 1 8.1 5c1.6 0 3 .8 3.9 2.1A4.6 4.6 0 0 1 15.9 5a4.6 4.6 0 0 1 4.6 4.6c0 3.7-3.5 6.9-8.5 10.9Z" />);
    case 'eye':
      return (<>
        <Path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12Z" />
        <Circle cx="12" cy="12" r="2.8" />
      </>);
    case 'clock':
      return (<>
        <Circle cx="12" cy="12" r="8.5" />
        <Path d="M12 7.5V12l3 2" />
      </>);
    case 'bell':
      return (<>
        <Path d="M6 8.5a6 6 0 0 1 12 0c0 6.5 2.8 8.5 2.8 8.5H3.2S6 15 6 8.5" />
        <Path d="M10.3 20.5a1.94 1.94 0 0 0 3.4 0" />
      </>);
    case 'pencil':
      return (<Path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />);
    case 'trash':
      return (<>
        <Path d="M3 6h18" />
        <Path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
        <Path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </>);
    case 'chat':
      return (<Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />);
    case 'link':
      return (<>
        <Path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <Path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </>);
    case 'megaphone':
      return (<>
        <Path d="m3 11 18-5v12L3 14v-3Z" />
        <Path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
      </>);
    case 'alert':
      return (<>
        <Path d="M12 3.5 21.5 20h-19Z" />
        <Path d="M12 9.5v4.5" />
        <Path d="M12 17h.01" />
      </>);
    case 'calendar':
      return (<>
        <Rect x="4.5" y="5.5" width="15" height="15" rx="2.5" />
        <Path d="M4.5 10h15" />
        <Path d="M8.5 3.5v4" />
        <Path d="M15.5 3.5v4" />
      </>);
    case 'zap':
      return (<Path d="M13 2.5 3.5 13.5h8.5l-1 8 9.5-11h-8.5l1-8Z" />);
    case 'copy':
      return (<>
        <Rect x="9" y="9" width="11" height="11" rx="2.5" />
        <Path d="M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5" />
      </>);
    case 'plus':
      return (<Path d="M12 5v14M5 12h14" />);
  }
}

export function AppIcon({
  name,
  color,
  size = 24,
  strokeWidth = 2,
}: {
  name: AppIconName;
  color: string;
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <IconPaths name={name} />
    </Svg>
  );
}

// ─── 底部 Tab 配置：未选中为各 tab 淡彩色，选中统一珊瑚 ───
export const TAB_CONFIG: Record<string, { label: string; icon: AppIconName; idleColor: string }> = {
  index:      { label: '首页',     icon: 'home',    idleColor: '#DCA78F' },
  checkin:    { label: '每日打卡', icon: 'checkin', idleColor: '#9CC0A4' },
  medication: { label: '用药记录', icon: 'pill',    idleColor: '#A3BBD9' },
  diary:      { label: '日记',     icon: 'book',    idleColor: '#C2AEE2' },
  family:     { label: '家人共享', icon: 'family',  idleColor: '#E7BE8A' },
};

export const TAB_ACTIVE_BG = AppColors.coral.primary; // '#E8897B'
export const TAB_ACTIVE_LABEL = AppColors.coral.primary;
