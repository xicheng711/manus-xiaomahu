import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HapticTab } from "@/components/haptic-tab";
import { Platform, View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

const INACTIVE_COLOR = "#B0B7C3";

const TAB_CONFIG: Record<string, {
  outline: keyof typeof Ionicons.glyphMap;
  filled: keyof typeof Ionicons.glyphMap;
  gradientColors: [string, string];
  activeTextColor: string;
  label: string;
}> = {
  index:      { outline: "home-outline",    filled: "home",    gradientColors: ["#FFB199", "#FF6A88"], activeTextColor: "#FF6A88", label: "首页" },
  checkin:    { outline: "sparkles-outline",filled: "sparkles",gradientColors: ["#6EE7B7", "#10B981"], activeTextColor: "#10B981", label: "每日打卡" },
  medication: { outline: "medical-outline", filled: "medical", gradientColors: ["#FDA4AF", "#F43F5E"], activeTextColor: "#F43F5E", label: "用药记录" },
  diary:      { outline: "book-outline",    filled: "book",    gradientColors: ["#7DD3FC", "#3B82F6"], activeTextColor: "#3B82F6", label: "日记" },
  family:     { outline: "people-outline",  filled: "people",  gradientColors: ["#D8B4FE", "#A855F7"], activeTextColor: "#A855F7", label: "家人共享" },
};

function TabIcon({ route, focused }: { route: string; focused: boolean }) {
  const cfg = TAB_CONFIG[route] ?? {
    outline: "ellipse-outline", filled: "ellipse",
    gradientColors: ["#ccc", "#aaa"] as [string, string],
    activeTextColor: "#6B7280", label: "",
  };

  return (
    <View style={styles.tabItem}>
      <View style={styles.iconWrapper}>
        {focused && (
          <LinearGradient
            colors={cfg.gradientColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}
        <Ionicons
          name={focused ? cfg.filled : cfg.outline}
          size={22}
          color={focused ? "#fff" : INACTIVE_COLOR}
        />
      </View>
      <Text style={[styles.tabLabel, focused && { color: cfg.activeTextColor, fontWeight: "700" }]}>
        {cfg.label}
      </Text>
    </View>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const safeBottom = Platform.OS === "web" ? 0 : insets.bottom;
  const tabBarHeight = 64 + safeBottom;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarShowLabel: false,
        tabBarStyle: {
          height: tabBarHeight,
          paddingBottom: safeBottom,
          paddingTop: 4,
          backgroundColor: "#FFFFFF",
          borderTopWidth: 0,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -6 },
          shadowOpacity: 0.08,
          shadowRadius: 18,
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

const CIRCLE = 46;

const styles = StyleSheet.create({
  tabItem: {
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingTop: 2,
  },
  iconWrapper: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: "500",
    color: INACTIVE_COLOR,
    letterSpacing: 0.2,
  },
});
