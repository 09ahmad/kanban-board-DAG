import type { Request, Response } from "express";
import { taskService } from "../services/task.service.js";

export const taskController = {
  create: async (req: Request, res: Response) => {
    const data = await taskService.createTask(
      Number(req.params.projectId),
      req.body,
      req.user!.userId,
    );
    res.status(201).json({ success: true, data });
  },
  list: async (req: Request, res: Response) => {
    const data = await taskService.getTasks(Number(req.params.projectId), req.user!.userId);
    res.json({ success: true, data });
  },
  get: async (req: Request, res: Response) => {
    const data = await taskService.getTask(Number(req.params.taskId), req.user!.userId);
    res.json({ success: true, data });
  },
  update: async (req: Request, res: Response) => {
    const data = await taskService.updateTask(
      Number(req.params.taskId),
      req.body,
      req.user!.userId,
    );
    res.json({ success: true, data });
  },
  move: async (req: Request, res: Response) => {
    const data = await taskService.moveTask(
      Number(req.params.taskId),
      req.body,
      req.user!.userId,
    );
    res.json({ success: true, data });
  },
  remove: async (req: Request, res: Response) => {
    await taskService.deleteTask(Number(req.params.taskId), req.user!.userId);
    res.json({ success: true, data: { deleted: true } });
  },
};
