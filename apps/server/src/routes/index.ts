import { Router } from "express";
import { authRouter } from "./auth.routes.js";
import { projectRouter } from "./project.routes.js";
import { taskRouter } from "./task.routes.js";
import { dependencyRouter } from "./dependency.routes.js";
import { aiRouter } from "./ai.routes.js";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/projects", projectRouter);
apiRouter.use("/tasks", taskRouter);
apiRouter.use("/dependencies", dependencyRouter);
apiRouter.use("/ai", aiRouter);