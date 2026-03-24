import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { AppColors, Radius, Spacing, Shadows, Typography, Motion } from '@/lib/design-tokens';

interface MetricCardProps {
  emoji: string;
  label: string;
  value: string;
  accentColor?: string;
  delay?: number;
}

export function MetricCard({ emoji, label, value, accentColor, delay = 0 }: MetricCardProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(Motion.entrance.translateY)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: Motion.entrance.duration,
        delay,
        easing: Motion.entrance.easing,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: Motion.entrance.duration,
        delay,
        easing: Motion.entrance.easing,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={[
        styles.card,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <View style={[styles.iconWrap, accentColor ? { backgroundColor: accentColor + '14' } : {}]}>
        <Text style={styles.emoji}>{emoji}</Text>
      </View>
      <Text style={styles.value} numberOfLines={1}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: AppColors.surface.whiteStrong,
    borderRadius: Radius.cardSmall,
    padding: Spacing.space12,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: AppColors.border.light,
    ...Shadows.soft,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AppColors.bg.soft,
  },
  emoji: {
    fontSize: 20,
  },
  value: {
    ...Typography.bodySmall,
    fontWeight: '700',
    color: AppColors.text.primary,
  },
  label: {
    ...Typography.caption,
    color: AppColors.text.tertiary,
  },
});
