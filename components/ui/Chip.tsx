import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { AppColors, Spacing, Radius, Typography } from '@/lib/design-tokens';

interface ChipProps {
  label: string;
  emoji?: string;
  selected?: boolean;
  onPress?: () => void;
  color?: string;
}

export function Chip({ label, emoji, selected, onPress, color }: ChipProps) {
  const bgColor = selected
    ? (color ?? AppColors.green.primary) + '18'
    : AppColors.bg.secondary;
  const textColor = selected
    ? (color ?? AppColors.green.strong)
    : AppColors.text.secondary;

  const content = (
    <View style={[styles.chip, { backgroundColor: bgColor }]}>
      {emoji && <Text style={styles.emoji}>{emoji}</Text>}
      <Text style={[styles.label, { color: textColor }]}>{label}</Text>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.chipPaddingH,
    paddingVertical: Spacing.chipPaddingV,
    borderRadius: Radius.chip,
  },
  emoji: {
    fontSize: 14,
  },
  label: {
    ...Typography.caption,
    fontWeight: '600',
  },
});
