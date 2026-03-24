import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AppColors, Spacing, Typography } from '@/lib/design-tokens';

interface SectionHeaderProps {
  title: string;
  emoji?: string;
  subtitle?: string;
}

export function SectionHeader({ title, emoji, subtitle }: SectionHeaderProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {emoji ? `${emoji} ` : ''}{title}
      </Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.space16,
    gap: Spacing.titleSubGap,
  },
  title: {
    ...Typography.sectionTitle,
    color: AppColors.text.primary,
  },
  subtitle: {
    ...Typography.bodySmall,
    color: AppColors.text.secondary,
  },
});
