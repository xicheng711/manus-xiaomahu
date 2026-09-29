/**
 * UX batch9.3: 本轮复审确认 bug 的回归测试
 * - F2: 补打卡选择器在凌晨也能列出 7 个连续护理日
 * - C1: refocus 后普通表单重建 formTargetRef（不被“目标已变化”守卫误杀）
 * - C2: 关闭补录表单时清除 backfill 路由参数
 * - F3: 创建家庭失败有可见反馈
 * - S3: 登出清理 cloud-sync 状态和游客草稿
 * - M1/M2/M3: 用药删除/暂停取消提醒；频率语义（需要时/每周/隔日）正确排期
 * - D1: 删除日记不截断列表
 * - D2: 日记保存失败按钮恢复可点
 * - D3: AI 请求 60 秒超时，服务端 fetch 有 Abort 超时
 * - H1: WeeklyEcho 用本地日期算周
 * - H2: 首页移除未使用的无限摇摆动画
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ── Mocks ──────────────────────────────────────────────────────────
const scheduled: Array<{ id: string; content: any; trigger: any }> = [];
const cancelledIds: string[] = [];
const store = new Map<string, string>();

vi.mock('expo-notifications', () => ({
  setNotificationHandler: vi.fn(),
  getPermissionsAsync: vi.fn(async () => ({ status: 'granted' })),
  cancelScheduledNotificationAsync: vi.fn(async (id: string) => {
    cancelledIds.push(id);
  }),
  scheduleNotificationAsync: vi.fn(async (req: any) => {
    const id = `mock-med-${scheduled.length}`;
    scheduled.push({ id, content: req.content, trigger: req.trigger });
    return id;
  }),
  getAllScheduledNotificationsAsync: vi.fn(async () => []),
  SchedulableTriggerInputTypes: { DAILY: 'daily', WEEKLY: 'weekly', DATE: 'date', TIME_INTERVAL: 'timeInterval' },
  AndroidImportance: { HIGH: 4 },
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getAllKeys: vi.fn(async () => Array.from(store.keys())),
    getItem: vi.fn(async (k: string) => (store.has(k) ? store.get(k)! : null)),
    setItem: vi.fn(async (k: string, v: string) => { store.set(k, v); }),
    removeItem: vi.fn(async (k: string) => { store.delete(k); }),
    multiRemove: vi.fn(async (ks: string[]) => { ks.forEach(k => store.delete(k)); }),
  },
}));

vi.mock('../lib/storage', () => ({
  getCurrentUserIsCreator: vi.fn(async () => true),
}));

vi.mock('expo-constants', () => ({ default: {} }));

// cloud-sync.ts 内部用了 @/ 别名（vitest 解析不了），沿用 batch8 的做法 mock 掉
vi.mock('../lib/cloud-sync', () => ({
  cloudUpdatePushToken: vi.fn(async () => {}),
}));

// 注意：这里故意不 mock ../lib/shared-date-range，用真实实现测护理日锚定逻辑。
import { getCareDayKey, parseDateKeyAtNoon } from '../lib/shared-date-range';
import {
  scheduleMedicationReminder,
  cancelMedicationReminder,
} from '../lib/notifications';

const repo = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(repo, p), 'utf8');
const checkinSrc = read('app/(tabs)/checkin.tsx');
const familySrc = read('app/(tabs)/family.tsx');
const profileSrc = read('app/profile.tsx');
const medicationSrc = read('app/(tabs)/medication.tsx');
const diarySrc = read('app/(tabs)/diary.tsx');
const diaryEditSrc = read('app/diary-edit.tsx');
const weeklyEchoSrc = read('components/weekly-echo.tsx');
const indexSrc = read('app/(tabs)/index.tsx');
const llmSrc = read('server/_core/llm.ts');
const familyRouterSrc = read('server/family-router.ts');

beforeEach(() => {
  scheduled.length = 0;
  cancelledIds.length = 0;
  store.clear();
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('F2: 补打卡选择器在凌晨也有 7 个连续护理日', () => {
  // 与 checkin.tsx 里 loadPickOptions 同构的锚定算法（护理日中午解析，连续减 0–6 天）
  function buildPickKeys(now: Date): string[] {
    const anchorDate = parseDateKeyAtNoon(getCareDayKey(now)) ?? now;
    const keys: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(anchorDate);
      d.setDate(d.getDate() - i);
      keys.push(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      );
    }
    return keys;
  }

  it('凌晨 02:00（护理日=前一天）仍是 7 天连续不重复', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 28, 2, 0, 0)); // 2026-09-28 02:00 本地
    expect(getCareDayKey()).toBe('2026-09-27');
    const keys = buildPickKeys(new Date());
    expect(keys).toHaveLength(7);
    expect(new Set(keys).size).toBe(7); // 无重复
    expect(keys[0]).toBe('2026-09-27');
    expect(keys[6]).toBe('2026-09-21');
    // 连续：相邻两天差正好 86400000ms
    for (let i = 0; i < 6; i++) {
      const a = new Date(keys[i] + 'T12:00:00').getTime();
      const b = new Date(keys[i + 1] + 'T12:00:00').getTime();
      expect(a - b).toBe(86400000);
    }
  });

  it('下午 14:00（护理日=当天）也是 7 天连续不重复', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 28, 14, 0, 0));
    expect(getCareDayKey()).toBe('2026-09-28');
    const keys = buildPickKeys(new Date());
    expect(keys).toHaveLength(7);
    expect(new Set(keys).size).toBe(7);
    expect(keys[0]).toBe('2026-09-28');
    expect(keys[6]).toBe('2026-09-22');
  });

  it('源码不再用 seenKeys 去重（旧算法在凌晨会吞掉 1 天只剩 6 个）', () => {
    expect(checkinSrc).not.toContain('seenKeys');
    expect(checkinSrc).toContain('parseDateKeyAtNoon(getCareDayKey())');
  });
});

describe('C1/C2: 打卡表单 refocus 与关闭补录', () => {
  it('C1: refocus 后为普通早晚表单重建 formTargetRef（不被守卫误杀）', () => {
    // 恢复资料/草稿后，根据 restoredDraftMode 或 modeRef.current 重建目标
    expect(checkinSrc).toMatch(/restoredDraftMode[\s\S]*?formTargetRef\.current = \{/);
  });

  it('C2: closeCheckInForm 清除 backfill 路由参数', () => {
    expect(checkinSrc).toMatch(/backfillDate: undefined[\s\S]*?backfillPeriod: undefined/);
  });
});

describe('F3: 创建家庭失败有可见反馈', () => {
  it('handleCreate 的 catch 里弹 Alert', () => {
    const createFn = familySrc.slice(familySrc.indexOf('async function handleCreate'));
    expect(createFn).toContain('catch');
    expect(createFn).toMatch(/Alert\.alert\(\s*['"]创建失败['"]/);
  });
});

describe('S3: 登出清理 cloud-sync 状态和游客草稿', () => {
  it('handleSignOut 调用 clearCloudSyncState 和 clearCheckInDraft', () => {
    expect(profileSrc).toContain('clearCloudSyncState');
    expect(profileSrc).toContain('clearCheckInDraft');
  });
});

describe('M3: 用药提醒按频率语义排期', () => {
  const MED_KEY = (id: string) => `@xiaomahuMedNotif_${id}`;
  // 真实签名：(medId, medName, medIcon, elderNickname, hour, minute, frequency?)

  it('每天一次：DAILY trigger，只存单个 ID（向后兼容）', async () => {
    const id = await scheduleMedicationReminder('med1', '降压药', '💊', '奶奶', 8, 0, '每天一次');
    expect(id).toBeTruthy();
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].trigger.type).toBe('daily');
    expect(store.get(MED_KEY('med1'))).toBe(id);
  });

  it('需要时服用：不排期，返回 null，且清掉旧提醒', async () => {
    store.set(MED_KEY('med2'), 'old-id');
    const id = await scheduleMedicationReminder('med2', '止痛药', '💊', '奶奶', 8, 0, '需要时服用');
    expect(id).toBeNull();
    expect(scheduled).toHaveLength(0);
    expect(cancelledIds).toContain('old-id');
    expect(store.has(MED_KEY('med2'))).toBe(false);
  });

  it('每周一次：WEEKLY trigger，weekday 锚定今天', async () => {
    const id = await scheduleMedicationReminder('med3', '维生素', '💊', '奶奶', 9, 0, '每周一次');
    expect(id).toBeTruthy();
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].trigger.type).toBe('weekly');
    expect(scheduled[0].trigger.weekday).toBe(new Date().getDay() + 1);
  });

  it('每隔一天：预排 10 个一次性 DATE trigger，存 {ids, dates}', async () => {
    const id = await scheduleMedicationReminder('med4', '钙片', '💊', '奶奶', 8, 0, '每隔一天');
    expect(id).toBeTruthy();
    expect(scheduled).toHaveLength(10);
    expect(scheduled.every(s => s.trigger.type === 'date')).toBe(true);
    // 新格式：{ ids, dates }（dates 供续排用）；取消时仍能逐个解析
    const stored = JSON.parse(store.get(MED_KEY('med4'))!);
    expect(Array.isArray(stored.ids)).toBe(true);
    expect(stored.ids).toHaveLength(10);
    expect(stored.dates).toHaveLength(10);
  });

  it('取消时能解析 JSON 数组，把 10 个全取消', async () => {
    await scheduleMedicationReminder('med5', '钙片', '💊', '奶奶', 8, 0, '每隔一天');
    expect(scheduled).toHaveLength(10);
    await cancelMedicationReminder('med5');
    expect(cancelledIds).toHaveLength(10);
    expect(store.has(MED_KEY('med5'))).toBe(false);
  });

  it('换频率前先取消旧提醒（新旧不叠加）', async () => {
    await scheduleMedicationReminder('med6', '药', '💊', '奶奶', 8, 0, '每天一次');
    const firstId = store.get(MED_KEY('med6'));
    await scheduleMedicationReminder('med6', '药', '💊', '奶奶', 8, 0, '每天一次');
    expect(cancelledIds).toContain(firstId);
  });
});

describe('M1/M2: 删除/暂停用药取消提醒', () => {
  it('M1: 删除药物时调用 cancelMedicationRemindersForMed', () => {
    expect(medicationSrc).toMatch(/deleteMedication\(action\.med\.id[\s\S]*?cancelMedicationRemindersForMed\(action\.med\)/);
  });

  it('M2: 暂停用药时取消全部提醒', () => {
    expect(medicationSrc).toMatch(/!nextMedication\.active[\s\S]*?cancelMedicationRemindersForMed\(action\.med\)/);
  });

  it('恢复用药时按原频率重排（而不是只排 DAILY）', () => {
    expect(medicationSrc).toMatch(/scheduleSelectedReminders\(\s*action\.med\.id[\s\S]*?action\.med\.frequency/);
  });

  it('新增药物路径透传 frequency', () => {
    expect(medicationSrc).toContain('newMedicationData.frequency');
  });
});

describe('D1/D2: 日记删除与保存', () => {
  it('D1: 删除后不再 slice(0, 30) 截断列表', () => {
    expect(diarySrc).not.toContain('slice(0, 30)');
  });

  it('D2: 保存走 try/catch/finally，失败时按钮恢复可点', () => {
    expect(diaryEditSrc).toMatch(/setSubmitting\(true\);[\s\S]*?try \{\s*savedEntry = await saveDiaryEntry/);
    expect(diaryEditSrc).toMatch(/finally \{\s*setSubmitting\(false\);\s*\}/);
    expect(diaryEditSrc).toMatch(/Alert\.alert\(['"]保存失败['"]/);
  });
});

describe('D3: AI 请求有界超时', () => {
  it('客户端：两个 AI 调用都包了 withAiTimeout（helper 抽到 lib/ai-timeout.ts）', () => {
    const aiTimeoutSrc = read('lib/ai-timeout.ts');
    expect(aiTimeoutSrc).toContain('AI_REQUEST_TIMEOUT_MS');
    expect(aiTimeoutSrc).toContain('60_000');
    expect(diaryEditSrc).toContain("from '@/lib/ai-timeout'");
    expect(diaryEditSrc).toContain('withAiTimeout(replyMutation.mutateAsync(');
    expect(diaryEditSrc).toContain('withAiTimeout(followUpMutation.mutateAsync(');
  });

  it('服务端：invokeLLM 的 fetch 带 Abort 超时', () => {
    expect(llmSrc).toContain('new AbortController()');
    expect(llmSrc).toContain('signal: controller.signal');
    expect(llmSrc).toContain('LLM invoke timed out after 60s');
  });
});

describe('H1/H2: 首页', () => {
  it('H1: WeeklyEcho 用本地日期组装周范围（不用 toISOString）', () => {
    expect(weeklyEchoSrc).not.toContain('toISOString().slice(0, 10)');
    expect(weeklyEchoSrc).toContain('getMonth()');
  });

  it('H2: 首页不再调用未使用的无限摇摆动画', () => {
    expect(indexSrc).not.toContain('useShakeAnim');
    expect(indexSrc).not.toContain('_unusedShake');
  });
});

describe('S1: 迟到的离线时段不再整单丢弃', () => {
  it('stale 判定收窄：只在没带来新完成时段时才忽略', () => {
    expect(familyRouterSrc).toContain('inputBringsNewMorning');
    expect(familyRouterSrc).toContain('inputBringsNewEvening');
    // 旧的无条件整单丢弃已不存在
    expect(familyRouterSrc).not.toMatch(
      /if \(previous && input\.completedAt < previous\.completedAt\) \{\s*return \{ success: true, checkIn: previous, staleIgnored: true \};/
    );
  });
});
