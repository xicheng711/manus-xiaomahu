/**
 * join.tsx — Deep link handler for family invite
 * Handles: manusxiaomahu://join?code=XXXXXX
 * Redirects to the family tab with the join code pre-filled.
 */
import { useEffect } from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { AppColors } from '@/lib/design-tokens';

export default function JoinScreen() {
  const params = useLocalSearchParams<{ code?: string }>();

  useEffect(() => {
    const code = params.code?.toUpperCase() ?? '';
    // Small delay to let the app fully initialize before navigating
    const timer = setTimeout(() => {
      if (code) {
        router.replace({
          pathname: '/(tabs)/family',
          params: { joinCode: code },
        } as any);
      } else {
        router.replace('/(tabs)/family' as any);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [params.code]);

  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>🐾</Text>
      <ActivityIndicator size="large" color={AppColors.coral.primary} style={{ marginBottom: 16 }} />
      <Text style={styles.text}>正在打开家庭空间…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F0FF',
    gap: 12,
  },
  emoji: { fontSize: 52, marginBottom: 8 },
  text: { fontSize: 16, color: '#5B3A8E', fontWeight: '600' },
});
