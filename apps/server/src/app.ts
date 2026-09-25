import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { prisma } from "@repo/db/client";
import { redis } from "@repo/queue";
import { config } from "./config/env.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { apiRouter } from "./routes/index.js";

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan(config.nodeEnv === "production" ? "combined" : "dev"));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/ready", async (_req, res, next) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      if (redis.status === "wait") {
        await redis.connect();
      }
      await redis.ping();
      res.json({ status: "ok" });
    } catch (err) {
      next(err);
    }
  });

  app.use("/api/v1", apiRouter);
  app.use(errorHandler);
  return app;
}
