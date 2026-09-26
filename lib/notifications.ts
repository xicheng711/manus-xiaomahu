import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getCurrentUserIsCreator, getFamilyProfile, getCheckInByDate } from "./storage";
import { getCareDayKey } from "./shared-date-range";
import Constants from "expo-constants";
import { cloudUpdatePushToken } from "./cloud-sync";

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
 * Get Expo push token and register it to the server for cross-device push notifications.
 * 会在未授权时主动弹窗申请权限——调用前请先用应用内文案解释用途（见 onboarding 完成页），
 * 不要在 App 启动等无上下文的时机直接调用。
 */
export async function registerPushToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) return null;
    return await fetchAndUploadPushToken();
  } catch (e) {
    console.warn('[Notifications] Failed to register push token:', e);
    return null;
  }
}

/**
 * 静默同步 push token：仅在系统权限已授予时注册，未授权/被拒绝时直接返回 null，
 * 绝不主动弹窗。用于 App 启动时的后台尝试，避免用户还没看懂 app 就被系统弹窗打断；
 * 拒绝后也不会反复打扰，用户可在设置页手动开启。
 */
export async function syncPushTokenSilently(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return null;
    return await fetchAndUploadPushToken();
  } catch (e) {
    console.warn('[Notifications] Failed to sync push token silently:', e);
    return null;
  }
}

async function fetchAndUploadPushToken(): Promise<string | null> {
  // 明确传入 projectId，避免 undefined 导致 Expo push token 获取失败
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    '36e30bf8-6e6c-4359-a1ce-fac45d5d24c6';
  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
  const token = tokenData.data;
  if (token) {
    await cloudUpdatePushToken(token);
    console.log('[Notifications] Push token registered:', token.slice(0, 30) + '...');
  }
  return token;
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

  // 智能提醒：按今日实际打卡状态安排（打过的不再提醒）
  await ensureTodayReminders(elderNickname, familyId);
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
  // 同时清理智能提醒（按日期 key 存的单次提醒）
  try {
    const keys = await AsyncStorage.getAllKeys();
    const smartKeys = keys.filter(k =>
      k.startsWith(MORNING_SMART_ID_PREFIX) || k.startsWith(EVENING_SMART_ID_PREFIX)
    );
    for (const k of smartKeys) {
      const id = await AsyncStorage.getItem(k);
      if (id) await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
      await AsyncStorage.removeItem(k);
    }
  } catch { /* 静默失败 */ }
}

// ─── 智能打卡提醒 ─────────────────────────────────────────────
// 旧的 DAILY 常驻提醒不管打没打卡每天都响，用户学会无视后就失去了提醒意义。
// 新逻辑：每天按实际打卡状态决定是否安排"今日一次性"提醒。
//   - 还没打卡 + 提醒时间还没过 → 安排今日一次提醒
//   - 已经打卡 → 取消今日未响的提醒（不再打扰）
//   - 提醒时间已过 → 不安排（打卡页的"昨日漏打卡"卡片会接管提醒）
// 由打卡页聚焦时和打卡保存成功后调用。

const SMART_REMINDER_MIGRATED_KEY = '@xiaomahuSmartReminderV1';
const MORNING_SMART_ID_PREFIX = '@xiaomahuMorningSmart_';
const EVENING_SMART_ID_PREFIX = '@xiaomahuEveningSmart_';

export function smartTodayKey(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

export function parseReminderTime(timeStr: string | undefined, defaultHour: number): { hour: number; minute: number } | null {
  const str = timeStr || '';
  if (str === 'off') return null;
  const [hStr, mStr] = str.split(':');
  const hour = parseInt(hStr, 10);
  const minute = parseInt(mStr ?? '0', 10);
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return { hour: defaultHour, minute: 0 };
  return { hour, minute: Number.isFinite(minute) && minute >= 0 && minute < 60 ? minute : 0 };
}

const SMART_MORNING_MESSAGES = [
  { title: '早安 ☀️', body: (name: string) => `记录一下${name}昨晚睡得怎么样，小马虎帮你分析今天的状态` },
  { title: '早上好 🌸', body: (name: string) => `${name}昨晚睡得好吗？花30秒记录一下吧` },
  { title: '晨间小记 📝', body: (name: string) => `记录${name}的睡眠情况，让今天的照护更有方向` },
];

const SMART_EVENING_MESSAGES = [
  { title: '今天辛苦了 🌙', body: (name: string) => `花1分钟记录${name}今天的状态，小马虎帮你生成今日小结` },
  { title: '晚安前记一记 🌛', body: (name: string) => `${name}今天吃得好吗？心情怎么样？来记录一下吧` },
  { title: '今日小结 📖', body: (name: string) => `记录${name}今天的饮食和心情，看看照护趋势` },
];

async function ensureSmartReminder(
  period: 'morning' | 'evening',
  done: boolean,
  timeStr: string | undefined,
  defaultHour: number,
  name: string,
): Promise<void> {
  const prefix = period === 'morning' ? MORNING_SMART_ID_PREFIX : EVENING_SMART_ID_PREFIX;
  const idKey = prefix + smartTodayKey();
  const existingId = await AsyncStorage.getItem(idKey);

  if (done) {
    // 已打卡：取消今日还没响的提醒，不再打扰
    if (existingId) {
      await Notifications.cancelScheduledNotificationAsync(existingId).catch(() => {});
      await AsyncStorage.removeItem(idKey);
    }
    return;
  }

  const time = parseReminderTime(timeStr, defaultHour);
  if (!time) return; // 'off'

  const fireDate = new Date();
  fireDate.setHours(time.hour, time.minute, 0, 0);
  // 提醒时间已过（或不足 1 分钟）：不安排，避免打开 app 瞬间就弹通知吓人
  if (fireDate.getTime() <= Date.now() + 60_000) {
    if (existingId) {
      await Notifications.cancelScheduledNotificationAsync(existingId).catch(() => {});
      await AsyncStorage.removeItem(idKey);
    }
    return;
  }

  if (existingId) return; // 今日已安排过

  const messages = period === 'morning' ? SMART_MORNING_MESSAGES : SMART_EVENING_MESSAGES;
  const msg = messages[Math.floor(Math.random() * messages.length)];
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: msg.title,
      body: msg.body(name),
      data: { screen: 'checkin', type: period },
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fireDate,
      channelId: 'daily-checkin',
    },
  });
  await AsyncStorage.setItem(idKey, id);

  // 清理过期（非今日）的智能提醒 key，防止无限堆积
  try {
    const keys = await AsyncStorage.getAllKeys();
    const todayKey = smartTodayKey();
    for (const k of keys) {
      if ((k.startsWith(MORNING_SMART_ID_PREFIX) || k.startsWith(EVENING_SMART_ID_PREFIX))
        && k !== MORNING_SMART_ID_PREFIX + todayKey
        && k !== EVENING_SMART_ID_PREFIX + todayKey) {
        const oldId = await AsyncStorage.getItem(k);
        if (oldId) await Notifications.cancelScheduledNotificationAsync(oldId).catch(() => {});
        await AsyncStorage.removeItem(k);
      }
    }
  } catch { /* 静默失败 */ }
}

