import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

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

  const name = elderNickname || '家人';

  // Cancel existing morning notification first
  const existingId = await AsyncStorage.getItem(MORNING_NOTIF_ID_KEY);
  if (existingId) {
    await Notifications.cancelScheduledNotificationAsync(existingId).catch(() => {});
  }

  const morningMessages = [
    { title: "🌅 早安，辛苦的守护者", body: `新的一天开始了，来记录一下${name}昨晚的睡眠情况吧` },
    { title: "☀️ 早上好！", body: "花30秒记录睡眠情况，小马虎帮你生成今日护理建议" },
    { title: "🌻 守护者早安", body: "记录昨晚睡眠，获取今日专属护理指南" },
    { title: "🐴 小马虎提醒你", body: "早上好！快来完成今日晨间打卡吧" },
    { title: "🌈 美好的一天", body: `记录一下${name}的睡眠，让今天的照护更有方向` },
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

  const name = elderNickname || '家人';

  // Cancel existing evening notification first
  const existingId = await AsyncStorage.getItem(EVENING_NOTIF_ID_KEY);
  if (existingId) {
    await Notifications.cancelScheduledNotificationAsync(existingId).catch(() => {});
  }

  const eveningMessages = [
    { title: "🌙 晚安打卡时间", body: `记录今天${name}的饮食、心情和用药情况吧` },
    { title: "🌛 辛苦了一天", body: "花一分钟记录今日情况，小马虎陪你回顾这一天" },
    { title: "✨ 今日小结", body: `来记录${name}今天的状态，为明天做更好的准备` },
    { title: "🐯 小马虎晚间提醒", body: "别忘了记录今天的照护日志哦" },
    { title: "🌜 睡前打卡", body: "记录今日饮食和心情，AI 助手为你总结一天" },
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
