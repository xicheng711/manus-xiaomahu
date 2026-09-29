import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getCurrentUserIsCreator, getFamilyProfile, getCheckInByDate } from "./storage";
import { localDateKey, parseDateKeyAtNoon } from "./shared-date-range";
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
      // 注意：存的是 JSON { id, time }，必须解析出真正的通知 ID 再取消，
      // 直接把整个 JSON 字符串当 ID 传进去一个都取消不掉（和用药 H1 同类）。
      const rec = await readSmartRecord(k).catch(() => null);
      if (rec) await Notifications.cancelScheduledNotificationAsync(rec.id).catch(() => {});
      await AsyncStorage.removeItem(k);
    }
  } catch { /* 静默失败 */ }
}

// ─── 智能打卡提醒 ─────────────────────────────────────────────
// 旧的 DAILY 常驻提醒不管打没打卡每天都响，用户学会无视后就失去了提醒意义。
// 新逻辑：按实际打卡状态决定是否安排"一次性"提醒，key 按"家庭 + 日期"。
//   - 还没打卡 + 提醒时间还没过 → 安排该日期一次提醒
//   - 已经打卡 → 取消该日期未响的提醒（不再打扰）
//   - 提醒时间已过 → 不安排（打卡页的"昨日漏打卡"卡片会接管提醒）
//   - 提前安排未来 2 天：用户某天没打开 app，当天仍有提醒
// 由打卡页聚焦、App 回到前台、提醒设置变更、切换家庭时调用。
// key 必须带 familyId：多家庭提醒时间/老人名字不同，共用 key 会互相取消。
//
// 日期语义：提醒时刻（8:00/21:00）都在凌晨 5 点之后，所以提醒日期恒等于
// 该护理日的日期；打卡记录的 date 也是护理日 key（见 resolveCheckInFormTargetDate）。
// 两者在 5:00 之后完全一致——key 统一用日历日，不存在护理日错位。
// 唯一例外是 0:00–5:00 做的打卡会记到前一护理日：此时按记录的实际日期取消，
// 绝不能用"今日" key 去取消（否则会误删新一天真正的提醒）。

const SMART_REMINDER_MIGRATED_KEY = '@xiaomahuSmartReminderV1';
const MORNING_SMART_ID_PREFIX = '@xiaomahuMorningSmart_';
const EVENING_SMART_ID_PREFIX = '@xiaomahuEveningSmart_';

/**
 * 智能提醒的 AsyncStorage key。必须纳入 familyId：
 * 多家庭各自的提醒时间/老人名字不同，共用一个 key 会互相取消覆盖——
 * 切到 B 家庭排提醒时会把 A 家庭的提醒取消掉，A 家庭就再也收不到提醒了。
 */
function smartIdKey(prefix: string, familyId: string | number | undefined, dateKey: string): string {
  const scope = familyId !== undefined && familyId !== null && String(familyId) !== ''
    ? String(familyId)
    : 'default';
  return `${prefix}${scope}_${dateKey}`;
}

/** 从智能提醒 key 末尾解析日期（YYYY-MM-DD），格式不对返回 null。 */
function smartKeyDate(key: string): string | null {
  const m = /(\d{4}-\d{2}-\d{2})$/.exec(key);
  return m ? m[1] : null;
}
// 提前安排的天数：今天 + 未来 N 天。N 天内没打开 app，提醒依然会响。
const SMART_SCHEDULE_AHEAD_DAYS = 2;

export function smartTodayKey(): string {
  return localDateKey(new Date());
}

/** 任意本地日期 → YYYY-MM-DD key */
export function smartDateKey(d: Date): string {
  return localDateKey(d);
}

interface SmartReminderRecord {
  /** 系统通知 ID */
  id: string;
  /** 安排时用的 "H:mm" 时间串，用于检测用户改时间后重排 */
  time: string;
}

/** 读取一条智能提醒记录。兼容旧版本存的纯 ID 字符串。 */
async function readSmartRecord(idKey: string): Promise<SmartReminderRecord | null> {
  const raw = await AsyncStorage.getItem(idKey);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.id === 'string') {
      return { id: parsed.id, time: typeof parsed.time === 'string' ? parsed.time : '' };
    }
  } catch {
    // 旧格式：纯通知 ID 字符串
  }
  return { id: raw, time: '' };
}

