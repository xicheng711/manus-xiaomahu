import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { View, Text } from 'react-native';

/**
 * Catch-all route for unmatched deep links (e.g. manusxiaomahu:///).
 * Instead of showing an error, redirect to the family tab.
 */
export default function NotFoundScreen() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to family tab after a short delay to ensure navigator is ready
    const timer = setTimeout(() => {
      try {
        router.replace('/(tabs)/family' as any);
      } catch (e) {
        console.warn('[+not-found] redirect failed:', e);
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF8F0' }}>
      <Text style={{ fontSize: 16, color: '#666' }}>正在跳转...</Text>
    </View>
  );
}
