import { apiErrorResponseSchema } from "@groweasy/shared";
import { z } from "zod";

// The one place API responses are validated against a shape the caller
// declares up front — never a bare type-cast (docs/09-coding-guidelines.md
// §1: "unknown external data is validated and narrowed, never cast").
// ApiResponse<T> itself stays a plain generic TS type (packages/shared —
// zod schemas can't express "for any T"), so this wraps whatever inner
// schema a caller passes in the same { data: T } envelope at the zod level.
export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

function resolveBaseUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL;

  if (!baseUrl) {
    throw new ApiClientError(
      "The application is not configured with a backend URL.",
      "CONFIG_ERROR",
      0,
    );
  }

  return baseUrl;
}

async function parseJsonBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function handleErrorResponse(response: Response): Promise<never> {
  const body = await parseJsonBody(response);
  const parsedError = apiErrorResponseSchema.safeParse(body);

  if (parsedError.success) {
    throw new ApiClientError(
      parsedError.data.error.message,
      parsedError.data.error.code,
      response.status,
    );
  }

  throw new ApiClientError(
    "Something went wrong. Please try again.",
    "UNKNOWN_ERROR",
    response.status,
  );
}

async function request<T>(path: string, dataSchema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  const baseUrl = resolveBaseUrl();

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, init);
  } catch {
    throw new ApiClientError(
      "Could not reach the server. Check your connection and try again.",
      "NETWORK_ERROR",
      0,
    );
  }

  if (!response.ok) {
    await handleErrorResponse(response);
  }

  const body = await parseJsonBody(response);
  const responseSchema = z.object({ data: dataSchema });
  const parsed = responseSchema.safeParse(body);

  if (!parsed.success) {
    throw new ApiClientError(
      "Received an unexpected response from the server.",
      "INVALID_RESPONSE",
      response.status,
    );
  }

  return parsed.data.data;
}

export const apiClient = {
  get: <T>(path: string, dataSchema: z.ZodType<T>): Promise<T> => request(path, dataSchema),

  postFormData: <T>(path: string, dataSchema: z.ZodType<T>, formData: FormData): Promise<T> =>
    request(path, dataSchema, { method: "POST", body: formData }),
};
