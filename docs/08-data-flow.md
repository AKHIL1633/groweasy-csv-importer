# 08 — Data Flow

## 1. End-to-end sequence (MVP, buffered response)

```
User                Frontend (apps/web)              Backend (apps/api)              Gemini
 │                        │                                  │                          │
 │ selects/drops file     │                                  │                          │
 ├───────────────────────►│                                  │                          │
 │                        │ client-side validate (type/size, │                          │
 │                        │ using shared limits constants)   │                          │
 │                        │ parseCsv(file) [shared util]      │                          │
 │                        │ render preview table               │                          │
 │                        │ (NO network call — FR-2)          │                          │
 │                        │                                  │                          │
 │ clicks Confirm         │                                  │                          │
 ├───────────────────────►│                                  │                          │
 │                        │ POST /api/imports                │                          │
 │                        │  (multipart, raw file, disable   │                          │
 │                        │   Confirm button, show loading)  │                          │
 │                        ├─────────────────────────────────►│                          │
 │                        │                                  │ multer: buffer to memory │
 │                        │                                  │ validate size/type        │
 │                        │                                  │ CsvParsingService:         │
 │                        │                                  │  parseCsv(buffer) [shared] │
 │                        │                                  │  (source of truth parse)  │
 │                        │                                  │ reject early if 0 rows or │
 │                        │                                  │  too many rows            │
 │                        │                                  │                          │
 │                        │                                  │ ImportService:            │
 │                        │                                  │  chunk rows into batches  │
 │                        │                                  │  (size = AI_BATCH_SIZE)   │
 │                        │                                  │                          │
 │                        │                                  ├── batch 1 ──────────────►│
 │                        │                                  ├── batch 2 ──────────────►│ (bounded
 │                        │                                  ├── batch 3 ──────────────►│  concurrency)
 │                        │                                  │◄── structured JSON ───────┤
 │                        │                                  │◄── structured JSON ───────┤
 │                        │                                  │◄── structured JSON (or    │
 │                        │                                  │    retry/fail) ───────────┤
 │                        │                                  │                          │
 │                        │                                  │ per record:               │
 │                        │                                  │  zod-validate              │
 │                        │                                  │  re-apply skip rule        │
 │                        │                                  │  sanitize free text        │
 │                        │                                  │  clamp enums               │
 │                        │                                  │                          │
 │                        │                                  │ aggregate:                │
 │                        │                                  │  imported[], skipped[],   │
 │                        │                                  │  summary counts            │
 │                        │                                  │                          │
 │                        │◄── 200 { data: {...} } ──────────┤                          │
 │                        │ parse response via shared zod    │                          │
 │                        │ schema (fail loud on mismatch)   │                          │
 │                        │ render results table + summary    │                          │
 │                        │ re-enable interaction              │                          │
 │◄───────────────────────┤                                  │                          │
```

## 2. Data shape transformations, step by step

| Stage                                | Shape                                                                                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Raw upload                           | `File` (browser) / `Buffer` (server)                                                                                                        |
| After `parseCsv`                     | `{ headers: string[], rows: Record<string, string>[] }`                                                                                     |
| Batch input to AI                    | subset of `rows` + `headers`, batch-indexed                                                                                                 |
| Raw AI output                        | JSON matching `responseSchema` (shape of `CrmRecord`, pre-validation)                                                                       |
| After zod validation + normalization | `CrmRecord[]` (imported) + `SkippedRecord[]` (skipped)                                                                                      |
| API response                         | `{ data: { imported: CrmRecord[], skipped: SkippedRecord[], summary } }`                                                                    |
| Frontend render                      | same shape, rendered directly into the results table — no further transformation, since the shared schema already matches what the UI needs |

Only two parse boundaries exist end-to-end: `parseCsv` (untyped file → typed rows) and
the AI extraction + validation step (typed rows → validated `CrmRecord`). Every other
step is a pure pass-through of an already-typed shape, by design — fewer transformation
points means fewer places for a bug to hide.

## 3. Failure paths

| Failure point                                                        | Behavior                                                                                                                                                                    |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client-side: file too large/wrong type                               | Rejected before any network call; inline error near the upload control.                                                                                                     |
| Client-side: `parseCsv` throws (malformed CSV)                       | Preview step shows a parse error state instead of a table; Confirm stays disabled.                                                                                          |
| Network: request fails to reach backend                              | Frontend shows a retryable error toast/banner; Confirm re-enabled.                                                                                                          |
| Backend: multer rejects (size/type)                                  | `413`/`400` with `AppError` → consistent error envelope → frontend shows the message.                                                                                       |
| Backend: CSV has 0 usable rows                                       | `422 EMPTY_OR_UNPARSEABLE_CSV`.                                                                                                                                             |
| Backend: one AI batch fails after retries                            | Import still succeeds (`200`); affected rows appear in `skipped` with `AI_EXTRACTION_FAILED`; `summary.batches.failed > 0` is visible in the UI.                            |
| Backend: **all** AI batches fail (e.g. bad API key, provider outage) | `502 UPSTREAM_AI_ERROR` — nothing useful to return, so this is a real error, not a partial success.                                                                         |
| Backend: unexpected exception anywhere in the pipeline               | Caught by the centralized error middleware → `500 INTERNAL_ERROR`, logged with stack trace server-side, generic message client-side (no stack trace leaked to the browser). |

## 4. State ownership

- **Server**: holds no state beyond the lifetime of a single request. The uploaded file
  buffer, parsed rows, and in-flight batch promises are all request-scoped local
  variables, garbage-collected once the response is sent. Nothing survives a process
  restart, and nothing needs to.
- **Client**: the 4-step wizard state (current step, parsed preview rows, upload
  in-flight flag, final result) lives in the top-level `csv-importer.tsx` component via
  `useReducer`, passed down to step components as props. This state is intentionally
  ephemeral — navigating away or refreshing resets the wizard, which is acceptable since
  there's no requirement to resume an in-progress import.

## 5. Large-file handling (performance, NFR-7)

- Client-side preview rendering uses a virtualized table body (render only visible rows)
  once row count exceeds a threshold (e.g. 200 rows), so a 10,000-row CSV doesn't produce
  10,000 live DOM rows.
- Server-side, `parseCsv` operates on the whole buffer in memory (acceptable given the
  enforced `MAX_UPLOAD_SIZE_MB`/`MAX_CSV_ROWS` ceilings — see `05-api-design.md` §2); a
  genuinely streaming parse is not necessary at this file-size ceiling and would add
  complexity (partial-batch dispatch while still reading) without a real payoff here.
- AI batching + bounded concurrency (`07-ai-design.md` §5) is what actually keeps a large
  import from either blocking the event loop or overwhelming the provider — this is the
  real performance lever, not the CSV parse itself, which matches the brief's framing
  that "the challenge is not parsing CSV files."