/** 取消一条已安排的智能提醒并清掉 key。key 不存在时是空操作。 */
async function cancelSmartRecord(idKey: string): Promise<void> {
  try {
    const rec = await readSmartRecord(idKey);
    if (rec) {
      await Notifications.cancelScheduledNotificationAsync(rec.id).catch(() => {});
    }
    await AsyncStorage.removeItem(idKey);
  } catch {
    // 静默失败：取消提醒失败不应该打断主流程
  }
}

/** 清理安排窗口之外的过期 key，防止 AsyncStorage 无限堆积。 */
async function cleanupStaleSmartKeys(): Promise<void> {
  try {
    const keepDates = new Set<string>();
    for (let i = 0; i <= SMART_SCHEDULE_AHEAD_DAYS; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      keepDates.add(smartDateKey(d));
    }
    const keys = await AsyncStorage.getAllKeys();
    for (const k of keys) {
      const isMorning = k.startsWith(MORNING_SMART_ID_PREFIX);
      const isEvening = k.startsWith(EVENING_SMART_ID_PREFIX);
      if (!isMorning && !isEvening) continue;
      const prefix = isMorning ? MORNING_SMART_ID_PREFIX : EVENING_SMART_ID_PREFIX;
      const rest = k.slice(prefix.length);
      const isNewFormat = /^.+_\d{4}-\d{2}-\d{2}$/.test(rest);
      if (!isNewFormat) {
        // 旧格式 key（升级前排的）：取消其通知，由本次调度的同日期新格式 key 接管
        await cancelSmartRecord(k);
        continue;
      }
      if (!keepDates.has(smartKeyDate(k) ?? '')) {
        await cancelSmartRecord(k);
      }
    }
  } catch {
    // 静默失败
  }
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
  dateKey: string,
  baseDate: Date,
  familyId: string | number | undefined,
): Promise<void> {
  const prefix = period === 'morning' ? MORNING_SMART_ID_PREFIX : EVENING_SMART_ID_PREFIX;
  const idKey = smartIdKey(prefix, familyId, dateKey);
  const existing = await readSmartRecord(idKey);

  const time = parseReminderTime(timeStr, defaultHour);
  const timeLabel = time ? `${time.hour}:${String(time.minute).padStart(2, '0')}` : '';

  // 已打卡，或用户设为"不提醒"：取消该日期未响的提醒，不再打扰
  if (done || !time) {
    if (existing) await cancelSmartRecord(idKey);
    return;
  }

  const fireDate = new Date(baseDate);
  fireDate.setHours(time.hour, time.minute, 0, 0);
  // 提醒时间已过（或不足 1 分钟）：不安排，避免打开 app 瞬间就弹通知吓人
  if (fireDate.getTime() <= Date.now() + 60_000) {
    if (existing) await cancelSmartRecord(idKey);
    return;
  }

  // 已经按同样的时间安排过：不动，避免重复调度
  if (existing && existing.time === timeLabel) return;

  // 首次安排，或用户改了提醒时间：先取消旧的，再排新的
  if (existing) {
    await Notifications.cancelScheduledNotificationAsync(existing.id).catch(() => {});
  }

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
  await AsyncStorage.setItem(idKey, JSON.stringify({ id, time: timeLabel } satisfies SmartReminderRecord));
}

/**
 * 智能提醒总入口：按实际打卡状态安排（或取消）今日及未来几天的提醒。
 * 在打卡页聚焦、App 回到前台、提醒设置变更、切换家庭时调用。
 * 提前安排未来 SMART_SCHEDULE_AHEAD_DAYS 天：即使用户某天没打开 app，
 * 当天的提醒依然会响；打卡保存成功后按日期精确取消（见 cancelReminderForDate）。
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

    for (let i = 0; i <= SMART_SCHEDULE_AHEAD_DAYS; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const dateKey = smartDateKey(d);
      // 提醒时刻都在凌晨 5 点之后，提醒日期恒等于该护理日的日期，直接按日历日查打卡状态。
      // 未来日期不可能已有打卡记录，getCheckInByDate 会返回 null → 正常安排。
      const checkIn = await getCheckInByDate(dateKey, familyId).catch(() => null);
      await ensureSmartReminder('morning', checkIn?.morningDone ?? false, fp?.reminderMorning, 8, name, dateKey, d, familyId);
      await ensureSmartReminder('evening', checkIn?.eveningDone ?? false, fp?.reminderEvening, 21, name, dateKey, d, familyId);
    }

    await cleanupStaleSmartKeys();
  } catch (e) {
    console.warn('[Notifications] ensureTodayReminders failed:', e);
  }
}

/**
 * 打卡保存成功后调用：取消该打卡记录所属日期、该时段未响的提醒。
 *
 * 必须按记录的实际日期取消：补打卡（过去日期）只取消那一天的提醒，
 * 绝不能用"今日" key——否则会误删今天真正的待响提醒（今天还没打卡）。
 * 凌晨 0:00–5:00 做的打卡记到前一护理日，同样只取消那一护理日的提醒，
 * 新一天（5 点后）的提醒不受影响。
 */
