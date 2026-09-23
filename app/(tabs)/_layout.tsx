import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HapticTab } from "@/components/haptic-tab";
import { Platform, View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { AppColors, Gradients } from "@/lib/design-tokens";
import { useFamilyContext } from "@/lib/family-context";

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

// Joiner 可见的 Tab：首页 / 每日打卡（只读） / 用药记录 / 日记 / 家人共享。
// 打卡页对 joiner 渲染 JoinerCheckinView 只读视图（见 checkin.tsx），不再拦截。
const JOINER_TABS = new Set(["index", "checkin", "family", "diary", "medication"]);

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
  // 只有当前页面使用高亮色；其他可访问页面保持清晰但不过度抢眼。
  const showActive = focused;

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
        showActive && { color: cfg.gradient[1], fontWeight: "700" as const },
        !accessible && styles.tabLabelFaded,
      ]} numberOfLines={1}>
        {cfg.label}
      </Text>
    </View>
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

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarButton: HapticTab,
          tabBarShowLabel: false,
          tabBarStyle: {
            height: tabBarHeight,
            // 顶部留 4px，底部留安全区（不额外加空白）
            paddingTop: 4,
            paddingBottom: safeBottom,
            paddingHorizontal: 4,
            backgroundColor: 'rgba(255,253,251,0.96)',
            borderTopWidth: 0.5,
            borderTopColor: 'rgba(129,111,101,0.12)',
            borderTopLeftRadius: 26,
            borderTopRightRadius: 26,
            shadowColor: '#7D6D64',
            shadowOffset: { width: 0, height: -5 },
            shadowOpacity: 0.12,
            shadowRadius: 22,
            elevation: 18,
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
        <Tabs.Screen name="checkin"    options={{ title: "每日打卡", tabBarIcon: ({ focused }) => <TabIcon route="checkin"    focused={focused} isJoiner={isJoiner} /> }} />
        <Tabs.Screen name="medication" options={{ title: "用药记录", tabBarIcon: ({ focused }) => <TabIcon route="medication" focused={focused} isJoiner={isJoiner} /> }} />
        <Tabs.Screen name="diary"      options={{ title: "日记",    tabBarIcon: ({ focused }) => <TabIcon route="diary"      focused={focused} isJoiner={isJoiner} /> }} />
        <Tabs.Screen name="family"     options={{ title: "家人共享", tabBarIcon: ({ focused }) => <TabIcon route="family"     focused={focused} isJoiner={isJoiner} /> }} />
      </Tabs>
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
    opacity: 0.62,
  },
  iconCircle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  inactiveCircle: {
    backgroundColor: '#F3EEEB',
  },
  activeEmoji: {
    fontSize: 22,
    lineHeight: 26,
  },
  inactiveEmoji: {
    fontSize: 20,
    lineHeight: 24,
    opacity: 0.78,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: "500",
    color: AppColors.nav.inactive,
    letterSpacing: 0,
  },
  tabLabelFaded: {
    color: AppColors.text.tertiary,
  },
});
