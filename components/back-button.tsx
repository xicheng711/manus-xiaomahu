import React, { useRef } from 'react';
import { TouchableOpacity, Text, StyleSheet, Animated, View, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { COLORS, RADIUS, pressAnimation } from '@/lib/animations';
import * as Haptics from 'expo-haptics';

interface BackButtonProps {
  onPress?: () => void;
  label?: string;
  style?: object;
  light?: boolean; // white text for dark backgrounds
}

export function BackButton({ onPress, label = '返回', style, light = false }: BackButtonProps) {
  const router = useRouter();
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  function handlePress() {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Slide left animation
    Animated.sequence([
      Animated.timing(slideAnim, { toValue: -4, duration: 80, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, speed: 20, bounciness: 6, useNativeDriver: true }),
    ]).start();
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.92, duration: 80, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, speed: 20, bounciness: 6, useNativeDriver: true }),
    ]).start(() => {
      if (onPress) {
        onPress();
      } else {
        router.back();
      }
    });
  }

  return (
    <Animated.View style={[{ transform: [{ scale: scaleAnim }, { translateX: slideAnim }] }, style]}>
      <TouchableOpacity
        style={[styles.btn, light && styles.btnLight]}
        onPress={handlePress}
        activeOpacity={0.8}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Text style={[styles.chevron, light && styles.chevronLight]}>‹</Text>
        <Text style={[styles.label, light && styles.labelLight]}>{label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.pill,
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  btnLight: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  chevron: {
    fontSize: 24,
    fontWeight: '300',
    color: COLORS.primary,
    lineHeight: 26,
    marginTop: -2,
  },
  chevronLight: {
    color: '#fff',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primary,
    letterSpacing: -0.2,
  },
  labelLight: {
    color: '#fff',
  },
});
