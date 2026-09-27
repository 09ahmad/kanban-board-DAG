import { useState, useEffect, useRef, useCallback } from "react";
import type { TaskEventType, WsEventBroadcast } from "@repo/types";
import { summariseRemoteEvents } from "@/lib/remote-activity";
import { useToast } from "@/components/toaster";
import { useAuth } from "@/lib/auth-context";

interface WSEvent extends WsEventBroadcast {}

/**
 * How long remote changes are collected before speaking. Long enough that a
 * teammate dragging a card across three columns produces one line, short enough
 * that a single change still feels immediate.
 */
const REMOTE_ACTIVITY_WINDOW_MS = 1200;

const MAX_RECONNECT_ATTEMPTS = 10;
const MAX_RECONNECT_DELAY = 30000;

/** Exponential backoff, capped so a long outage still keeps trying. */
export function reconnectDelay(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt), MAX_RECONNECT_DELAY);
}

/**
 * The browser WebSocket constructor rejects relative URLs, so a same-origin
 * path — which is what the Docker image ships, to keep the browser on one
 * origin — has to be resolved against the page first.
 */
export function resolveWebSocketUrl(
  configured: string | undefined,
  origin: { protocol: string; host: string } = window.location
): string {
  const raw = configured || "ws://localhost:4001";
  if (/^wss?:\/\//i.test(raw)) return raw;
  const scheme = origin.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${origin.host}${raw.startsWith("/") ? raw : `/${raw}`}`;
}

export function useWebSocket(
  projectId: number,
  onEvent: (event: WSEvent) => void,
  onReconnect?: () => void
) {
  const wsRef = useRef<WebSocket | null>(null);
  const attemptsRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);
  const hasConnectedRef = useRef(false);
  const [connected, setConnected] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const userId = user?.id ?? null;

  // Remote activity is collected here rather than in the pages because this hook
  // already sees every event for the project, and the two pages that use it are
  // busy enough. If the notification ever wants its own surface, lift
  // collectRemoteActivity into a useRemoteActivity hook and call it from the
  // board page instead.
  const remoteRef = useRef<WsEventBroadcast[]>([]);
  const remoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const collectRemoteActivity = useCallback((event: WsEventBroadcast) => {
    remoteRef.current = [...remoteRef.current, event];
    if (remoteTimerRef.current) return;

    remoteTimerRef.current = setTimeout(() => {
      remoteTimerRef.current = null;
      const batch = remoteRef.current;
      remoteRef.current = [];

      const message = summariseRemoteEvents(batch, userIdRef.current);
      if (message) toastRef.current?.({ type: "info", message });
    }, REMOTE_ACTIVITY_WINDOW_MS);
  }, []);

  // Read through refs so the socket effect never has to be rebuilt when the
  // signed-in user changes, which would drop the connection.
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const onReconnectRef = useRef(onReconnect);
  onReconnectRef.current = onReconnect;

  const connect = useCallback(() => {
    if (unmountedRef.current) return;
    if (!projectId || projectId <= 0) return;
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return;

    const wsUrl = resolveWebSocketUrl(process.env.NEXT_PUBLIC_WS_URL);
    try {
      const ws = new WebSocket(`${wsUrl}?projectId=${projectId}`);

      ws.onopen = () => {
        attemptsRef.current = 0;
        setReconnectAttempts(0);
        setConnected(true);
        ws.send(JSON.stringify({ type: "PROJECT_SUBSCRIBE", projectId }));

        // Anything published while the socket was down never reached this tab, so
        // the first open is silent and every later one asks for a resync.
        if (hasConnectedRef.current) onReconnectRef.current?.();
        hasConnectedRef.current = true;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WSEvent;
          onEventRef.current(data);
          collectRemoteActivity(data);
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        if (unmountedRef.current) return;
        if (attemptsRef.current >= MAX_RECONNECT_ATTEMPTS) return;
        const delay = reconnectDelay(attemptsRef.current);
        attemptsRef.current += 1;
        setReconnectAttempts(attemptsRef.current);
        timerRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws.close();
      };

      wsRef.current = ws;
    } catch {
      // WebSocket construction failed; REST remains the source of truth
    }
  }, [projectId]);

  useEffect(() => {
    unmountedRef.current = false;
    attemptsRef.current = 0;
    connect();
    return () => {
      unmountedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (remoteTimerRef.current) {
        clearTimeout(remoteTimerRef.current);
        remoteTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      setConnected(false);
    };
  }, [connect]);

  return { connected, reconnectAttempts };
}