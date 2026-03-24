import React from 'react';
import { View, ViewStyle, StyleSheet } from 'react-native';
import { AppColors, Radius, Spacing, Shadows } from '@/lib/design-tokens';

interface BaseCardProps {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  padding?: number;
  radius?: number;
}

export function BaseCard({ children, style, padding, radius }: BaseCardProps) {
  return (
    <View
      style={[
        styles.card,
        padding !== undefined && { padding },
        radius !== undefined && { borderRadius: radius },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: AppColors.surface.card,
    borderRadius: Radius.cardLarge,
    padding: Spacing.cardPadding,
    borderWidth: 1,
    borderColor: AppColors.border.light,
    ...Shadows.card,
  },
});
