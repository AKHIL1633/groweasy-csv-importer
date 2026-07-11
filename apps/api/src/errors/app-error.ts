import type { ApiErrorCode } from "@groweasy/shared";

// Base for every error that is safe to translate directly into an HTTP
// response — see docs/09-coding-guidelines.md §3. `isOperational` exists so
// the error middleware can distinguish "an anticipated failure with a
// user-facing message" from "a bug," even though only one concrete subclass
// exists yet — see OperationalError below.
export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly code: ApiErrorCode;
  readonly isOperational = true;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

// A directly-instantiable AppError for known, anticipated failures that
// don't yet have (or don't need) a dedicated named subclass — e.g. the Not
// Found middleware. Endpoint-specific subclasses (ValidationError,
// PayloadTooLargeError, ...) are added when the endpoints that throw them
// are built, per docs/09-coding-guidelines.md §2 ("no premature abstraction").
export class OperationalError extends AppError {
  constructor(
    readonly statusCode: number,
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
  }
}
