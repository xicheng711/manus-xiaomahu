import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HapticTab } from "@/components/haptic-tab";
import { Platform, View, Text, StyleSheet, TouchableOpacity, Animated } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { AppColors, Gradients } from "@/lib/design-tokens";
import { useFamilyContext } from "@/lib/family-context";
import { useRef, useState, useCallback } from "react";

const TAB_CONFIG: Record<string, {
  emoji: string;
  gradient: readonly [string, string];
  label: string;
}> = {
  index:      { emoji: "🏠", gradient: Gradients.coral,      label: "首页" },
  checkin:    { emoji: "✅", gradient: Gradients.green,       label: "每日打卡" },
  medication: { emoji: "💊", gradient: Gradients.peach,       label: "用药记录" },
  diary:      { emoji: "📔", gradient: Gradients.purple,      label: "日记" },
  family:     { emoji: "👥", gradient: Gradients.navActive,   label: "家人共享" },
};

const JOINER_TABS = new Set(["index", "family", "diary"]);

function TabIcon({
  route,
  focused,
  isJoiner,
}: {
  route: string;
  focused: boolean;
  isJoiner: boolean;
}) {
  const cfg = TAB_CONFIG[route] ?? {
    emoji: "⭕", gradient: ["#ccc", "#aaa"] as readonly [string, string], label: "",
  };

  const accessible = !isJoiner || JOINER_TABS.has(route);
  const showActive = focused || (isJoiner && JOINER_TABS.has(route));

  return (
    <View style={[styles.tabItem, !accessible && styles.tabItemFaded]}>
      {showActive ? (
        <LinearGradient
          colors={cfg.gradient as any}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.iconCircle}
        >
          <Text style={styles.activeEmoji}>{cfg.emoji}</Text>
        </LinearGradient>
      ) : (
        <View style={[styles.iconCircle, styles.inactiveCircle]}>
          <Text style={styles.inactiveEmoji}>{cfg.emoji}</Text>
        </View>
      )}
      <Text style={[
        styles.tabLabel,
        showActive && { color: cfg.gradient[0], fontWeight: "600" as const },
        !accessible && styles.tabLabelFaded,
      ]} numberOfLines={1}>
        {cfg.label}
      </Text>
    </View>
  );
}

// ─── 禁用 Tab 按钮（joiner 视角，点击时弹出提示） ────────────────────
function DisabledTabButton({
  route,
  isJoiner,
  onShowToast,
}: {
  route: string;
  isJoiner: boolean;
  onShowToast: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.disabledTabBtn}
      activeOpacity={0.7}
      onPress={onShowToast}
      accessibilityRole="button"
      accessibilityLabel="仅主照顾者可操作"
    >
      <TabIcon route={route} focused={false} isJoiner={isJoiner} />
    </TouchableOpacity>
  );
}

// ─── 浮动 Toast 提示 ──────────────────────────────────────────────────
function JoinerToast({ visible }: { visible: boolean }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;

  // 当 visible 变化时触发动画
  if (visible) {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();
  } else {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 8, duration: 300, useNativeDriver: true }),
    ]).start();
  }

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.toast,
        { opacity, transform: [{ translateY }] },
      ]}
    >
      <Text style={styles.toastText}>🔒 仅主照顾者可操作</Text>
    </Animated.View>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const safeBottom = Platform.OS === "web" ? 0 : insets.bottom;

  // TabBar 可见内容高度固定 58px，安全区额外追加
  const TAB_CONTENT_HEIGHT = 58;
  const tabBarHeight = TAB_CONTENT_HEIGHT + safeBottom;

  const { activeMembership } = useFamilyContext();
  const isJoiner = activeMembership?.role === "joiner";

  // Toast 状态
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(() => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastVisible(true);
    toastTimer.current = setTimeout(() => setToastVisible(false), 2000);
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarButton: HapticTab,
          // 禁止左右滑动切换 Tab
          swipeEnabled: false,
          tabBarShowLabel: false,
          tabBarStyle: {
            height: tabBarHeight,
            // 顶部留 4px，底部留安全区（不额外加空白）
            paddingTop: 4,
            paddingBottom: safeBottom,
            paddingHorizontal: 4,
            backgroundColor: AppColors.surface.whiteStrong,
            borderTopWidth: 0,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            shadowColor: '#8B7E74',
            shadowOffset: { width: 0, height: -4 },
            shadowOpacity: 0.06,
            shadowRadius: 20,
            elevation: 16,
            overflow: Platform.OS === "android" ? "hidden" : undefined,
          },
          tabBarItemStyle: {
            paddingVertical: 0,
            height: TAB_CONTENT_HEIGHT,
            alignItems: "center",
            justifyContent: "center",
          },
        }}
      >
        <Tabs.Screen name="index"      options={{ title: "首页",    tabBarIcon: ({ focused }) => <TabIcon route="index"      focused={focused} isJoiner={isJoiner} /> }} />
        <Tabs.Screen name="checkin"    options={{ title: "每日打卡", tabBarIcon: ({ focused }) => <TabIcon route="checkin"    focused={focused} isJoiner={isJoiner} />, ...(isJoiner ? { tabBarButton: () => <DisabledTabButton route="checkin"    isJoiner={isJoiner} onShowToast={showToast} /> } : {}) }} />
        <Tabs.Screen name="medication" options={{ title: "用药记录", tabBarIcon: ({ focused }) => <TabIcon route="medication" focused={focused} isJoiner={isJoiner} />, ...(isJoiner ? { tabBarButton: () => <DisabledTabButton route="medication" isJoiner={isJoiner} onShowToast={showToast} /> } : {}) }} />
        <Tabs.Screen name="diary"      options={{ title: "日记",    tabBarIcon: ({ focused }) => <TabIcon route="diary"      focused={focused} isJoiner={isJoiner} /> }} />
        <Tabs.Screen name="family"     options={{ title: "家人共享", tabBarIcon: ({ focused }) => <TabIcon route="family"     focused={focused} isJoiner={isJoiner} /> }} />
      </Tabs>

      {/* Joiner 操作提示 Toast（浮在 TabBar 上方） */}
      {isJoiner && (
        <JoinerToast visible={toastVisible} />
      )}
    </View>
  );
}

const CIRCLE = 44;

const styles = StyleSheet.create({
  tabItem: {
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    flex: 1,
    minWidth: 56,
  },
  tabItemFaded: {
    opacity: 0.45,
  },
  iconCircle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  inactiveCircle: {
    backgroundColor: '#F5F0ED',
  },
  activeEmoji: {
    fontSize: 22,
    lineHeight: 26,
  },
  inactiveEmoji: {
    fontSize: 20,
    lineHeight: 24,
    opacity: 0.55,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: "400",
    color: AppColors.text.tertiary,
    letterSpacing: 0,
  },
  tabLabelFaded: {
    color: AppColors.text.tertiary,
  },
  disabledTabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 58,
    opacity: 0.5,
  },
  // Toast 样式
  toast: {
    position: 'absolute',
    bottom: 80,
    alignSelf: 'center',
    backgroundColor: 'rgba(40, 32, 28, 0.88)',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 10,
  },
  toastText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
});
