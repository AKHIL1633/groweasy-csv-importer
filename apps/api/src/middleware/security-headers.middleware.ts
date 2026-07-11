import type { NextFunction, Request, Response } from "express";

// A handful of response headers relevant to a JSON-only API with no cookies
// or rendered HTML — deliberately not the full helmet() header suite (CSP,
// HSTS, frame-ancestors, etc. are aimed at HTML-serving apps with sessions,
// which this isn't). Hand-rolled rather than a new dependency since this is
// the entire relevant subset for this API's actual attack surface.
export function securityHeadersMiddleware(_req: Request, res: Response, next: NextFunction): void {
  // Stops a browser from MIME-sniffing the response into something other
  // than the declared application/json — the standard mitigation for
  // content-type confusion attacks.
  res.setHeader("X-Content-Type-Options", "nosniff");
  // This API is never meant to be embedded in a frame; blocks clickjacking
  // vectors that don't apply to a JSON API but cost nothing to close off.
  res.setHeader("X-Frame-Options", "DENY");
  next();
}
