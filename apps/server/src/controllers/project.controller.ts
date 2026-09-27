import type { Request, Response } from "express";
import { projectService } from "../services/project.service.js";

export const projectController = {
  create: async (req: Request, res: Response) => {
    const data = await projectService.createProject(req.body, req.user!.userId);
    res.status(201).json({ success: true, data });
  },
  list: async (req: Request, res: Response) => {
    const data = await projectService.getProjects(req.user!.userId);
    res.json({ success: true, data });
  },
  get: async (req: Request, res: Response) => {
    const data = await projectService.getProject(Number(req.params.projectId), req.user!.userId);
    res.json({ success: true, data });
  },
  update: async (req: Request, res: Response) => {
    const data = await projectService.updateProject(
      Number(req.params.projectId),
      req.body,
      req.user!.userId,
    );
    res.json({ success: true, data });
  },
  remove: async (req: Request, res: Response) => {
    await projectService.deleteProject(Number(req.params.projectId), req.user!.userId);
    res.json({ success: true, data: { deleted: true } });
  },
  addMember: async (req: Request, res: Response) => {
    const data = await projectService.addMember(
      Number(req.params.projectId),
      req.body,
      req.user!.userId,
    );
    res.status(201).json({ success: true, data });
  },
  removeMember: async (req: Request, res: Response) => {
    await projectService.removeMember(
      Number(req.params.projectId),
      Number(req.params.userId),
      req.user!.userId,
    );
    res.json({ success: true, data: { removed: true } });
  },
  preview: async (req: Request, res: Response) => {
    const data = await projectService.getProjectPreview(Number(req.params.projectId));
    res.json({ success: true, data });
  },
  members: async (req: Request, res: Response) => {
    const data = await projectService.getMembers(Number(req.params.projectId), req.user!.userId);
    res.json({ success: true, data });
  },
  join: async (req: Request, res: Response) => {
    const data = await projectService.joinProject(Number(req.params.projectId), req.user!.userId);
    res.json({ success: true, data });
  },
};
