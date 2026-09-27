import { createServer, type Server } from "node:http";
import { WebSocketServer } from "ws";
import { connectionManager } from "./manager.js";
import { handleClientMessage } from "./handlers.js";

export interface WsServer {
  httpServer: Server;
  wss: WebSocketServer;
  close(): Promise<void>;
}

/**
 * Serves the WebSocket protocol and an HTTP health check on one port.
 *
 * A bare `new WebSocketServer({ port })` binds the port for the upgrade
 * handshake alone, so an HTTP GET to /health gets no response at all. The
 * compose healthcheck would then fail forever and the container would never be
 * considered healthy, which is enough to hold back anything depending on it.
 */
export function createWsServer(port: number): WsServer {
  const httpServer = createServer((req, res) => {
    const path = (req.url ?? "/").split("?")[0];

    if (path === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        success: false,
        error: { code: "NOT_FOUND", message: "Not found" },
      }),
    );
  });

  // `ws` upgrades connections on the server it is handed, so both protocols
  // share the port and clients keep connecting to the origin they were given.
  const wss = new WebSocketServer({ server: httpServer });

  wss.on("connection", (ws) => {
    ws.on("message", (data) => {
      handleClientMessage(ws, data.toString());
    });

    ws.on("close", () => {
      connectionManager.remove(ws);
    });

    ws.on("error", (err) => {
      console.error("WS error:", err);
      connectionManager.remove(ws);
    });
  });

  return {
    httpServer,
    wss,
    close: () =>
      new Promise<void>((resolve) => {
        wss.close(() => {
          httpServer.closeAllConnections();
          httpServer.close(() => resolve());
        });
      }),
  };
}