export async function cancelReminderForDate(
  period: 'morning' | 'evening',
  dateKey: string,
  familyId?: string | number,
): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const prefix = period === 'morning' ? MORNING_SMART_ID_PREFIX : EVENING_SMART_ID_PREFIX;
    await cancelSmartRecord(smartIdKey(prefix, familyId, dateKey));
  } catch (e) {
    console.warn('[Notifications] cancelReminderForDate failed:', e);
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
 * 检查打卡提醒是否正在生效。
 * 以系统里实际排期的通知为准（ground truth），而不是只看本地 key：
 * 旧实现读的是 batch8 迁移时已删除的旧 key，会恒返回 false。
 */
export async function areRemindersScheduled(): Promise<boolean> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const ourIds = new Set<string>();
    for (const k of keys) {
      if (k.startsWith(MORNING_SMART_ID_PREFIX) || k.startsWith(EVENING_SMART_ID_PREFIX)) {
        const rec = await readSmartRecord(k);
        if (rec) ourIds.add(rec.id);
      }
    }
    // 兼容迁移期残留的旧 key
    const morningId = await AsyncStorage.getItem(MORNING_NOTIF_ID_KEY);
    const eveningId = await AsyncStorage.getItem(EVENING_NOTIF_ID_KEY);
    if (morningId) ourIds.add(morningId);
    if (eveningId) ourIds.add(eveningId);
    if (ourIds.size === 0) return false;
    const pending = await Notifications.getAllScheduledNotificationsAsync();
    return pending.some(n => ourIds.has(n.identifier));
  } catch {
    return false;
  }
}

const MED_NOTIF_PREFIX = "@xiaomahuMedNotif_";

/**
 * iOS 每个 app 最多 64 条已排期本地通知；超了会被系统静默丢弃，
 * 用户收不到任何提示。Android 无此硬限制，但统一按 64 做预算。
 * 用药 DATE 预排（"每隔一天"每槽 10 条）是最主要的消耗者，
 * 排期前必须查已用额度，优先保近舍远，绝不能让系统静默吞掉。
 */
const OS_MAX_SCHEDULED_NOTIFICATIONS = 64;
/** 给打卡提醒等其他通知留的余量：用药排期最多占用到这个数。 */
const MED_SCHEDULE_BUDGET = 56;

/** 当前已排期的通知数（查不到时按 0 计，宁可多排一条也不漏提醒）。 */
async function currentScheduledCount(): Promise<number> {
  try {
    const pending = await Notifications.getAllScheduledNotificationsAsync();
    return pending.length;
  } catch {
    return 0;
  }
}

/**
 * 本次最多还能排几条（DATE 触发器用）。
 * - 硬上限：已排期数绝不能超过 iOS 的 64 条，否则系统会静默丢弃。
 *   额度已满时返回 0，调用方直接跳过本次排期（续排时会再试）。
 * - 软预算未满时至少返回 1：保证最近的一个剂量日有提醒，
 *   不能让用户一次药都收不到。
 */
async function dateTriggerBudget(): Promise<number> {
  const used = await currentScheduledCount();
  const hardRoom = OS_MAX_SCHEDULED_NOTIFICATIONS - used;
  if (hardRoom <= 0) return 0;
  const softRoom = MED_SCHEDULE_BUDGET - used;
  return Math.max(1, Math.min(softRoom, hardRoom));
}

