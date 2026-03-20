import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HapticTab } from "@/components/haptic-tab";
import { Platform, View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

const INACTIVE_BG = "#382d68";
const INACTIVE_BORDER = "#382c67";
const INACTIVE_LABEL = "#9CA3AF";

const TAB_CONFIG: Record<string, {
  emoji: string;
  gradient: [string, string, string];
  label: string;
}> = {
  index:      { emoji: "🏠", gradient: ["#FF8904", "#FF637E", "#F6339A"], label: "首页" },
  checkin:    { emoji: "✨", gradient: ["#34D399", "#10B981", "#059669"], label: "每日打卡" },
  medication: { emoji: "💊", gradient: ["#FDA4AF", "#F43F5E", "#E11D48"], label: "用药记录" },
  diary:      { emoji: "📔", gradient: ["#7DD3FC", "#38BDF8", "#0EA5E9"], label: "日记" },
  family:     { emoji: "👥", gradient: ["#D8B4FE", "#A855F7", "#9333EA"], label: "家人共享" },
};

function TabIcon({ route, focused }: { route: string; focused: boolean }) {
  const cfg = TAB_CONFIG[route] ?? {
    emoji: "⭕", gradient: ["#ccc", "#aaa", "#888"] as [string, string, string], label: "",
  };

  return (
    <View style={styles.tabItem}>
      {focused ? (
        <LinearGradient
          colors={cfg.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.iconCircle}
        >
          <Text style={styles.activeEmoji}>{cfg.emoji}</Text>
        </LinearGradient>
      ) : (
        <View style={[styles.iconCircle, { backgroundColor: INACTIVE_BG, borderWidth: 1.5, borderColor: INACTIVE_BORDER }]}>
          <Text style={styles.inactiveEmoji}>{cfg.emoji}</Text>
        </View>
      )}
      <Text style={[styles.tabLabel, focused && { color: cfg.gradient[1], fontWeight: "700" }]}>
        {cfg.label}
      </Text>
    </View>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const safeBottom = Platform.OS === "web" ? 0 : insets.bottom;
  const tabBarHeight = 72 + safeBottom;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarShowLabel: false,
        tabBarStyle: {
          height: tabBarHeight,
          paddingBottom: safeBottom,
          paddingTop: 6,
          backgroundColor: "#FFFFFF",
          borderTopWidth: 0,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.10,
          shadowRadius: 20,
          elevation: 24,
          overflow: Platform.OS === "android" ? "hidden" : undefined,
        },
        tabBarItemStyle: {
          paddingVertical: 0,
          height: "100%",
        },
      }}
    >
      <Tabs.Screen name="index"      options={{ title: "首页",    tabBarIcon: ({ focused }) => <TabIcon route="index"      focused={focused} /> }} />
      <Tabs.Screen name="checkin"    options={{ title: "每日打卡", tabBarIcon: ({ focused }) => <TabIcon route="checkin"    focused={focused} /> }} />
      <Tabs.Screen name="medication" options={{ title: "用药记录", tabBarIcon: ({ focused }) => <TabIcon route="medication" focused={focused} /> }} />
      <Tabs.Screen name="diary"      options={{ title: "日记",    tabBarIcon: ({ focused }) => <TabIcon route="diary"      focused={focused} /> }} />
      <Tabs.Screen name="family"     options={{ title: "家人共享", tabBarIcon: ({ focused }) => <TabIcon route="family"     focused={focused} /> }} />
    </Tabs>
  );
}

const CIRCLE = 48;

const styles = StyleSheet.create({
  tabItem: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingTop: 4,
  },
  iconCircle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  activeEmoji: {
    fontSize: 22,
    lineHeight: 26,
  },
  inactiveEmoji: {
    fontSize: 20,
    lineHeight: 24,
    opacity: 0.7,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: "500",
    color: INACTIVE_LABEL,
    letterSpacing: 0.2,
  },
});