/**
 * 智能提醒总入口：每天按实际打卡状态安排（或取消）今日提醒。
 * 在打卡页聚焦、App 回到前台、提醒设置变更时调用。
 */
export async function ensureTodayReminders(elderNickname?: string, familyId?: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const isCreator = await getCurrentUserIsCreator();
    if (!isCreator) return; // 只有主照顾者需要打卡提醒

    // 一次性迁移：取消旧的 DAILY 常驻提醒（不管打没打卡每天都响）
    const migrated = await AsyncStorage.getItem(SMART_REMINDER_MIGRATED_KEY);
    if (!migrated) {
      const morningId = await AsyncStorage.getItem(MORNING_NOTIF_ID_KEY);
      const eveningId = await AsyncStorage.getItem(EVENING_NOTIF_ID_KEY);
      if (morningId) await Notifications.cancelScheduledNotificationAsync(morningId).catch(() => {});
      if (eveningId) await Notifications.cancelScheduledNotificationAsync(eveningId).catch(() => {});
      await AsyncStorage.multiRemove([MORNING_NOTIF_ID_KEY, EVENING_NOTIF_ID_KEY]).catch(() => {});
      await AsyncStorage.setItem(SMART_REMINDER_MIGRATED_KEY, '1');
    }

    const hasPermission = await hasNotificationPermission();
    if (!hasPermission) return;

    const fp = await getFamilyProfile(familyId).catch(() => null);
    const name = elderNickname || '家人';
    // 按护理日查今日打卡状态（凌晨 5 点分界）
    const checkIn = await getCheckInByDate(getCareDayKey(), familyId).catch(() => null);

    await ensureSmartReminder('morning', checkIn?.morningDone ?? false, fp?.reminderMorning, 8, name);
    await ensureSmartReminder('evening', checkIn?.eveningDone ?? false, fp?.reminderEvening, 21, name);
  } catch (e) {
    console.warn('[Notifications] ensureTodayReminders failed:', e);
  }
}

/**
 * 打卡保存成功后调用：该时段已完成，取消今日未响的提醒。
 */
export async function cancelTodayReminder(period: 'morning' | 'evening'): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const prefix = period === 'morning' ? MORNING_SMART_ID_PREFIX : EVENING_SMART_ID_PREFIX;
    const idKey = prefix + smartTodayKey();
    const id = await AsyncStorage.getItem(idKey);
    if (id) {
      await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
      await AsyncStorage.removeItem(idKey);
    }
  } catch (e) {
    console.warn('[Notifications] cancelTodayReminder failed:', e);
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
 * Cancel ALL medication reminders scheduled during the current login session.
 *
 * Called on logout / account deletion so the old account's medication alarms
 * stop firing after the local data is wiped. Scope is deliberately narrow:
 * - only keys under MED_NOTIF_PREFIX (this session's medication reminders);
 * - morning/evening check-in reminders (@xiaomahuMorningNotifId /
 *   @xiaomahuEveningNotifId) are NOT touched;
 * - notifications scheduled by other apps are NOT touched (expo only manages
 *   this app's own anyway).
 */
export async function cancelAllMedicationReminders(): Promise<void> {
  if (Platform.OS === 'web') return;
  const allKeys = await AsyncStorage.getAllKeys();
  const medKeys = allKeys.filter((k) => k.startsWith(MED_NOTIF_PREFIX));
  for (const key of medKeys) {
    try {
      const id = await AsyncStorage.getItem(key);
      if (id) {
        await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
      }
      await AsyncStorage.removeItem(key);
    } catch {
      // keep going: one bad key must not block the rest
    }
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
