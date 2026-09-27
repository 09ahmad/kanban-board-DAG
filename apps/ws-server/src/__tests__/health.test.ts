import { describe, expect, test, afterEach } from "bun:test";
import { get as httpGet } from "node:http";
import type { AddressInfo } from "node:net";
import WebSocket from "ws";
import { createWsServer, type WsServer } from "../server.js";

let server: WsServer | null = null;

/**
 * Start on an ephemeral port so parallel runs never collide, and answer the
 * port actually bound.
 */
async function listen(): Promise<{ origin: string; port: number }> {
  server = createWsServer(0);
  await new Promise<void>((resolve) => server!.httpServer.listen(0, resolve));
  const { port } = server.httpServer.address() as AddressInfo;
  return { origin: `http://127.0.0.1:${port}`, port };
}

/**
 * Uses node:http rather than the global fetch: a sibling suite installs
 * happy-dom, which replaces globalThis.fetch with one that refuses
 * cross-origin requests, and this server is by definition on another origin.
 */
function get(
  url: string
): Promise<{ status: number; body: string; contentType: string | undefined }> {
  return new Promise((resolve, reject) => {
    httpGet(url, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => {
        body += chunk;
      });
      res.on("end", () =>
        resolve({ status: res.statusCode ?? 0, body, contentType: res.headers["content-type"] }),
      );
    }).on("error", reject);
  });
}

afterEach(async () => {
  await server?.close();
  server = null;
});

describe("ws-server health check", () => {
  test("answers the health check the compose file depends on", async () => {
    const { origin } = await listen();

    const res = await get(`${origin}/health`);

    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ status: "ok" });
  });

  test("reports JSON, so a monitor can parse it", async () => {
    const { origin } = await listen();

    const res = await get(`${origin}/health`);

    expect(res.contentType).toContain("application/json");
  });

  test("stays healthy while a query string is attached", async () => {
    const { origin } = await listen();

    expect((await get(`${origin}/health?probe=1`)).status).toBe(200);
  });

  test("unknown paths answer in the shared error shape", async () => {
    const { origin } = await listen();

    const res = await get(`${origin}/nope`);

    expect(res.status).toBe(404);
    expect(JSON.parse(res.body)).toEqual({
      success: false,
      error: { code: "NOT_FOUND", message: "Not found" },
    });
  });
});

describe("ws-server upgrades", () => {
  test("accepts a socket on the same port that serves health", async () => {
    const { origin, port } = await listen();

    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const opened = await new Promise<boolean>((resolve, reject) => {
      ws.once("open", () => resolve(true));
      ws.once("error", reject);
    });

    expect(opened).toBe(true);
    // Health stays reachable with sockets attached — one port, both protocols.
    expect((await get(`${origin}/health`)).status).toBe(200);

    ws.close();
    await new Promise<void>((resolve) => ws.once("close", () => resolve()));
  });

  test("close() releases the port", async () => {
    const { origin } = await listen();
    await server!.close();
    server = null;

    await expect(get(`${origin}/health`)).rejects.toThrow();
  });
});
