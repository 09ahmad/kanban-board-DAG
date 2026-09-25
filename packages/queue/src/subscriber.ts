import type { RedisDomainEvent } from "@repo/types";
import { projectChannel } from "./channels.js";
import { redisSubscriber } from "./redis.js";

export type DomainEventCallback = (event: RedisDomainEvent, raw: string) => void;

const listeners = new Map<string, Set<DomainEventCallback>>();
let messageHandlerBound = false;

function ensureMessageHandler(): void {
  if (messageHandlerBound) return;
  messageHandlerBound = true;
  redisSubscriber.on("message", (channel: string, message: string) => {
    const callbacks = listeners.get(channel);
    if (!callbacks) return;
    let parsed: RedisDomainEvent;
    try {
      parsed = JSON.parse(message) as RedisDomainEvent;
    } catch {
      return;
    }
    for (const cb of callbacks) {
      cb(parsed, message);
    }
  });
}

export async function subscribeToProject(
  projectId: number,
  cb: DomainEventCallback,
): Promise<void> {
  ensureMessageHandler();
  const channel = projectChannel(projectId);
  const existing = listeners.get(channel);
  if (!existing) {
    listeners.set(channel, new Set([cb]));
    if (redisSubscriber.status === "wait") {
      await redisSubscriber.connect();
    }
    await redisSubscriber.subscribe(channel);
  } else {
    existing.add(cb);
  }
}

export async function unsubscribeFromProject(
  projectId: number,
  cb: DomainEventCallback,
): Promise<void> {
  const channel = projectChannel(projectId);
  const existing = listeners.get(channel);
  if (!existing) return;
  existing.delete(cb);
  if (existing.size === 0) {
    listeners.delete(channel);
    await redisSubscriber.unsubscribe(channel);
  }
}
