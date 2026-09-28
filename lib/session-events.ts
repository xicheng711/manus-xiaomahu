/**
 * 会话过期全局通知（#6）。
 *
 * 问题：全仓没有任何 401/会话过期拦截。token 过期（1 年）或用户行丢失后，
 * 云端同步逐个 catch → null 静默失败，App 显示陈旧本地数据，用户得不到
 * 任何"请重新登录"引导。
 *
 * 机制：lib/trpc.ts 的 fetch 包装和 lib/_core/api.ts 在收到 401 时调
 * notifySessionExpired；app/_layout.tsx 订阅后弹一次窗引导去登录。
 * 403 仅当服务端明确说"账号已注销"（注销墓碑）时才视为会话死亡，
 * 普通权限 403 走各自业务处理。
 *
 * 去重：每个 token 只提醒一次——notify 后置 notified=true；
 * setSessionToken（重新登录）时调 resetSessionExpiredFlag() 重置。
 * 模块零依赖，避免循环引用。
 */

export type SessionExpiredReason = 'expired' | 'deleted';

type Listener = (reason: SessionExpiredReason) => void;

const listeners = new Set<Listener>();
let notified = false;

export function onSessionExpired(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 新 token 写入（重新登录）时重置，保证"每个 token 只提醒一次"。 */
export function resetSessionExpiredFlag(): void {
  notified = false;
}

export function notifySessionExpired(reason: SessionExpiredReason): void {
  if (notified) return;
  notified = true;
  listeners.forEach((l) => {
    try {
      l(reason);
    } catch {
      // 监听器异常不影响其它监听器
    }
  });
}
