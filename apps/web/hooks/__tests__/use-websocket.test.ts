import "../../happydom";
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { renderHook, act, waitFor, cleanup } from "@testing-library/react";
import { resolveWebSocketUrl } from "../use-websocket";

/** Minimal stand-in for the browser WebSocket, driven by the test. */
class FakeWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
  }

  /** The server accepted the connection. */
  accept() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  /** The connection dropped. */
  drop() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }

  static latest(): FakeWebSocket {
    const last = FakeWebSocket.instances.at(-1);
    if (!last) throw new Error("no socket was opened");
    return last;
  }

  static reset() {
    FakeWebSocket.instances = [];
  }
}

const originalWebSocket = globalThis.WebSocket;

const { useWebSocket, reconnectDelay } = await import("../use-websocket");

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(() => {
  FakeWebSocket.reset();
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
});

afterEach(() => {
  // Every mounted hook has a reconnect timer pending; without this they fire
  // during the next test and open sockets the unmount test then counts.
  cleanup();
  globalThis.WebSocket = originalWebSocket;
});

describe("reconnect backoff", () => {
  test("the delay grows exponentially", () => {
    expect(reconnectDelay(0)).toBe(1000);
    expect(reconnectDelay(1)).toBe(2000);
    expect(reconnectDelay(2)).toBe(4000);
  });

  test("the delay is capped so a long outage still retries", () => {
    expect(reconnectDelay(6)).toBe(30000);
    expect(reconnectDelay(20)).toBe(30000);
  });
});

describe("resolveWebSocketUrl", () => {
  const http = { protocol: "http:", host: "localhost:3000" };
  const https = { protocol: "https:", host: "taskflow.example" };

  test("passes an absolute URL through", () => {
    expect(resolveWebSocketUrl("ws://localhost:4001", http)).toBe("ws://localhost:4001");
    expect(resolveWebSocketUrl("wss://live.example/ws", https)).toBe("wss://live.example/ws");
  });

  test("resolves the same-origin path the Docker image ships", () => {
    // The browser WebSocket constructor throws on a relative URL, so leaving
    // this one alone would break every deployed socket.
    expect(resolveWebSocketUrl("/ws", http)).toBe("ws://localhost:3000/ws");
  });

  test("upgrades to wss on a secure page", () => {
    expect(resolveWebSocketUrl("/ws", https)).toBe("wss://taskflow.example/ws");
  });

  test("adds a missing leading slash", () => {
    expect(resolveWebSocketUrl("ws", http)).toBe("ws://localhost:3000/ws");
  });

  test("falls back to the local dev server when unconfigured", () => {
    expect(resolveWebSocketUrl(undefined, http)).toBe("ws://localhost:4001");
    expect(resolveWebSocketUrl("", http)).toBe("ws://localhost:4001");
  });
});

describe("useWebSocket", () => {
  test("subscribes to the project on open", async () => {
    renderHook(() => useWebSocket(7, () => {}));
    await act(async () => {
      FakeWebSocket.latest().accept();
    });

    expect(FakeWebSocket.latest().sent).toEqual([
      JSON.stringify({ type: "PROJECT_SUBSCRIBE", projectId: 7 }),
    ]);
  });

  test("delivers an event to the handler", async () => {
    const seen: string[] = [];
    renderHook(() => useWebSocket(7, (e) => seen.push(e.type)));
    await act(async () => {
      FakeWebSocket.latest().accept();
    });

    await act(async () => {
      FakeWebSocket.latest().onmessage?.({
        data: JSON.stringify({ type: "TASK_MOVED", projectId: 7, payload: {} }),
      });
    });

    expect(seen).toEqual(["TASK_MOVED"]);
  });

  test("the first connection is not treated as a reconnect", async () => {
    let resubscribes = 0;
    renderHook(() => useWebSocket(7, () => {}, () => { resubscribes += 1; }));

    await act(async () => {
      FakeWebSocket.latest().accept();
    });

    expect(resubscribes).toBe(0);
  });

  test("a dropped connection is retried", async () => {
    renderHook(() => useWebSocket(7, () => {}));
    await act(async () => {
      FakeWebSocket.latest().accept();
    });
    expect(FakeWebSocket.instances).toHaveLength(1);

    await act(async () => {
      FakeWebSocket.latest().drop();
    });
    await act(async () => {
      await wait(1200);
    });

    expect(FakeWebSocket.instances.length).toBeGreaterThan(1);
  });

  test("reconnecting tells the caller to resynchronise", async () => {
    // Events published while the socket was down were never delivered, so the
    // board has to be told to refetch rather than keep patching from events.
    let resubscribes = 0;
    renderHook(() => useWebSocket(7, () => {}, () => { resubscribes += 1; }));

    await act(async () => {
      FakeWebSocket.latest().accept();
    });
    await act(async () => {
      FakeWebSocket.latest().drop();
    });
    await act(async () => {
      await wait(1200);
    });
    await act(async () => {
      FakeWebSocket.latest().accept();
    });

    expect(resubscribes).toBe(1);
  });

  test("every later reconnect asks for a resynchronise again", async () => {
    let resubscribes = 0;
    renderHook(() => useWebSocket(7, () => {}, () => { resubscribes += 1; }));

    for (let i = 0; i < 2; i += 1) {
      await act(async () => {
        FakeWebSocket.latest().accept();
      });
      await act(async () => {
        FakeWebSocket.latest().drop();
      });
      await act(async () => {
        await wait(1200);
      });
    }
    await act(async () => {
      FakeWebSocket.latest().accept();
    });

    expect(resubscribes).toBe(2);
  });

  test("connected is false while the socket is down", async () => {
    const { result } = renderHook(() => useWebSocket(7, () => {}));
    await act(async () => {
      FakeWebSocket.latest().accept();
    });
    await waitFor(() => expect(result.current.connected).toBe(true));

    await act(async () => {
      FakeWebSocket.latest().drop();
    });

    await waitFor(() => expect(result.current.connected).toBe(false));
  });

  test("unmounting stops the retries", async () => {
    const { unmount } = renderHook(() => useWebSocket(7, () => {}));
    await act(async () => {
      FakeWebSocket.latest().accept();
    });

    await act(async () => {
      FakeWebSocket.latest().drop();
    });
    await act(async () => {
      unmount();
    });
    const opened = FakeWebSocket.instances.length;

    await act(async () => {
      await wait(1300);
    });

    expect(FakeWebSocket.instances).toHaveLength(opened);
  });
});
