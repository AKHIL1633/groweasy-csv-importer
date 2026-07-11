import { z } from "zod";
import { API_ERROR_CODES } from "../constants/error-codes";

export const apiErrorCodeSchema = z.enum([...API_ERROR_CODES]);

export const apiErrorSchema = z.object({
  code: apiErrorCodeSchema,
  message: z.string(),
  details: z.unknown().optional(),
});

// docs/05-api-design.md §1: "All error responses: `{ error: {...} }`".
export const apiErrorResponseSchema = z.object({
  error: apiErrorSchema,
});

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
