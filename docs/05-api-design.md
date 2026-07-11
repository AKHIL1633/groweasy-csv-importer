# 05 — API Design

## 1. Conventions

- Base path: `/api`.
- JSON in, JSON out, except the import endpoint which accepts `multipart/form-data`.
- All success responses: `{ data: ... }`. All error responses: `{ error: { code, message, details? } }`.
- HTTP status codes are meaningful (`400` for validation, `413` for payload too large,
  `422` for a semantically invalid CSV, `502` for upstream AI failure, `500` for
  unexpected).
- Every response type is a shared zod schema from `packages/shared`, so the frontend's
  `api-client.ts` parses responses through the same schema the backend used to produce
  them — a response that doesn't match the contract fails loudly in dev rather than
  silently rendering `undefined`.

## 2. Endpoints

### `POST /api/imports`

The one functional endpoint. Accepts a CSV file, parses it, runs AI extraction, returns
CRM records.

**Request**: `multipart/form-data`

| Field  | Type   | Notes                   |
| ------ | ------ | ----------------------- |
| `file` | binary | the CSV file. Required. |

Constraints (enforced by `middleware/upload.middleware.ts` + shared schema, values sourced from `packages/shared/constants/limits.ts`):

- MIME type / extension: `.csv`, `text/csv`, or `application/vnd.ms-excel` (some
  browsers/OSes mislabel CSVs) — validated by sniffing content, not trusting the header alone.
- Max file size: default 5 MB (configurable via `MAX_UPLOAD_SIZE_MB`).
- Max row count: default 10,000 (configurable via `MAX_CSV_ROWS`) — beyond this, reject
  early with a clear error rather than accepting and timing out later.

**Response `200`**

```jsonc
{
  "data": {
    "imported": [
      {
        "created_at": "2026-05-13 14:20:48",
        "name": "John Doe",
        "email": "john.doe@example.com",
        "country_code": "+91",
        "mobile_without_country_code": "9876543210",
        "company": "GrowEasy",
        "city": "Mumbai",
        "state": "Maharashtra",
        "country": "India",
        "lead_owner": "test@gmail.com",
        "crm_status": "GOOD_LEAD_FOLLOW_UP",
        "crm_note": "Client is asking to reschedule demo",
        "data_source": "",
        "possession_time": "",
        "description": "",
      },
    ],
    "skipped": [
      {
        "row": 7,
        "reason": "MISSING_CONTACT_INFO",
        "raw": { "Name": "Anon Lead", "Notes": "called, no number given" },
      },
    ],
    "summary": {
      "totalRows": 42,
      "totalImported": 40,
      "totalSkipped": 2,
      "batches": { "total": 2, "failed": 0 },
    },
  },
}
```

**Error responses** (see §4 for the shared error taxonomy): `400` malformed multipart /
missing file, `413` file too large, `422` CSV parses but has no usable columns at all
(e.g. not actually a CSV), `502` AI provider unavailable/failed on every batch.

Note: a _partial_ AI failure (some batches succeed, some don't) is still a `200` — the
response's `summary.batches.failed` and per-row skip reasons communicate the partial
failure instead of failing the whole HTTP call, because the user still gets a usable
result for the rows that succeeded. This is a deliberate product decision: an import that
imports 38 of 40 leads and tells you about the 2 that failed is more useful than an
import that throws away all 40 because 2 failed.

### `GET /api/health`

Liveness check for the hosting platform. Returns `{ data: { status: "ok", uptime } }`.
No auth, no business logic.

### (Not built) `POST /api/imports/preview`

Deliberately **not** a backend endpoint. Preview (Step 2 in the frontend flow) is
explicitly required to do no AI processing and the brief frames it as a pre-confirmation,
client-only step. Parsing happens in the browser using the shared `parseCsv` utility.
Adding a network round trip here would be unnecessary latency for a step whose entire
purpose is instant feedback. If a future requirement needs server-side CSV validation
before confirm (e.g. to catch encoding issues the browser can't), that's an additive
`POST /api/imports/validate` endpoint sharing the same `CsvParsingService` — not a
redesign.

## 3. Batch processing contract (internal, not HTTP-exposed)

`ImportService` talks to `AiExtractionProvider` in batches; this is an internal contract,
not a separate HTTP surface. Documented here because "batch processing" is an explicit
evaluation criterion.

```ts
interface AiExtractionProvider {
  extractRecords(input: ExtractionBatchInput): Promise<ExtractionBatchResult>;
}

interface ExtractionBatchInput {
  headers: string[];
  rows: Record<string, string>[]; // raw parsed CSV rows, batch-sized slice
  batchIndex: number;
}

interface ExtractionBatchResult {
  records: RawExtractedRecord[]; // validated downstream against the CrmRecord zod schema
  batchIndex: number;
}
```

- Batch size default: 25 rows (`AI_BATCH_SIZE` env var). Chosen to keep each prompt well
  within Gemini's context window with room for few-shot examples, while keeping
  per-batch latency low enough that failures are cheap to retry.
- Concurrency: up to 3 batches in flight at once (`AI_BATCH_CONCURRENCY` env var), via a
  simple concurrency limiter — not unbounded `Promise.all`, to respect provider rate
  limits.
- Per-batch retry: up to 2 retries with exponential backoff on transient failures
  (timeout, 429, 5xx from the provider). A batch that still fails after retries is marked
  failed; its rows are reported in `skipped` with reason `AI_EXTRACTION_FAILED`, and
  `summary.batches.failed` is incremented — the rest of the import proceeds.

Full extraction/prompt design is in `07-ai-design.md`.

## 4. Error taxonomy

| Code                       | HTTP status | Meaning                                                    |
| -------------------------- | ----------- | ---------------------------------------------------------- |
| `VALIDATION_ERROR`         | 400         | Request shape invalid (missing file field, bad multipart). |
| `UNSUPPORTED_FILE_TYPE`    | 400         | File isn't CSV-like.                                       |
| `PAYLOAD_TOO_LARGE`        | 413         | File exceeds `MAX_UPLOAD_SIZE_MB`.                         |
| `EMPTY_OR_UNPARSEABLE_CSV` | 422         | CSV has no header row / no usable columns.                 |
| `TOO_MANY_ROWS`            | 422         | Row count exceeds `MAX_CSV_ROWS`.                          |
| `UPSTREAM_AI_ERROR`        | 502         | AI provider unreachable or failed on every batch.          |
| `INTERNAL_ERROR`           | 500         | Unexpected/unhandled.                                      |

All of these are thrown as typed `AppError` subclasses in the service layer and mapped to
this table by the single error-handling middleware — no route handler constructs an error
response by hand.

## 5. CORS & headers

- CORS restricted to the deployed frontend origin(s) via `ALLOWED_ORIGIN` env var
  (comma-separated list allowed for preview deployments); wildcard `*` never used in
  production config.
- Standard hardening via `helmet`.
- Request size limits enforced both at the multer layer (file) and at the Express JSON
  body-parser layer (non-file routes), so a malicious oversized body can't reach handler
  code.