/**
 * Schedule a medication reminder at a specific time, honoring the medication's frequency.
 * @param medId Unique medication ID (callers pass medId + '_' + HHMM per time slot)
 * @param medName Medication name
 * @param medIcon Medication emoji icon
 * @param elderNickname Name of the elder
 * @param hour Hour (0-23)
 * @param minute Minute (0-59)
 * @param frequency One of the FREQUENCIES values from the medication form.
 *   - 需要时服用: never auto-scheduled (returns null after clearing any existing).
 *   - 每周一次: WEEKLY trigger on scheduleOpts.weekday (defaults to today).
 *   - 每隔一天: next 10 dose-day DATE triggers (20 days), anchored on
 *     scheduleOpts.anchorDateKey (defaults to today). Dose days are always
 *     anchor + 2k, so re-scheduling never flips the odd/even parity (M2).
 *   - 每天一次/两次/三次 (default): DAILY trigger.
 * @param scheduleOpts.anchorDateKey "每隔一天"周期锚点（YYYY-MM-DD），不传则用今天。
 * @param scheduleOpts.roomId 家庭 roomId：写进通知 data，点击通知时 _layout 会先切到
 *   正确的家庭再进用药页（L1）。多家庭用户在 B 家庭时点 A 家庭的提醒也不会进错。
 * @param scheduleOpts.weekday "每周一次"的星期（1-7，1=周日），不传则用当天（M3/M4）。
 */
export async function scheduleMedicationReminder(
  medId: string,
  medName: string,
  medIcon: string,
  elderNickname: string,
  hour: number,
  minute: number,
  frequency?: string,
  scheduleOpts?: { anchorDateKey?: string; roomId?: string; weekday?: number },
): Promise<string | null> {
  if (Platform.OS === "web") return null;

  // Only caregivers (creators) should have local reminders scheduled
  const isCreator = await getCurrentUserIsCreator();
  if (!isCreator) return null;

  const hasPermission = await hasNotificationPermission();
  if (!hasPermission) return null;

  // Cancel existing reminder(s) for this med slot first (idempotent re-schedule)
  await cancelMedicationReminder(medId).catch(() => {});

  // 需要时服用：不自动排任何提醒（之前会误排成每天，误导用户）
  if (frequency === '需要时服用') {
    return null;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("medication", {
      name: "用药提醒",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      sound: "default",
    });
  }

  const roomId = scheduleOpts?.roomId;
  const content = {
    title: `${medIcon} 用药提醒`,
    body: `该给${elderNickname}服用 ${medName} 了 💊`,
    // roomId 让点击通知时先切到正确的家庭（L1）；没有就按当前家庭处理
    data: { screen: "medication", medId, ...(roomId ? { roomId } : {}) },
    sound: true,
  };

  if (frequency === '每周一次') {
    // WEEKLY: weekday 1-7 (1=Sunday). 用用户在表单选定的星期（M3），
    // 而不是"排期当天"，否则编辑后提醒日会漂到编辑当天（M4）。
    const weekday = scheduleOpts?.weekday ?? (new Date().getDay() + 1);
    const id = await Notifications.scheduleNotificationAsync({
      content,
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday,
        hour,
        minute,
        channelId: "medication",
      },
    });
    await AsyncStorage.setItem(MED_NOTIF_PREFIX + medId, id);
    return id;
  }

  if (frequency === '每隔一天') {
    // No native every-other-day trigger: pre-schedule the next 10 dose days as
    // one-shot DATE triggers (covers 20 days). Dose days are anchor + 2k where
    // anchor is the med's everyOtherDayAnchor (persisted on the Medication record);
    // without a stable anchor, every edit would silently flip the odd/even parity (M2).
    // 续排见 renewEveryOtherDayReminders：用药页聚焦时把未来的剂量日补足 10 个 (M1)。
    const anchorDate = parseDateKeyAtNoon(scheduleOpts?.anchorDateKey ?? '') ?? new Date();
    const now = new Date();
    const dates: Date[] = [];
    let k = 0;
    while (dates.length < 10 && k < 60) {
      const d = new Date(anchorDate);
      d.setDate(d.getDate() + k * 2);
      d.setHours(hour, minute, 0, 0);
      if (d.getTime() > now.getTime()) dates.push(d);
      k++;
    }
    // iOS 64 条上限防护：本槽位旧提醒上面已取消，这里按剩余额度只排最近的 N 个
    // 剂量日（优先保近、舍远），绝不能让系统静默丢弃。
    // 预算为 0（硬上限已满）时直接跳过，续排时会再试。
    const budget = await dateTriggerBudget();
    const planned = budget > 0 ? dates.slice(0, Math.min(dates.length, budget)) : [];
    const ids: string[] = [];
    for (const d of planned) {
      const id = await Notifications.scheduleNotificationAsync({
        content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: d,
          channelId: "medication",
        },
      }).catch(() => null);
      if (id) ids.push(id);
    }
    if (ids.length === 0) return null;
    // 存 ID + 剂量日期：续排时按日期续（保持奇偶），取消时按 ID 逐个取消。
    await AsyncStorage.setItem(MED_NOTIF_PREFIX + medId, JSON.stringify({
      ids,
      dates: planned.map(d => d.toISOString()),
    }));
    return ids[0];
  }

  const id = await Notifications.scheduleNotificationAsync({
    content,
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
 * 解析 AsyncStorage 里存的通知 ID：兼容两种格式——
 * - 裸通知 ID 字符串（每天/每周/旧版）
 * - JSON 数组字符串（"每隔一天"预排的多个 DATE 触发器，旧格式）
 * - JSON 对象 { ids, dates }（"每隔一天"新格式，带剂量日期供续排用）
 */
function parseStoredNotifIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter(id => typeof id === 'string');
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.ids)) {
      return parsed.ids.filter((id: unknown) => typeof id === 'string');
    }
    if (typeof parsed === 'string' && parsed) return [parsed];
  } catch {
    // 不是 JSON：按裸通知 ID 处理
  }
  return [raw];
}

