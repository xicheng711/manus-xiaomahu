import "@/global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { Alert, Platform } from "react-native";
import "@/lib/_core/nativewind-pressable";
import { ThemeProvider } from "@/lib/theme-provider";
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import type { EdgeInsets, Metrics, Rect } from "react-native-safe-area-context";

import { trpc, createTRPCClient } from "@/lib/trpc";
import { initManusRuntime, subscribeSafeAreaInsets } from "@/lib/_core/manus-runtime";
import { FamilyProvider, useFamilyContext } from "@/lib/family-context";
import { WeatherProvider } from "@/lib/weather-context";
import { initCloudSync } from "@/lib/cloud-sync";
import { registerPushToken } from "@/lib/notifications";
import * as Notifications from "expo-notifications";

const DEFAULT_WEB_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULT_WEB_FRAME: Rect = { x: 0, y: 0, width: 0, height: 0 };

export const unstable_settings = {
  anchor: "(tabs)",
};

function NotificationNavigator() {
  const router = useRouter();
  const { ready, memberships, activeMembership, switchFamily } = useFamilyContext();
  const [pendingData, setPendingData] = useState<any>(null);
  const handledIds = useRef(new Set<string>());

  useEffect(() => {
    if (Platform.OS === "web") return;
    const capture = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const id = response.notification.request.identifier;
      if (handledIds.current.has(id)) return;
      handledIds.current.add(id);
      setPendingData(response.notification.request.content.data as any);
    };
    const subscription = Notifications.addNotificationResponseReceivedListener(capture);
    Notifications.getLastNotificationResponseAsync().then(response => {
      capture(response);
      if (response) Notifications.clearLastNotificationResponseAsync().catch(() => {});
    }).catch(() => {});
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!pendingData || !ready) return;
    const data = pendingData;
    setPendingData(null);
    void (async () => {
      const targetRoomId = data?.roomId ? String(data.roomId) : null;
      if (targetRoomId && activeMembership?.familyId !== targetRoomId) {
        if (!memberships.some(item => item.familyId === targetRoomId)) {
          Alert.alert('无法打开这条通知', '你已不在该通知所属的家庭中。');
          return;
        }
        await switchFamily(targetRoomId);
      }

      const refresh = String(Date.now());
      switch (data?.screen || 'family') {
        case 'diary':
          if (data?.diaryId) {
            router.push({ pathname: '/diary-edit', params: { id: `cloud_${data.diaryId}`, roomId: targetRoomId ?? undefined, refresh } } as any);
          } else {
            router.push({ pathname: '/(tabs)/diary', params: { refresh } } as any);
          }
          break;
        case 'checkin':
          router.push({ pathname: '/(tabs)/checkin', params: { refresh } } as any);
          break;
        case 'medication':
          router.push({ pathname: '/(tabs)/medication', params: { refresh } } as any);
          break;
        case 'home':
          router.push({ pathname: '/(tabs)/index', params: { refresh } } as any);
          break;
        case 'family':
        default:
          router.push({ pathname: '/(tabs)/family', params: { refresh } } as any);
          break;
      }
    })().catch(error => {
      console.warn('[Layout] notification navigation failed:', error);
      Alert.alert('暂时无法打开通知', '请稍后从应用内重试。');
    });
  }, [pendingData, ready, memberships, activeMembership?.familyId, router, switchFamily]);

  return null;
}

