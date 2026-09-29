import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@/server/routers";
import { getApiBaseUrl } from "@/constants/oauth";
import * as Auth from "@/lib/_core/auth";
import {
  withRequestTimeout,
  TRPC_REQUEST_TIMEOUT_MS,
  TRPC_UPLOAD_TIMEOUT_MS,
} from "@/lib/request-timeout";

// 保持旧导出兼容（常量已搬到 lib/request-timeout.ts）
export { TRPC_REQUEST_TIMEOUT_MS };

/**
 * tRPC React client for type-safe API calls.
 *
 * IMPORTANT (tRPC v11): The `transformer` must be inside `httpBatchLink`,
 * NOT at the root createClient level. This ensures client and server
 * use the same serialization format (superjson).
 */
export const trpc = createTRPCReact<AppRouter>();

/**
 * Creates the tRPC client with proper configuration.
 * Call this once in your app's root layout.
 */
export function createTRPCClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${getApiBaseUrl()}/api/trpc`,
        // tRPC v11: transformer MUST be inside httpBatchLink, not at root
        transformer: superjson,
        async headers() {
          const token = await Auth.getSessionToken();
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
        // Custom fetch to include credentials for cookie-based auth,
        // plus global session-expiry detection (#6): 401 → token 失效，清掉并通知一次；
        // 403 仅当服务端明确"账号已注销"时视为会话死亡（注销墓碑），普通权限 403 不动。
        fetch(url, options) {
          // 超时保护：移动网络假死时不无限等待（见 lib/request-timeout.ts）。
          // signal 合并：tRPC 自己的取消 signal 和超时计时任一 abort 都终止 fetch。
          // 照片上传（base64 大 body）走更长超时，弱网下正常上传可能要数分钟，不能误杀。
          const isUpload = /\/api\/trpc\/[^?]*uploadPhoto/i.test(String(url));
          const { signal, cleanup } = withRequestTimeout(
            isUpload ? TRPC_UPLOAD_TIMEOUT_MS : TRPC_REQUEST_TIMEOUT_MS,
            options?.signal as AbortSignal | undefined,
          );
          return fetch(url, {
            ...options,
            credentials: "include",
            signal,
          }).then(async (response) => {
            try {
              if (response.status === 401) {
                const { notifySessionExpired } = await import("@/lib/session-events");
                await Auth.removeSessionToken().catch(() => {});
                notifySessionExpired("expired");
              } else if (response.status === 403) {
                const text = await response.clone().text().catch(() => "");
                if (/账号已注销/.test(text)) {
                  const { notifySessionExpired } = await import("@/lib/session-events");
                  await Auth.removeSessionToken().catch(() => {});
                  notifySessionExpired("deleted");
                }
              }
            } catch {
              // 通知链路异常不影响正常响应透传
            }
            return response;
          }).finally(() => {
            cleanup();
          });
        },
      }),
    ],
  });
}
