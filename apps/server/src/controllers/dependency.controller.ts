import type { Request, Response } from "express";
import { dependencyService } from "../services/dependency.service.js";

export const dependencyController = {
  create: async (req: Request, res: Response) => {
    const data = await dependencyService.createDependency(
      Number(req.params.projectId),
      req.body,
      req.user!.userId,
    );
    res.status(201).json({ success: true, data });
  },
  remove: async (req: Request, res: Response) => {
    await dependencyService.deleteDependency(Number(req.params.dependencyId), req.user!.userId);
    res.json({ success: true, data: { deleted: true } });
  },
  graph: async (req: Request, res: Response) => {
    const data = await dependencyService.getProjectGraph(
      Number(req.params.projectId),
      req.user!.userId,
    );
    res.json({ success: true, data });
  },
  criticalPath: async (req: Request, res: Response) => {
    const data = await dependencyService.getCriticalPath(
      Number(req.params.projectId),
      req.user!.userId,
    );
    res.json({ success: true, data });
  },
  events: async (req: Request, res: Response) => {
    const query = req.query as { limit?: number; before?: number };
    const data = await dependencyService.getEvents(
      Number(req.params.projectId),
      req.user!.userId,
      query.limit ?? 50,
      query.before,
    );
    res.json({ success: true, data });
  },
};
