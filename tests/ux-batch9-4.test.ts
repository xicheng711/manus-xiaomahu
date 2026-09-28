/**
 * UX batch9.4: AI 链路第二轮审计（assistant / diary-detail）确认 bug 的回归测试
 * - B1: assistant.tsx 护理总结 AI 请求有 60 秒超时；LoadingScreen 有"先返回"逃生出口；
 *       取消后迟到响应被丢弃；超时文案友好
 * - B2: diary-detail.tsx 追问包 withAiTimeout
 * - B3: assistant.tsx loadData 有家庭归属守卫（切家庭后旧回包不覆盖新家庭显示）
 * - B4: diary-detail.tsx 追问历史截断最近 24 条（token 不随轮次线性膨胀）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { withAiTimeout, isAiTimeoutError, AI_REQUEST_TIMEOUT_MS } from '../lib/ai-timeout';

const repo = path.join(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(repo, p), 'utf8');

const assistantSrc = read('app/assistant.tsx');
const diaryDetailSrc = read('app/diary-detail.tsx');

describe('withAiTimeout 真实行为', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('请求在超时前完成 → 透传结果', async () => {
    const p = withAiTimeout(Promise.resolve('ok'));
    await expect(p).resolves.toBe('ok');
  });

  it('请求挂起超过 60 秒 → reject 且 isAiTimeoutError 识别', async () => {
    let rejectOuter: (e: Error) => void = () => {};
    const hanging = new Promise<never>((_, reject) => { rejectOuter = reject; });
    const p = withAiTimeout(hanging);
    const assertion = expect(p).rejects.toThrow('AI_REQUEST_TIMEOUT');
    await vi.advanceTimersByTimeAsync(AI_REQUEST_TIMEOUT_MS);
    await assertion;
    // 迟到才 resolve 的响应不会再影响任何人（race 已结束）
    rejectOuter(new Error('late'));
    await vi.advanceTimersByTimeAsync(10_000);
  });

  it('请求失败（非超时）→ 透传原始错误', async () => {
    const p = withAiTimeout(Promise.reject(new Error('boom')));
    await expect(p).rejects.toThrow('boom');
    expect(isAiTimeoutError(new Error('boom'))).toBe(false);
  });
});

describe('B1: assistant 护理总结请求有界 + 有逃生出口', () => {
  it('getDailyAdvice 包了 withAiTimeout', () => {
    expect(assistantSrc).toContain('withAiTimeout(getDailyAdviceMutation.mutateAsync(');
  });

  it('LoadingScreen 接受 onCancel 并渲染"先返回"按钮', () => {
    expect(assistantSrc).toContain('function LoadingScreen({ onCancel }');
    expect(assistantSrc).toContain('onCancel={handleCancelLoading}');
    expect(assistantSrc).toContain('不等了，先返回');
  });

  it('取消后迟到响应被丢弃（cancelLoadRef 守卫）', () => {
    expect(assistantSrc).toContain('cancelLoadRef');
    expect(assistantSrc).toContain('if (isCancelled() || !isCurrentFamily()) return;');
  });

  it('超时错误映射为友好文案，不把 AI_REQUEST_TIMEOUT 吐给用户', () => {
    expect(assistantSrc).toContain('isAiTimeoutError(e)');
    expect(assistantSrc).toContain('AI_TIMEOUT_FRIENDLY_MESSAGE');
  });
});

describe('B2: diary-detail 追问有界超时', () => {
  it('followUpMutation 包了 withAiTimeout', () => {
    expect(diaryDetailSrc).toContain('withAiTimeout(followUpMutation.mutateAsync(');
  });
});

describe('B3: assistant loadData 有家庭归属守卫', () => {
  it('用 familyIdRef 镜像最新家庭，每次 await 后校验', () => {
    expect(assistantSrc).toContain('familyIdRef');
    expect(assistantSrc).toContain('const isCurrentFamily = () => familyIdRef.current === requestedFamilyId');
    // 关键写界面点都有守卫
    const guards = (assistantSrc.match(/if \(!isCurrentFamily\(\) \|\| isCancelled\(\)\) return;/g) || []).length;
    expect(guards).toBeGreaterThanOrEqual(4);
  });

  it('陈旧请求的 finally 不提前关闭新一轮的 loading', () => {
    expect(assistantSrc).toContain('if (isCurrentFamily() && !isCancelled()) {');
  });
});

describe('B4: diary-detail 追问历史截断', () => {
  it('只发最近 24 条历史（与 diary-edit 一致）', () => {
    expect(diaryDetailSrc).toContain('followUpHistory.slice(-24).map(');
  });
});
