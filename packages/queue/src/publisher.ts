import type { RedisDomainEvent } from "@repo/types";
import { projectChannel } from "./channels.js";
import { redisPublisher } from "./redis.js";

export async function publishDomainEvent(event: RedisDomainEvent): Promise<void> {
  const json = JSON.stringify(event);
  if (redisPublisher.status === "wait") {
    await redisPublisher.connect();
  }
  await redisPublisher.publish(projectChannel(event.projectId), json);
}
