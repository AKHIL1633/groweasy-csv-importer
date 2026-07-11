import type { ApiResponse } from "@groweasy/shared";
import { Router } from "express";

interface HealthStatus {
  status: "ok";
  uptime: number;
}

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  const body: ApiResponse<HealthStatus> = { data: { status: "ok", uptime: process.uptime() } };
  res.json(body);
});
