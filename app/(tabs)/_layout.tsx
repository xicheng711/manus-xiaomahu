import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HapticTab } from "@/components/haptic-tab";
import { Platform, View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

const INACTIVE_COLOR = "#B0B7C3";

const TAB_CONFIG: Record<string, {
  outline: keyof typeof Ionicons.glyphMap;
  filled: keyof typeof Ionicons.glyphMap;
  activeColor: string;
  label: string;
}> = {
  index:      { outline: "home-outline",     filled: "home",         activeColor: "#FB7560", label: "首页" },
  checkin:    { outline: "sparkles-outline", filled: "sparkles",     activeColor: "#34D399", label: "每日打卡" },
  medication: { outline: "medical-outline",  filled: "medical",      activeColor: "#F43F5E", label: "用药记录" },
  diary:      { outline: "book-outline",     filled: "book",         activeColor: "#38BDF8", label: "日记" },
  family:     { outline: "people-outline",   filled: "people",       activeColor: "#A855F7", label: "家人共享" },
};

function TabIcon({ route, focused }: { route: string; focused: boolean }) {
  const cfg = TAB_CONFIG[route] ?? {
    outline: "ellipse-outline", filled: "ellipse", activeColor: "#6B7280", label: "",
  };

  return (
    <View style={styles.tabItem}>
      {focused ? (
        <View style={[styles.activePill, { backgroundColor: cfg.activeColor }]}>
          <Ionicons name={cfg.filled} size={22} color="#fff" />
        </View>
      ) : (
        <View style={styles.inactiveIconWrap}>
          <Ionicons name={cfg.outline} size={22} color={INACTIVE_COLOR} />
        </View>
      )}
      <Text
        style={[
          styles.tabLabel,
          focused && { color: cfg.activeColor, fontWeight: "700" },
        ]}
      >
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
      <Tabs.Screen
        name="index"
        options={{
          title: "首页",
          tabBarIcon: ({ focused }) => <TabIcon route="index" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="checkin"
        options={{
          title: "每日打卡",
          tabBarIcon: ({ focused }) => <TabIcon route="checkin" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="medication"
        options={{
          title: "用药记录",
          tabBarIcon: ({ focused }) => <TabIcon route="medication" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="diary"
        options={{
          title: "日记",
          tabBarIcon: ({ focused }) => <TabIcon route="diary" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="family"
        options={{
          title: "家人共享",
          tabBarIcon: ({ focused }) => <TabIcon route="family" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabItem: {
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingTop: 2,
  },
  activePill: {
    width: 52,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  inactiveIconWrap: {
    width: 52,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: "500",
    color: INACTIVE_COLOR,
    letterSpacing: 0.2,
  },
});
