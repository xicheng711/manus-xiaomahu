import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getCurrentUserIsCreator, getFamilyProfile } from "./storage";

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
export async function scheduleMorningReminder(elderNickname?: string, familyId?: string): Promise<string | null> {
  if (Platform.OS === "web") return null;
  
  // Only caregivers (creators) should have local reminders scheduled
  const isCreator = await getCurrentUserIsCreator();
  if (!isCreator) return null;

  const name = elderNickname || '家人';

  // 读取自定义提醒时间（优先 FamilyProfile，默认 08:00）
  const fp = await getFamilyProfile(familyId).catch(() => null);
  const timeStr = fp?.reminderMorning || '08:00';

  // Cancel existing morning notification first
  const existingId = await AsyncStorage.getItem(MORNING_NOTIF_ID_KEY);
  if (existingId) {
    await Notifications.cancelScheduledNotificationAsync(existingId).catch(() => {});
    await AsyncStorage.removeItem(MORNING_NOTIF_ID_KEY);
  }

  // If set to 'off', stop here
  if (timeStr === 'off') return null;

  const [hourStr, minStr] = timeStr.split(':');
  const hour = parseInt(hourStr, 10) || 8;
  const minute = parseInt(minStr, 10) || 0;

  const morningMessages = [
    { title: "早安 ☀️", body: `记录一下${name}昨晚睡得怎么样，小马虎帮你分析今天的状态` },
    { title: "早上好 🌸", body: `${name}昨晚睡得好吗？花30秒记录一下吧` },
    { title: "晨间小记 📝", body: `记录${name}的睡眠情况，让今天的照护更有方向` },
    { title: "小马虎来啦 🐴", body: `早上好！来记录${name}昨晚的睡眠吧` },
    { title: "新的一天开始了 ✨", body: `先记录${name}昨晚的睡眠，再开启美好的一天` },
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
      hour,
      minute,
      channelId: "daily-checkin",
    },
  });

  await AsyncStorage.setItem(MORNING_NOTIF_ID_KEY, id);
  return id;
}

/**
 * Schedule the evening check-in reminder (21:00 PM daily)
 */
export async function scheduleEveningReminder(elderNickname?: string, familyId?: string): Promise<string | null> {
  if (Platform.OS === "web") return null;

  // Only caregivers (creators) should have local reminders scheduled
  const isCreator = await getCurrentUserIsCreator();
  if (!isCreator) return null;

  const name = elderNickname || '家人';

  // 读取自定义提醒时间（优先 FamilyProfile，默认 21:00）
  const fp = await getFamilyProfile(familyId).catch(() => null);
  const timeStr = fp?.reminderEvening || '21:00';

  // Cancel existing evening notification first
  const existingId = await AsyncStorage.getItem(EVENING_NOTIF_ID_KEY);
  if (existingId) {
    await Notifications.cancelScheduledNotificationAsync(existingId).catch(() => {});
    await AsyncStorage.removeItem(EVENING_NOTIF_ID_KEY);
  }

  // If set to 'off', stop here
  if (timeStr === 'off') return null;

  const [hourStr, minStr] = timeStr.split(':');
  const hour = parseInt(hourStr, 10) || 21;
  const minute = parseInt(minStr, 10) || 0;

  const eveningMessages = [
    { title: "今天辛苦了 🌙", body: `花1分钟记录${name}今天的状态，小马虎帮你生成今日小结` },
    { title: "晚安前记一记 🌛", body: `${name}今天吃得好吗？心情怎么样？来记录一下吧` },
    { title: "今日小结 📖", body: `记录${name}今天的饮食和心情，看看照护趋势` },
    { title: "小马虎来收尾啦 🐴", body: `今天照顾得很棒！最后记录一下${name}今天的状态吧` },
    { title: "一天快结束了 🌟", body: `记录${name}今天的情况，让家人也能看到你的付出` },
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
      hour,
      minute,
      channelId: "daily-checkin",
    },
  });

  await AsyncStorage.setItem(EVENING_NOTIF_ID_KEY, id);
  return id;
}

/**
 * Schedule both morning and evening reminders
 */
export async function scheduleAllReminders(elderNickname?: string, familyId?: string): Promise<void> {
  const fp = await getFamilyProfile(familyId).catch(() => null);
  const wantsMorning = fp?.reminderMorning !== 'off';
  const wantsEvening = fp?.reminderEvening !== 'off';

  // Only request permission if at least one reminder is enabled
  if (wantsMorning || wantsEvening) {
    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) return;
  }

  await scheduleMorningReminder(elderNickname, familyId);
  await scheduleEveningReminder(elderNickname, familyId);
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
  return !!(morningId || eveningId);
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
