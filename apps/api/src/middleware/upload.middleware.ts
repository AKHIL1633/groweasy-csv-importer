import { ACCEPTED_CSV_MIME_TYPES, MAX_UPLOAD_SIZE_MB } from "@groweasy/shared";
import type { NextFunction, Request, Response } from "express";
import multer, { MulterError } from "multer";
import { OperationalError } from "../errors/app-error";

const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024;

const singleCsvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_SIZE_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const hasCsvExtension = file.originalname.toLowerCase().endsWith(".csv");
    const hasAcceptedMimeType = ACCEPTED_CSV_MIME_TYPES.includes(file.mimetype);

    if (!hasCsvExtension || !hasAcceptedMimeType) {
      cb(
        new OperationalError(
          400,
          "UNSUPPORTED_FILE_TYPE",
          `Unsupported file type "${file.mimetype || "unknown"}". Please upload a .csv file.`,
        ),
      );
      return;
    }

    cb(null, true);
  },
}).single("file");

// Wraps multer as a plain (req, res, next) middleware so every failure mode
// (fileFilter rejection, size limit, malformed multipart body) is
// translated into the existing AppError architecture before it reaches the
// centralized error handler — that handler only ever needs to know about
// AppError, never about multer.
export function uploadMiddleware(req: Request, res: Response, next: NextFunction): void {
  singleCsvUpload(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }

    if (err instanceof OperationalError) {
      next(err);
      return;
    }

    if (err instanceof MulterError) {
      next(translateMulterError(err));
      return;
    }

    next(
      new OperationalError(
        400,
        "VALIDATION_ERROR",
        "The upload could not be processed. Ensure you're sending a valid multipart/form-data request with a single CSV file.",
      ),
    );
  });
}

function translateMulterError(err: MulterError): OperationalError {
  switch (err.code) {
    case "LIMIT_FILE_SIZE":
      return new OperationalError(
        413,
        "PAYLOAD_TOO_LARGE",
        `File exceeds the maximum size of ${MAX_UPLOAD_SIZE_MB}MB.`,
      );
    case "LIMIT_UNEXPECTED_FILE":
      return new OperationalError(
        400,
        "VALIDATION_ERROR",
        `Unexpected upload field "${err.field ?? ""}". Upload the file using the "file" field.`,
      );
    default:
      return new OperationalError(400, "VALIDATION_ERROR", err.message);
  }
}
