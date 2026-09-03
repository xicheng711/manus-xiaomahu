import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerAuthProviderRoutes } from "../auth-providers";
import { appRouter } from "../routers";
import { createContext } from "./context";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Enable CORS for all routes - reflect the request origin to support credentials
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.header("Access-Control-Allow-Origin", origin);
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization",
    );
    res.header("Access-Control-Allow-Credentials", "true");

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Serve static files from the public directory
  app.use(express.static("public"));

  registerOAuthRoutes(app);
  registerAuthProviderRoutes(app);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  /**
   * 日记正式发布的 HTTP 兼容通道。
   * 它复用 createContext 与 appRouter 的 family.syncDiary 过程，因此认证、Zod 校验、
   * 房间成员校验、作者隔离、幂等 clientId 与数据库写入逻辑均与 tRPC 完全相同。
   * 仅在客户端最终发布的 tRPC 传输失败时回退使用，避免再次建立一套业务逻辑。
   */
  app.post('/api/diary-sync-fallback', async (req, res) => {
    // createContext 当前只依赖 req/res 做身份认证；info 为 tRPC 适配器要求的元数据。
    const context = await createContext({ req, res, info: {} as any });
    if (!context.user) {
      console.warn('[DiarySyncFallback] rejected code=UNAUTHORIZED');
      res.status(401).json({ success: false, errorCode: 'AUTH_REQUIRED', errorMessage: '登录状态已失效，请重新登录后再发布。' });
      return;
    }
    try {
      const result = await appRouter.createCaller(context).family.syncDiary(req.body);
      console.log(`[DiarySyncFallback] success user=${context.user.id} diary=${result.diaryId}`);
      res.json(result);
    } catch (error: any) {
      const code = String(error?.code ?? 'INTERNAL_SERVER_ERROR');
      const status = code === 'UNAUTHORIZED' ? 401 : code === 'FORBIDDEN' ? 403 : code === 'BAD_REQUEST' ? 400 : 500;
      const safeRoomId = req.body && typeof req.body === 'object' ? req.body.roomId : undefined;
      const safeFinished = req.body && typeof req.body === 'object' && req.body.conversationFinished === true;
      console.warn(`[DiarySyncFallback] rejected code=${code} user=${context.user.id} room=${safeRoomId ?? 'none'} finished=${safeFinished}`);
      res.status(status).json({
        success: false,
        errorCode: code === 'UNAUTHORIZED' ? 'AUTH_REQUIRED' : code === 'FORBIDDEN' ? 'FORBIDDEN' : 'NETWORK',
        errorMessage: code === 'BAD_REQUEST' ? '日记发布数据格式异常，请保留草稿后重试。' : '未能连接家庭云端，请检查网络后重试。',
      });
    }
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
      // syncDiary 在 Zod 输入校验或认证阶段失败时，路由内部的 DiarySync 日志尚未执行。
      // 仅记录安全的元信息，绝不输出日记正文、对话、令牌或完整请求体。
      onError({ path, error, input }) {
        if (path !== 'family.syncDiary') return;
        const safeInput = input && typeof input === 'object' ? input as Record<string, unknown> : {};
        const fieldNames = error.code === 'BAD_REQUEST' && 'issues' in error.cause!
          ? (error.cause as any).issues?.map((issue: any) => issue.path?.join('.')).filter(Boolean).join(',')
          : undefined;
        console.warn(
          `[DiarySync] rejected code=${error.code} room=${safeInput.roomId ?? 'none'} serverId=${safeInput.serverDiaryId ?? 'none'} finished=${safeInput.conversationFinished === true} revision=${safeInput.publishRevision ?? 'none'} fields=${fieldNames ?? 'none'}`,
        );
      },
    }),
  );

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`[api] server listening on port ${port}`);
  });
}

startServer().catch(console.error);
