// AI 请求客户端超时保护。
//
// 背景：传输层（fetch / tRPC mutation）没有 timeout，地铁/电梯里网络半断开时
// 请求可能永远挂起（既不成功也不失败），调用方的 loading 状态就永久为 true，
// 输入框和按钮全锁死，用户只能杀进程（见 D3 / B1 / B2）。
//
// 用法：await withAiTimeout(someMutation.mutateAsync({ ... }))
// 超时后走和"明确失败"一样的降级路径；Promise.race 让姗姗来迟的响应被丢弃，
// 不会覆盖已结束的 UI 状态（底层请求本身仍在跑，但不再影响界面）。
export const AI_REQUEST_TIMEOUT_MS = 60_000;

export function withAiTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('AI_REQUEST_TIMEOUT')), AI_REQUEST_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export function isAiTimeoutError(e: unknown): boolean {
  return e instanceof Error && e.message === 'AI_REQUEST_TIMEOUT';
}

/** 超时时给用户看的文案（不要直接把 AI_REQUEST_TIMEOUT 吐给用户）。 */
export const AI_TIMEOUT_FRIENDLY_MESSAGE = '网络有点慢，AI 思考超时了，请稍后重试 🙏';
