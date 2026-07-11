import { API_ROUTES } from "@groweasy/shared";
import { Router } from "express";
import { healthRouter } from "./health.routes";
import { importsRouter } from "./imports.routes";

export function createRouter(): Router {
  const router = Router();

  router.use(API_ROUTES.HEALTH, healthRouter);
  router.use(API_ROUTES.IMPORTS, importsRouter);

  return router;
}
