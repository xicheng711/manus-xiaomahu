import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getCurrentUserIsCreator } from "./storage";

const NOTIFICATION_PERM_KEY = "@xiaomahuNotifPerm";
const MORNING_NOTIF_ID_KEY = "@xiaomahuMorningNotifId";
const EVENING_NOTIF_ID_KEY = "@xiaomahuEveningNotifId";

// Set up notification handler so notifications show in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Request notification permissions from the user
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === "web") return false;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("daily-checkin", {
      name: "每日打卡提醒",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF8B5CF6",
      sound: "default",
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  const granted = finalStatus === "granted";
  await AsyncStorage.setItem(NOTIFICATION_PERM_KEY, granted ? "true" : "false");
  return granted;
}

/**
 * Get Expo push token and register it to the server for cross-device push notifications
 */
export async function registerPushToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) return null;
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: undefined, // uses the project ID from app.json automatically
    });
    const token = tokenData.data;
    if (token) {
      // Lazy import to avoid circular dependency
      const { cloudUpdatePushToken } = require('./cloud-sync');
      await cloudUpdatePushToken(token);
      console.log('[Notifications] Push token registered:', token.slice(0, 30) + '...');
    }
    return token;
  } catch (e) {
    console.warn('[Notifications] Failed to register push token:', e);
    return null;
  }
}

/**
 * Check if notification permissions are granted
 */
export async function hasNotificationPermission(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const { status } = await Notifications.getPermissionsAsync();
  return status === "granted";
}

/**
 * Schedule the morning check-in reminder (8:00 AM daily)
 */
export async function scheduleMorningReminder(elderNickname?: string): Promise<string | null> {
  if (Platform.OS === "web") return null;
  
  // Only caregivers (creators) should have local reminders scheduled
  const isCreator = await getCurrentUserIsCreator();
  if (!isCreator) return null;

  const name = elderNickname || '家人';

  // Cancel existing morning notification first
  const existingId = await AsyncStorage.getItem(MORNING_NOTIF_ID_KEY);
  if (existingId) {
    await Notifications.cancelScheduledNotificationAsync(existingId).catch(() => {});
  }

  const morningMessages = [
    { title: "晨间打卡提醒", body: `请记录${name}昨晚的睡眠情况` },
    { title: "晨间记录", body: "花30秒记录睡眠情况，生成今日照护建议" },
    { title: "打卡提醒", body: "记录昨晚睡眠，查看今日照护分析" },
    { title: "小马虎提醒", body: "请完成今日晨间打卡" },
    { title: "晨间打卡", body: `记录${name}的睡眠情况，获取照护分析` },
  ];

  const msg = morningMessages[Math.floor(Math.random() * morningMessages.length)];

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: msg.title,
      body: msg.body,
      data: { screen: "checkin", type: "morning" },
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 8,
      minute: 0,
      channelId: "daily-checkin",
    },
  });

  await AsyncStorage.setItem(MORNING_NOTIF_ID_KEY, id);
  return id;
}

/**
 * Schedule the evening check-in reminder (21:00 PM daily)
 */
export async function scheduleEveningReminder(elderNickname?: string): Promise<string | null> {
  if (Platform.OS === "web") return null;

  // Only caregivers (creators) should have local reminders scheduled
  const isCreator = await getCurrentUserIsCreator();
  if (!isCreator) return null;

  const name = elderNickname || '家人';

  // Cancel existing evening notification first
  const existingId = await AsyncStorage.getItem(EVENING_NOTIF_ID_KEY);
  if (existingId) {
    await Notifications.cancelScheduledNotificationAsync(existingId).catch(() => {});
  }

  const eveningMessages = [
    { title: "晚间打卡提醒", body: `请记录${name}今日的饮食、心情和用药情况` },
    { title: "今日小结", body: "花一分钟记录今日情况，生成照护分析" },
    { title: "晚间记录", body: `记录${name}今天的状态，便于追踪趋势` },
    { title: "小马虎提醒", body: "请完成今日晚间打卡" },
    { title: "晚间打卡", body: "记录今日饮食和心情，查看照护分析" },
  ];

  const msg = eveningMessages[Math.floor(Math.random() * eveningMessages.length)];

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: msg.title,
      body: msg.body,
      data: { screen: "checkin", type: "evening" },
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 21,
      minute: 0,
      channelId: "daily-checkin",
    },
  });

  await AsyncStorage.setItem(EVENING_NOTIF_ID_KEY, id);
  return id;
}

