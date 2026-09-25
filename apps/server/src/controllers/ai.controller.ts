import type { Request, Response } from "express";
import { aiService } from "../services/ai.service.js";

export const aiController = {
  generate: async (req: Request, res: Response) => {
    const data = await aiService.generateSuggestions(
      Number(req.params.projectId),
      Number(req.body.taskId),
      req.user!.userId,
    );
    res.json({ success: true, data });
  },
  accept: async (req: Request, res: Response) => {
    const data = await aiService.acceptSuggestion(
      Number(req.params.suggestionId),
      req.user!.userId,
    );
    res.json({ success: true, data });
  },
  reject: async (req: Request, res: Response) => {
    const data = await aiService.rejectSuggestion(
      Number(req.params.suggestionId),
      req.user!.userId,
    );
    res.json({ success: true, data });
  },
};
