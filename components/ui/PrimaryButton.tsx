import React, { useRef } from 'react';
import { TouchableOpacity, Text, Animated, StyleSheet, ViewStyle, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Gradients, Radius, Shadows, Typography, AppColors } from '@/lib/design-tokens';
import { createPressAnimation } from '@/lib/design-tokens/motion';

interface PrimaryButtonProps {
  onPress: () => void;
  label: string;
  icon?: string;
  colors?: readonly [string, string, ...string[]];
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

export function PrimaryButton({
  onPress,
  label,
  icon,
  colors,
  loading,
  disabled,
  style,
}: PrimaryButtonProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const gradientColors = colors ?? Gradients.green;

  const handlePress = () => {
    if (disabled || loading) return;
    createPressAnimation(scaleAnim, onPress);
  };

  return (
    <Animated.View style={[{ transform: [{ scale: scaleAnim }] }, style]}>
      <TouchableOpacity onPress={handlePress} activeOpacity={0.88} disabled={disabled || loading}>
        <LinearGradient
          colors={gradientColors as any}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[styles.btn, disabled && styles.disabled]}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              {icon && <Text style={styles.icon}>{icon}</Text>}
              <Text style={styles.label}>{label}</Text>
            </>
          )}
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: Radius.button,
    ...(Shadows as any).elevated,
  },
  disabled: {
    opacity: 0.6,
  },
  icon: {
    fontSize: 18,
  },
  label: {
    ...Typography.body,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
