import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HapticTab } from "@/components/haptic-tab";
import { Platform, View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

const INACTIVE_COLOR = "#B0B7C3";

const TAB_ICONS: Record<string, {
  outline: keyof typeof Ionicons.glyphMap;
  filled: keyof typeof Ionicons.glyphMap;
  activeColor: string;
}> = {
  index:      { outline: "home-outline",     filled: "home",     activeColor: "#FB923C" },
  checkin:    { outline: "sparkles-outline", filled: "sparkles", activeColor: "#34D399" },
  medication: { outline: "medkit-outline",   filled: "medkit",   activeColor: "#F43F5E" },
  diary:      { outline: "book-outline",     filled: "book",     activeColor: "#38BDF8" },
  family:     { outline: "people-outline",   filled: "people",   activeColor: "#A855F7" },
};

function TabIcon({
  route,
  label,
  focused,
}: {
  route: string;
  label: string;
  focused: boolean;
}) {
  const icons = TAB_ICONS[route] ?? { outline: "ellipse-outline", filled: "ellipse", activeColor: "#6B7280" };
  const activeColor = icons.activeColor;
  return (
    <View style={styles.tabItem}>
      <Ionicons
        name={focused ? icons.filled : icons.outline}
        size={23}
        color={focused ? activeColor : INACTIVE_COLOR}
      />
      <Text style={[styles.tabLabel, focused && { color: activeColor, fontWeight: "700" }]}>
        {label}
      </Text>
    </View>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const safeBottom = Platform.OS === "web" ? 0 : insets.bottom;
  const tabBarHeight = 58 + safeBottom;

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
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -6 },
          shadowOpacity: 0.09,
          shadowRadius: 18,
          elevation: 24,
          overflow: Platform.OS === "android" ? "hidden" : undefined,
        },
        tabBarItemStyle: {
          paddingVertical: 0,
          height: "100%",
        },
        tabBarActiveTintColor: "#FB923C",
        tabBarInactiveTintColor: INACTIVE_COLOR,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "首页",
          tabBarIcon: ({ focused }) => (
            <TabIcon route="index" label="首页" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="checkin"
        options={{
          title: "每日打卡",
          tabBarIcon: ({ focused }) => (
            <TabIcon route="checkin" label="打卡" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="medication"
        options={{
          title: "用药记录",
          tabBarIcon: ({ focused }) => (
            <TabIcon route="medication" label="用药" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="diary"
        options={{
          title: "日记",
          tabBarIcon: ({ focused }) => (
            <TabIcon route="diary" label="日记" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="family"
        options={{
          title: "家人共享",
          tabBarIcon: ({ focused }) => (
            <TabIcon route="family" label="家庭" focused={focused} />
          ),
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
    paddingTop: 4,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: "500",
    color: INACTIVE_COLOR,
    letterSpacing: 0.2,
  },
});
