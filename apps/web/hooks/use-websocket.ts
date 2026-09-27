import { useState, useEffect, useRef, useCallback } from "react";
import { apiClient } from "@/lib/api-client";
import type { TaskEventType } from "@repo/types";

interface WSEvent {
  type: TaskEventType;
  projectId: number;
  taskId?: number;
  payload: Record<string, unknown>;
}

export function useWebSocket(projectId: number, onEvent: (event: WSEvent) => void) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  const connect = useCallback(() => {
    // Don't connect if projectId is invalid (0, negative, NaN)
    if (!projectId || projectId <= 0) {
      return;
    }
    
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:4001";
    try {
      const ws = new WebSocket(`${wsUrl}?projectId=${projectId}`);

      ws.onopen = () => {
        setConnected(true);
        setReconnectAttempts(0);
        ws.send(JSON.stringify({ type: "PROJECT_SUBSCRIBE", projectId }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          onEvent(data as WSEvent);
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        setConnected(false);
        // Reconnect with backoff
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
        setReconnectAttempts((prev) => prev + 1);
        setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws.close();
      };

      wsRef.current = ws;
    } catch {
      // WebSocket not available, REST-based fallback
    }
  }, [projectId, onEvent, reconnectAttempts]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);

  return { connected };
}

export function useWebSocketEvents(projectId: number) {
  const [events, setEvents] = useState<WSEvent[]>([]);
  const handleEvent = useCallback((event: WSEvent) => {
    setEvents((prev) => [...prev, event]);
  }, []);

  const { connected } = useWebSocket(projectId, handleEvent);
  return { events, connected };
}
