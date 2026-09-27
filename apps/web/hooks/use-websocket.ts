import { useState, useEffect, useRef, useCallback } from "react";
import type { TaskEventType } from "@repo/types";

interface WSEvent {
  type: TaskEventType;
  projectId: number;
  taskId?: number;
  payload: Record<string, unknown>;
}

const MAX_RECONNECT_ATTEMPTS = 10;
const MAX_RECONNECT_DELAY = 30000;

/** Exponential backoff, capped so a long outage still keeps trying. */
export function reconnectDelay(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt), MAX_RECONNECT_DELAY);
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
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const onReconnectRef = useRef(onReconnect);
  onReconnectRef.current = onReconnect;

  const connect = useCallback(() => {
    if (unmountedRef.current) return;
    if (!projectId || projectId <= 0) return;
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return;

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:4001";
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
          const data = JSON.parse(event.data);
          onEventRef.current(data as WSEvent);
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