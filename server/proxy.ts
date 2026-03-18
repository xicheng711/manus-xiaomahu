/**
 * 开发代理服务器（proxy.ts）
 *
 * Replit 只对外暴露一个端口（5000）。
 * 代理在 5000 监听，把请求转发到：
 *   /api/* → Express 后端（localhost:3000）
 *   其他    → Expo/Metro 开发服务器（localhost:5001）
 *
 * 同时支持 WebSocket 升级请求（Metro HMR 热更新需要）。
 */

import * as http from "http";
import * as net from "net";

const PROXY_PORT = 5000;
const EXPO_PORT = 5001;
const API_PORT = 3000;

// ─── HTTP 代理 ────────────────────────────────────────────────────────────────

function proxyRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  targetPort: number
) {
  const options: http.RequestOptions = {
    hostname: "localhost",
    port: targetPort,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: `localhost:${targetPort}`,
    },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on("error", (err) => {
    // 目标尚未就绪或出错，返回 502
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "text/plain" });
      res.end(`Proxy error: ${err.message}`);
    }
  });

  if (req.readable) {
    req.pipe(proxyReq, { end: true });
  } else {
    proxyReq.end();
  }
}

// ─── WebSocket 隧道（Metro HMR 需要）────────────────────────────────────────

function proxyWebSocket(
  req: http.IncomingMessage,
  socket: net.Socket,
  head: Buffer,
  targetPort: number
) {
  const targetSocket = net.createConnection(targetPort, "localhost", () => {
    const headerLines: string[] = [`${req.method} ${req.url} HTTP/1.1`];
    for (const [k, v] of Object.entries(req.headers)) {
      const val = Array.isArray(v) ? v.join(", ") : v;
      if (val != null) headerLines.push(`${k}: ${val}`);
    }
    headerLines.push("", "");
    targetSocket.write(headerLines.join("\r\n"));
    if (head && head.length) targetSocket.write(head);
    socket.pipe(targetSocket);
    targetSocket.pipe(socket);
  });

  targetSocket.on("error", () => socket.destroy());
  socket.on("error", () => targetSocket.destroy());
  socket.on("close", () => targetSocket.destroy());
}

// ─── 主入口 ───────────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  const isApi = req.url?.startsWith("/api/");
  proxyRequest(req, res, isApi ? API_PORT : EXPO_PORT);
});

server.on("upgrade", (req, socket, head) => {
  const isApi = req.url?.startsWith("/api/");
  proxyWebSocket(req, socket as net.Socket, head, isApi ? API_PORT : EXPO_PORT);
});

server.listen(PROXY_PORT, "0.0.0.0", () => {
  console.log(
    `[proxy] Listening :${PROXY_PORT} → /api→:${API_PORT}, rest→:${EXPO_PORT}`
  );
});

server.on("error", (err) => {
  console.error("[proxy] Server error:", err);
  process.exit(1);
});