/** 解析"每隔一天"排期的完整记录：通知 ID + 剂量日期（ISO 字符串）。 */
function parseStoredNotifSchedule(raw: string | null): { ids: string[]; dates: string[] } {
  const ids = parseStoredNotifIds(raw);
  let dates: string[] = [];
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Array.isArray(parsed.dates)) {
        dates = parsed.dates.filter((d: unknown) => typeof d === 'string');
      }
    } catch { /* 旧格式没有 dates */ }
  }
  return { ids, dates };
}

/**
 * 剪掉已过期的排期记录（P2）：ids 与 dates 按下标对齐，只保留未来剂量；
 * 过期 ID 对应的通知逐个取消，避免僵尸 ID 在存储里无限膨胀。
 */
function pruneExpiredSchedule(
  sched: { ids: string[]; dates: string[] },
  nowMs: number,
): { ids: string[]; dates: string[] } {
  const ids: string[] = [];
  const dates: string[] = [];
  const n = Math.max(sched.ids.length, sched.dates.length);
  for (let i = 0; i < n; i++) {
    const d = sched.dates[i];
    const ts = d ? new Date(d).getTime() : NaN;
    if (Number.isFinite(ts) && ts > nowMs) {
      dates.push(d);
      if (sched.ids[i]) ids.push(sched.ids[i]);
    } else if (sched.ids[i]) {
      void Notifications.cancelScheduledNotificationAsync(sched.ids[i]).catch(() => {});
    }
  }
  return { ids, dates };
}

/**
 * Cancel a medication reminder. Handles both the legacy single-ID storage
 * and the JSON array storage used by 每隔一天 pre-scheduled DATE triggers.
 */