export default function RootLayout() {
  const initialInsets = initialWindowMetrics?.insets ?? DEFAULT_WEB_INSETS;
  const initialFrame = initialWindowMetrics?.frame ?? DEFAULT_WEB_FRAME;

  const [insets, setInsets] = useState<EdgeInsets>(initialInsets);
  const [frame, setFrame] = useState<Rect>(initialFrame);
  // Initialize Manus runtime for cookie injection from parent container
  useEffect(() => {
    initManusRuntime();
  }, []);

  // Register push token for cross-device notifications (after cloud sync is ready)
  useEffect(() => {
    // App 启动时延迟注册 push token：
    // - 2s: 第一次尝试（大多数情况下 session token 已就绪）
    // - 6s: 备用重试（防止网络慢导致首次失败）
    // - 15s: 最后一次保障（覆盖异常慢启动场景）
    const timer1 = setTimeout(() => { registerPushToken().catch(() => {}); }, 2000);
    const timer2 = setTimeout(() => { registerPushToken().catch(() => {}); }, 6000);
    const timer3 = setTimeout(() => { registerPushToken().catch(() => {}); }, 15000);
    return () => { clearTimeout(timer1); clearTimeout(timer2); clearTimeout(timer3); };
  }, []);

  const handleSafeAreaUpdate = useCallback((metrics: Metrics) => {
    setInsets(metrics.insets);
    setFrame(metrics.frame);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const unsubscribe = subscribeSafeAreaInsets(handleSafeAreaUpdate);
    return () => unsubscribe();
  }, [handleSafeAreaUpdate]);

  // Create clients once and reuse them
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Disable automatic refetching on window focus for mobile
            refetchOnWindowFocus: false,
            // Retry failed requests once
            retry: 1,
          },
        },
      }),
  );
  const [trpcClient] = useState(() => {
    const client = createTRPCClient();
    // Initialize cloud sync layer with the tRPC client so family functions work
    initCloudSync(client);
    return client;
  });

  // Ensure minimum 8px padding for top and bottom on mobile
  const providerInitialMetrics = useMemo(() => {
    const metrics = initialWindowMetrics ?? { insets: initialInsets, frame: initialFrame };
    return {
      ...metrics,
      insets: {
        ...metrics.insets,
        top: Math.max(metrics.insets.top, 16),
        bottom: Math.max(metrics.insets.bottom, 12),
      },
    };
  }, [initialInsets, initialFrame]);

  const content = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          {/* Default to hiding native headers so raw route segments don't appear (e.g. "(tabs)", "products/[id]"). */}
          {/* If a screen needs the native header, explicitly enable it and set a human title via Stack.Screen options. */}
          {/* in order for ios apps tab switching to work properly, use presentation: "fullScreenModal" for login page, whenever you decide to use presentation: "modal*/}
          <FamilyProvider>
            <NotificationNavigator />
            <WeatherProvider>
              <Stack screenOptions={{
                  headerShown: false,
                  gestureEnabled: true,
                  fullScreenGestureEnabled: true,
                  animationTypeForReplace: 'push',
                }}>
                <Stack.Screen name="(tabs)" options={{ gestureEnabled: false, fullScreenGestureEnabled: false }} />
                <Stack.Screen name="(modals)" options={{ presentation: 'modal' }} />
                <Stack.Screen name="oauth/callback" />
                <Stack.Screen name="login" options={{ presentation: 'fullScreenModal' }} />
                <Stack.Screen name="onboarding" />
                <Stack.Screen name="checkin" />
                <Stack.Screen name="assistant" />
                <Stack.Screen name="profile" />
                <Stack.Screen name="share" />
                {/* 编辑日记时禁用 iOS 左滑返回；用户必须通过页面内的保存/取消确认离开。 */}
                <Stack.Screen name="diary-edit" options={{ gestureEnabled: false, fullScreenGestureEnabled: false }} />
                <Stack.Screen name="diary-detail" />
                <Stack.Screen name="join" />
              </Stack>
            </WeatherProvider>
          </FamilyProvider>
          <StatusBar style="auto" />
        </QueryClientProvider>
      </trpc.Provider>
    </GestureHandlerRootView>
  );

  const shouldOverrideSafeArea = Platform.OS === "web";

  if (shouldOverrideSafeArea) {
    return (
      <ThemeProvider>
        <SafeAreaProvider initialMetrics={providerInitialMetrics}>
          <SafeAreaFrameContext.Provider value={frame}>
            <SafeAreaInsetsContext.Provider value={insets}>
              {content}
            </SafeAreaInsetsContext.Provider>
          </SafeAreaFrameContext.Provider>
        </SafeAreaProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <SafeAreaProvider initialMetrics={providerInitialMetrics}>{content}</SafeAreaProvider>
    </ThemeProvider>
  );
}
