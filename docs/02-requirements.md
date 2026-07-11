# 02 — Requirements

Requirements are numbered so later docs (API design, implementation plan) can reference
them by ID (e.g. `FR-3`, `NFR-2`).

## Functional Requirements

### Frontend

| ID   | Requirement                                                                                                                                    |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-1 | User can upload a CSV via drag-and-drop or a file picker.                                                                                      |
| FR-2 | On upload, the file is parsed **client-side** and a preview table is shown. No network call to the backend happens at this point.              |
| FR-3 | The preview table supports horizontal + vertical scrolling, sticky headers, and is responsive down to mobile widths.                           |
| FR-4 | A visible "Confirm" action exists; the backend import API is only called after the user explicitly confirms.                                   |
| FR-5 | After confirmation, the UI shows a loading/progress state while AI extraction runs.                                                            |
| FR-6 | On success, the UI renders a results table of AI-extracted CRM records, distinct from the raw preview table.                                   |
| FR-7 | The results view shows: successfully parsed records, skipped records (with a reason, if available), total imported count, total skipped count. |
| FR-8 | Upload/parse/import errors are surfaced to the user in a legible, non-technical way (not a raw stack trace).                                   |
| FR-9 | The app is usable on both desktop and mobile viewport widths.                                                                                  |

### Backend

| ID    | Requirement                                                                                                                                                                                                                                                                                       |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-10 | Expose an endpoint that accepts a CSV file upload (`multipart/form-data`), independent of what the frontend may have already parsed.                                                                                                                                                              |
| FR-11 | The backend parses the CSV itself as the source of truth — it must not assume a fixed set of column names or column order.                                                                                                                                                                        |
| FR-12 | Parsed rows are grouped into batches and sent to an LLM for field mapping/extraction.                                                                                                                                                                                                             |
| FR-13 | The LLM maps arbitrary source columns onto the fixed 15-field GrowEasy CRM schema (`created_at`, `name`, `email`, `country_code`, `mobile_without_country_code`, `company`, `city`, `state`, `country`, `lead_owner`, `crm_status`, `crm_note`, `data_source`, `possession_time`, `description`). |
| FR-14 | `crm_status` is restricted to: `GOOD_LEAD_FOLLOW_UP`, `DID_NOT_CONNECT`, `BAD_LEAD`, `SALE_DONE`, or blank.                                                                                                                                                                                       |
| FR-15 | `data_source` is restricted to: `leads_on_demand`, `meridian_tower`, `eden_park`, `varah_swamy`, `sarjapur_plots`, or blank if no confident match.                                                                                                                                                |
| FR-16 | `created_at` must be a value for which `new Date(created_at)` in JavaScript produces a valid (non-`Invalid Date`) result.                                                                                                                                                                         |
| FR-17 | When a row has multiple emails, the first is used for `email`; the rest are appended into `crm_note`. Same rule for mobile numbers into `mobile_without_country_code`.                                                                                                                            |
| FR-18 | A row with neither an email nor a mobile number (in any recognizable column) is skipped and counted, not silently dropped.                                                                                                                                                                        |
| FR-19 | Free-text output fields (`crm_note`, `description`) must not contain raw, unescaped newlines that would break single-row CSV representation; embedded newlines are escaped (e.g. `\n`).                                                                                                           |
| FR-20 | The API returns structured JSON: extracted records, skipped records (with reasons), and summary counts.                                                                                                                                                                                           |
| FR-21 | The AI extraction backend is swappable (Gemini today, OpenAI/Claude later) without changes to controllers, routes, or the request/response contract.                                                                                                                                              |

## Non-Functional Requirements

| ID     | Requirement                                                                                                                                                                                                           |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-1  | **Statelessness** — no database; nothing about a request depends on state left behind by a previous request.                                                                                                          |
| NFR-2  | **Type safety** — strict TypeScript across frontend, backend, and shared package; no `any`.                                                                                                                           |
| NFR-3  | **Shared contracts** — request/response shapes, the CRM schema, and enum values are defined once in a shared package and imported by both apps (no duplicated type or magic-string definitions).                      |
| NFR-4  | **Centralized error handling** — the backend has one error-handling path (middleware) producing a consistent JSON error envelope; the frontend has one place that turns API/network errors into user-facing messages. |
| NFR-5  | **Resilience to partial AI failure** — one failed/malformed batch must not fail the entire import; failures are isolated and reported per-batch.                                                                      |
| NFR-6  | **Bounded resource usage** — upload size is capped; batch size and AI concurrency are capped and configurable via environment variables, so a large file can't exhaust memory or blow through rate limits.            |
| NFR-7  | **Responsiveness under load** — large CSVs (thousands of rows) must not freeze the UI (virtualized/paginated rendering) or block the Node event loop (streaming parse, bounded batch concurrency).                    |
| NFR-8  | **Provider independence** — swapping the LLM provider requires changing only the AI provider implementation + config, never the service/controller layer.                                                             |
| NFR-9  | **Testability** — services and the AI provider boundary are pure/injectable enough to unit test without a live network call or a real file upload.                                                                    |
| NFR-10 | **Observability** — structured server-side logging of each import (row count, batch count, batch failures, duration) sufficient to debug a bad import after the fact, without persisting user data.                   |
| NFR-11 | **Security baseline** — file-type/size validation, CORS restricted to the known frontend origin, no secrets in client bundles or source control, standard HTTP security headers.                                      |
| NFR-12 | **Accessibility & responsiveness** — layouts work down to common mobile breakpoints; interactive elements are keyboard-reachable; loading/error states are announced, not just visual.                                |
| NFR-13 | **Reproducible setup** — a fresh clone can be running locally (frontend + backend) by following the README, with a documented `.env.example`.                                                                         |

## Explicit Constraints (from the brief, non-negotiable)

- Frontend: Next.js. Backend: Node.js + Express. Both in TypeScript.
- AI: Gemini for this implementation, but abstracted behind a provider-agnostic interface.
- No database unless a specific need is identified and justified (none was identified —
  see `03-system-architecture.md` §6).
- Controllers thin, business logic in services, dependency inversion only where it adds
  value (the AI provider boundary — not everywhere).

## Bonus Scope (tracked separately, not required for core correctness)

Drag & drop (folded into FR-1 since it's nearly free with a good upload component),
AI-processing progress indicators, streaming/incremental parsing, retry for failed AI
batches, virtualized results table, dark mode, unit tests, Docker, hosted deployment,
README. These are prioritized in `10-implementation-plan.md` as a distinct phase so the
core flow is solid before any bonus work begins.
