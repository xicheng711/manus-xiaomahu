/**
 * 请求超时工具。
 *
 * 移动网络下连接可能"假死"（既不 resolve 也不 reject），fetch 会无限挂起，
 * 页面首屏就一直转圈。给请求加一个超时计时器，超时后 abort fetch，
 * 调用方走原有的 catch / 本地降级逻辑。
 *
 * 关键：超时 signal 必须和调用方自己的取消 signal 合并——
 * 两个任一 abort 都要能终止 fetch。直接用新的 controller.signal 覆盖
 * options.signal 会吃掉调用方（比如 tRPC 查询取消）的取消语义；
 * 反过来 options.signal ?? controller.signal 则在调用方传了 signal 时
 * 让超时保护彻底失效。两种写法都是错的，用 withRequestTimeout 合并。
 */

/** 普通请求超时：60 秒。足够慢请求完成，只杀真正卡死的连接。 */
export const API_REQUEST_TIMEOUT_MS = 60_000;
/** tRPC 普通请求超时：60 秒。 */
export const TRPC_REQUEST_TIMEOUT_MS = 60_000;
/**
 * 照片上传超时：10 分钟。照片走 base64 大 body，弱网下传几 MB 可能要数分钟，
 * 不能把正常上传误杀。上传失败调用方会安全降级（照片留本地稍后重试）。
 */
export const TRPC_UPLOAD_TIMEOUT_MS = 10 * 60_000;

/**
 * 把超时计时和外部取消 signal 合并成一个 signal 返回。
 * 用完必须调用 cleanup()（清除计时器、解绑监听），否则计时器泄漏。
 */
export function withRequestTimeout(
  timeoutMs: number,
  externalSignal?: AbortSignal | null,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error(`request timed out after ${timeoutMs}ms`));
  }, timeoutMs);
  const onExternalAbort = () => {
    controller.abort(externalSignal?.reason);
  };
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort(externalSignal.reason);
    } else {
      externalSignal.addEventListener("abort", onExternalAbort, { once: true });
    }
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      externalSignal?.removeEventListener("abort", onExternalAbort);
    },
  };
}
