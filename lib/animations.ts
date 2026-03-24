/**
 * Shared animation utilities & polished theme constants
 * Inspired by Coolors palettes, uiverse components, and iOS HIG
 */
import { Animated, Easing, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

// ─── Color Palette (Premium Warm Care) ──────────────────────────────────────
export const COLORS = {
  bg: '#F7F1F3',
  bgCard: '#FFFFFF',
  bgSoft: '#F8F2EE',
  bgMint: '#E8F3EA',
  bgPink: '#FDEAE6',
  bgBlue: '#F2EDFB',

  primary: '#F28C7C',
  primaryLight: '#FFA28C',
  primaryDark: '#E07060',
  primaryBg: '#FDEAE6',

  secondary: '#8EB89A',
  secondaryLight: '#9CC9A7',
  secondaryDark: '#6F9D7B',
  secondaryBg: '#E8F3EA',

  accent: '#E9C58F',
  accentPink: '#F28C7C',
  accentPeach: '#FAF1E2',

  text: '#2F2A2E',
  textSecondary: '#7B7580',
  textMuted: '#7B7580',
  textLight: '#A49DA8',

  success: '#4ADE80',
  successDark: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',

  border: '#E8DDE5',
  borderLight: '#F5F5F5',
  borderAccent: '#FDEAE6',

  shadow: 'rgba(88, 64, 78, 0.08)',
};

// ─── Spacing ─────────────────────────────────────────────────────────────────
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

// ─── Border Radius ───────────────────────────────────────────────────────────
export const RADIUS = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 22,
  xxl: 28,
  pill: 50,
  circle: 999,
};

// ─── Shadows ─────────────────────────────────────────────────────────────────
export const SHADOWS = {
  sm: {
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  md: {
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  lg: {
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 5,
  },
  glow: (color: string) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  }),
};

// ─── Animation Helpers ───────────────────────────────────────────────────────

/** Fade in with optional upward slide */
export function fadeInUp(
  fadeAnim: Animated.Value,
  slideAnim: Animated.Value,
  options?: { duration?: number; delay?: number; distance?: number }
) {
  const { duration = 500, delay = 0, distance = 20 } = options ?? {};
  fadeAnim.setValue(0);
  slideAnim.setValue(distance);
  Animated.parallel([
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }),
    Animated.timing(slideAnim, {
      toValue: 0,
      duration,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }),
  ]).start();
}

/** Spring bounce animation */
export function springBounce(
  anim: Animated.Value,
  toValue: number = 1,
  options?: { speed?: number; bounciness?: number }
) {
  const { speed = 12, bounciness = 8 } = options ?? {};
  Animated.spring(anim, {
    toValue,
    speed,
    bounciness,
    useNativeDriver: true,
  }).start();
}

/** Pulse animation (repeating) */
export function pulseLoop(anim: Animated.Value, options?: { min?: number; max?: number; duration?: number }) {
  const { min = 0.95, max = 1.05, duration = 1500 } = options ?? {};
  Animated.loop(
    Animated.sequence([
      Animated.timing(anim, { toValue: max, duration: duration / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(anim, { toValue: min, duration: duration / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])
  ).start();
}

/** Staggered fade-in for list items */
export function staggerFadeIn(anims: Animated.Value[], options?: { delay?: number; duration?: number }) {
  const { delay = 80, duration = 400 } = options ?? {};
  anims.forEach((anim, i) => {
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration,
      delay: i * delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  });
}

/** Button press scale animation with haptic */
export function pressAnimation(scaleAnim: Animated.Value, callback?: () => void) {
  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  Animated.sequence([
    Animated.timing(scaleAnim, { toValue: 0.94, duration: 80, useNativeDriver: true }),
    Animated.spring(scaleAnim, { toValue: 1, speed: 20, bounciness: 6, useNativeDriver: true }),
  ]).start(() => callback?.());
}

/** Celebration burst - multiple emojis flying out */
export function celebrationBurst(anims: { scale: Animated.Value; opacity: Animated.Value; translateY: Animated.Value }[]) {
  anims.forEach((a, i) => {
    a.scale.setValue(0);
    a.opacity.setValue(1);
    a.translateY.setValue(0);
    Animated.parallel([
      Animated.spring(a.scale, { toValue: 1, speed: 8 + i * 2, bounciness: 12, useNativeDriver: true }),
      Animated.timing(a.translateY, { toValue: -(60 + Math.random() * 40), duration: 800, delay: i * 100, useNativeDriver: true }),
      Animated.timing(a.opacity, { toValue: 0, duration: 800, delay: i * 100 + 400, useNativeDriver: true }),
    ]).start();
  });
}

/** Shimmer loading effect value */
export function shimmerLoop(anim: Animated.Value) {
  Animated.loop(
    Animated.timing(anim, {
      toValue: 1,
      duration: 1200,
      easing: Easing.linear,
      useNativeDriver: true,
    })
  ).start();
}

/** Typing indicator dots animation */
export function typingDots(dots: Animated.Value[]) {
  dots.forEach((dot, i) => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(dot, { toValue: -6, duration: 300, delay: i * 150, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(dot, { toValue: 0, duration: 300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  });
}
