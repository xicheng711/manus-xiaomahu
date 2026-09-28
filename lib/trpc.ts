import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@/server/routers";
import { getApiBaseUrl } from "@/constants/oauth";
import * as Auth from "@/lib/_core/auth";

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
          return fetch(url, {
            ...options,
            credentials: "include",
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
          });
        },
      }),
    ],
  });
}
