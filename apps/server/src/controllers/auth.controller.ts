import type { Request, Response } from "express";
import { authService } from "../services/auth.service.js";

export const authController = {
  register: async (req: Request, res: Response) => {
    const data = await authService.register(req.body);
    res.status(201).json({ success: true, data });
  },
  login: async (req: Request, res: Response) => {
    const data = await authService.login(req.body);
    res.status(200).json({ success: true, data });
  },
  logout: async (_req: Request, res: Response) => {
    res.status(200).json({ success: true, data: { loggedOut: true } });
  },
  me: async (req: Request, res: Response) => {
    const data = await authService.me(req.user!.userId);
    res.status(200).json({ success: true, data });
  },
};
