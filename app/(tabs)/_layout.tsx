import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HapticTab } from "@/components/haptic-tab";
import { Platform, View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { AppColors, Gradients, Shadows } from "@/lib/design-tokens";
import { useFamilyContext } from "@/lib/family-context";

const INACTIVE_LABEL = AppColors.nav.inactive;

const TAB_CONFIG: Record<string, {
  emoji: string;
  gradient: readonly [string, string];
  label: string;
}> = {
  index:      { emoji: "🏠", gradient: Gradients.coral,      label: "首页" },
  checkin:    { emoji: "✨", gradient: Gradients.green,       label: "每日打卡" },
  medication: { emoji: "💊", gradient: Gradients.peach,       label: "用药记录" },
  diary:      { emoji: "📔", gradient: Gradients.purple,      label: "日记" },
  family:     { emoji: "👥", gradient: Gradients.navActive,   label: "家人共享" },
};

const JOINER_TABS = new Set(["index", "family"]);

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
  // joiner 可访问的标签始终显示渐变高亮
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
        showActive && { color: cfg.gradient[0], fontWeight: "700" as const },
        !accessible && styles.tabLabelFaded,
      ]}>
        {cfg.label}
      </Text>
    </View>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const safeBottom = Platform.OS === "web" ? 0 : insets.bottom;
  const tabBarHeight = 76 + safeBottom;

  const { activeMembership } = useFamilyContext();
  const isJoiner = activeMembership?.role === "joiner";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarShowLabel: false,
        tabBarStyle: {
          height: tabBarHeight,
          paddingBottom: safeBottom,
          paddingTop: 8,
          backgroundColor: AppColors.surface.whiteStrong,
          borderTopWidth: 0,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          shadowColor: AppColors.shadow.default,
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.08,
          shadowRadius: 16,
          elevation: 12,
          overflow: Platform.OS === "android" ? "hidden" : undefined,
        },
        tabBarItemStyle: {
          paddingVertical: 0,
          height: "100%",
        },
      }}
    >
      <Tabs.Screen name="index"      options={{ title: "首页",    tabBarIcon: ({ focused }) => <TabIcon route="index"      focused={focused} isJoiner={isJoiner} /> }} />
      <Tabs.Screen name="checkin"    options={{ title: "每日打卡", tabBarIcon: ({ focused }) => <TabIcon route="checkin"    focused={focused} isJoiner={isJoiner} /> }} />
      <Tabs.Screen name="medication" options={{ title: "用药记录", tabBarIcon: ({ focused }) => <TabIcon route="medication" focused={focused} isJoiner={isJoiner} /> }} />
      <Tabs.Screen name="diary"      options={{ title: "日记",    tabBarIcon: ({ focused }) => <TabIcon route="diary"      focused={focused} isJoiner={isJoiner} /> }} />
      <Tabs.Screen name="family"     options={{ title: "家人共享", tabBarIcon: ({ focused }) => <TabIcon route="family"     focused={focused} isJoiner={isJoiner} /> }} />
    </Tabs>
  );
}

const CIRCLE = 48;

const styles = StyleSheet.create({
  tabItem: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    flex: 1,
  },
  tabItemFaded: {
    opacity: 0.22,
  },
  iconCircle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  inactiveCircle: {
    backgroundColor: AppColors.bg.secondary,
  },
  activeEmoji: {
    fontSize: 22,
    lineHeight: 26,
  },
  inactiveEmoji: {
    fontSize: 20,
    lineHeight: 24,
    opacity: 0.65,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: "500",
    color: INACTIVE_LABEL,
    letterSpacing: 0.2,
  },
  tabLabelFaded: {
    color: INACTIVE_LABEL,
  },
});
