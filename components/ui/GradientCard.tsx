import React from 'react';
import { ViewStyle, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Radius, Spacing, Shadows } from '@/lib/design-tokens';

interface GradientCardProps {
  children: React.ReactNode;
  colors: readonly [string, string, ...string[]];
  style?: ViewStyle | ViewStyle[];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
}

export function GradientCard({ children, colors, style, start, end }: GradientCardProps) {
  return (
    <LinearGradient
      colors={colors as any}
      start={start ?? { x: 0, y: 0 }}
      end={end ?? { x: 0, y: 1 }}
      style={[styles.card, style]}
    >
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.cardLarge,
    padding: Spacing.cardPadding,
    ...Shadows.card,
  },
});