/**
 * Schedule both morning and evening reminders
 */
export async function scheduleAllReminders(elderNickname?: string): Promise<void> {
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return;

  await scheduleMorningReminder(elderNickname);
  await scheduleEveningReminder(elderNickname);
}

/**
 * Cancel all scheduled reminders
 */
export async function cancelAllReminders(): Promise<void> {
  const morningId = await AsyncStorage.getItem(MORNING_NOTIF_ID_KEY);
  const eveningId = await AsyncStorage.getItem(EVENING_NOTIF_ID_KEY);

  if (morningId) {
    await Notifications.cancelScheduledNotificationAsync(morningId).catch(() => {});
    await AsyncStorage.removeItem(MORNING_NOTIF_ID_KEY);
  }
  if (eveningId) {
    await Notifications.cancelScheduledNotificationAsync(eveningId).catch(() => {});
    await AsyncStorage.removeItem(EVENING_NOTIF_ID_KEY);
  }
}

/**
 * Send immediate notification for a new family announcement
 */
export async function sendFamilyAnnouncementNotification(
  authorName: string,
  authorEmoji: string,
  content: string,
): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const hasPermission = await hasNotificationPermission();
    if (!hasPermission) return;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${authorEmoji} ${authorName} 发布了家庭公告`,
        body: content.length > 60 ? content.slice(0, 60) + '...' : content,
        sound: true,
        data: { type: 'family_announcement', screen: 'family' },
      },
      trigger: null,
    });
  } catch (e) {
    console.log('Family announcement notification not sent:', e);
  }
}

/**
 * Check if reminders are currently scheduled
 */
export async function areRemindersScheduled(): Promise<boolean> {
  const morningId = await AsyncStorage.getItem(MORNING_NOTIF_ID_KEY);
  const eveningId = await AsyncStorage.getItem(EVENING_NOTIF_ID_KEY);
  return !!(morningId && eveningId);
}

const MED_NOTIF_PREFIX = "@xiaomahuMedNotif_";

/**
 * Schedule a daily medication reminder at a specific time
 * @param medId Unique medication ID
 * @param medName Medication name
 * @param medIcon Medication emoji icon
 * @param elderNickname Name of the elder
 * @param hour Hour (0-23)
 * @param minute Minute (0-59)
 */
export async function scheduleMedicationReminder(
  medId: string,
  medName: string,
  medIcon: string,
  elderNickname: string,
  hour: number,
  minute: number,
): Promise<string | null> {
  if (Platform.OS === "web") return null;

  // Only caregivers (creators) should have local reminders scheduled
  const isCreator = await getCurrentUserIsCreator();
  if (!isCreator) return null;

  const hasPermission = await hasNotificationPermission();
  if (!hasPermission) return null;

  // Cancel existing reminder for this med
  const existingId = await AsyncStorage.getItem(MED_NOTIF_PREFIX + medId);
  if (existingId) {
    await Notifications.cancelScheduledNotificationAsync(existingId).catch(() => {});
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("medication", {
      name: "用药提醒",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      sound: "default",
    });
  }

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: `${medIcon} 用药提醒`,
      body: `该给${elderNickname}服用 ${medName} 了 💊`,
      data: { screen: "medication", medId },
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
      channelId: "medication",
    },
  });

  await AsyncStorage.setItem(MED_NOTIF_PREFIX + medId, id);
  return id;
}

/**
 * Cancel a medication reminder
 */
export async function cancelMedicationReminder(medId: string): Promise<void> {
  const existingId = await AsyncStorage.getItem(MED_NOTIF_PREFIX + medId);
  if (existingId) {
    await Notifications.cancelScheduledNotificationAsync(existingId).catch(() => {});
    await AsyncStorage.removeItem(MED_NOTIF_PREFIX + medId);
  }
}

/**
 * Schedule morning (8:00) and evening (21:00) medication reminders for a medication
 */
export async function scheduleMedicationMorningEvening(
  medId: string,
  medName: string,
  medIcon: string,
  elderNickname: string,
  morningHour = 8,
  eveningHour = 21,
): Promise<void> {
  await scheduleMedicationReminder(medId + "_morning", medName, medIcon, elderNickname, morningHour, 0);
  await scheduleMedicationReminder(medId + "_evening", medName, medIcon, elderNickname, eveningHour, 0);
}