export async function cancelMedicationReminder(medId: string): Promise<void> {
  const raw = await AsyncStorage.getItem(MED_NOTIF_PREFIX + medId);
  const ids = parseStoredNotifIds(raw);
  if (ids.length > 0) {
    await Promise.all(ids.map(id => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
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
      const raw = await AsyncStorage.getItem(key);
      // 注意："每隔一天"存的是 JSON 数组，必须逐个解析取消，
      // 直接把整个 JSON 字符串当单个 ID 传进去一个都取消不掉（H1）。
      const ids = parseStoredNotifIds(raw);
      await Promise.all(ids.map(id => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
      await AsyncStorage.removeItem(key);
    } catch {
      // keep going: one bad key must not block the rest
    }
  }
}

/**
 * "每隔一天"续排（M1）：预排只覆盖约 20 天，到期后提醒会静默消失。
 * 用药页聚焦时调用：把每个时间槽未来的剂量日补足到 10 个。
 *
 * 奇偶保持：从已排的最后一个剂量日往后每 2 天续排，不碰锚点；
 * 旧格式（只有 ID 数组、没有 dates）的记录无法得知已排日期，整槽重排一次
 * （scheduleMedicationReminder 开头会先取消本槽位旧提醒，幂等），
 * 重排后即转为新格式，后续走日期续排。
 *
 * 只在主照顾者设备上实际排期（scheduleMedicationReminder 内部有 isCreator 门控）。
 */
export async function renewEveryOtherDayReminders(
  meds: Array<{
    id: string;
    times?: string[];
    frequency?: string;
    active?: boolean;
    reminderEnabled?: boolean;
    name?: string;
    icon?: string;
    everyOtherDayAnchor?: string;
  }>,
  elderNickname: string,
  roomId?: string,
): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const isCreator = await getCurrentUserIsCreator();
    if (!isCreator) return;
    const now = new Date();
    for (const med of meds) {
      if (med.frequency !== '每隔一天' || !med.active || med.reminderEnabled === false) continue;
      for (const t of med.times || []) {
        const [h, min] = t.split(':').map(Number);
        if (!Number.isFinite(h) || !Number.isFinite(min)) continue;
        const slotKey = MED_NOTIF_PREFIX + med.id + '_' + t.replace(':', '');
        const raw = await AsyncStorage.getItem(slotKey).catch(() => null);
        const sched = parseStoredNotifSchedule(raw);
        // P2：先剪掉过期 ID，避免数组无限膨胀（同时取消对应僵尸通知）。
        const pruned = pruneExpiredSchedule(sched, now.getTime());
        const futureDates = pruned.dates
          .map(d => new Date(d).getTime())
          .filter(ts => Number.isFinite(ts) && ts > now.getTime())
          .sort((a, b) => a - b);
        if (futureDates.length >= 5) {
          if (pruned.ids.length !== sched.ids.length) {
            await AsyncStorage.setItem(slotKey, JSON.stringify(pruned)).catch(() => {});
          }
          continue;
        }
        if (futureDates.length === 0) {
          // 全部过期（或旧格式无日期）：整槽重排。scheduleMedicationReminder
          // 会按锚点 anchor + 2k 推算下一批未来剂量日——不能从 now 重锚，
          // 否则奇偶翻转；开头也会先取消本槽位旧提醒（幂等），重排后转新格式。
          await scheduleMedicationReminder(
            med.id + '_' + t.replace(':', ''), med.name || '药物', med.icon || '💊',
            elderNickname, h, min, '每隔一天',
            { anchorDateKey: med.everyOtherDayAnchor ?? localDateKey(now), ...(roomId ? { roomId } : {}) },
          ).catch(() => {});
          continue;
        }
        // 日期续排：从最后一个剂量日往后每 2 天，补到 10 个未来剂量日
        const last = new Date(futureDates[futureDates.length - 1]);
        const extra: Date[] = [];
        let k = 1;
        while (futureDates.length + extra.length < 10 && k < 40) {
          const d = new Date(last);
          d.setDate(d.getDate() + k * 2);
          d.setHours(h, min, 0, 0);
          if (d.getTime() > now.getTime()) extra.push(d);
          k++;
        }
        if (extra.length === 0) continue;
        // iOS 64 条上限防护：续排也受预算限制，优先保近舍远。
        // 预算为 0（硬上限已满）时跳过本槽位，下次续排再试。
        const renewBudget = await dateTriggerBudget();
        const plannedExtra = renewBudget > 0 ? extra.slice(0, renewBudget) : [];
        const content = {
          title: `${med.icon || '💊'} 用药提醒`,
          body: `该给${elderNickname}服用 ${med.name || '药物'} 了 💊`,
          data: { screen: "medication", medId: med.id + '_' + t.replace(':', ''), ...(roomId ? { roomId } : {}) },
          sound: true,
        };
        const newIds: string[] = [];
        const newDates: string[] = [];
        for (const d of plannedExtra) {
          const id = await Notifications.scheduleNotificationAsync({
            content,
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: d,
              channelId: "medication",
            },
          }).catch(() => null);
          if (id) {
            newIds.push(id);
            newDates.push(d.toISOString());
          }
        }
        if (newIds.length > 0) {
          await AsyncStorage.setItem(slotKey, JSON.stringify({
            ids: [...pruned.ids, ...newIds],
            dates: [...pruned.dates, ...newDates],
          })).catch(() => {});
        }
      }
    }
  } catch (e) {
    console.warn('[Notifications] renewEveryOtherDayReminders failed:', e);
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
