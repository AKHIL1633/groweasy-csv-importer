# 01 — Assignment Analysis

## 1. What is actually being tested

GrowEasy's stated evaluation buckets (AI prompt engineering, backend quality, frontend
quality, code quality, overall engineering) tell us this assignment is a **proxy for the
real job**: ingesting messy, third-party lead data (Facebook, Google Ads, real-estate CRM
exports, hand-made spreadsheets) into a canonical CRM schema. The CSV parsing itself is
explicitly called out as _not_ the challenge. The challenge is:

1. **Schema inference under uncertainty** — column names are unknown ahead of time and
   must be mapped to a fixed 15-field CRM schema using an LLM, not hard-coded heuristics.
2. **Reliability of AI output** — the AI's output must be structurally valid (parseable
   JSON, enum-constrained, CSV-safe) every time, not just most of the time, because it
   feeds a table the user immediately trusts as "imported CRM records."
3. **Engineering discipline under a stateless constraint** — no database, meaning all
   correctness (validation, dedupe-of-multi-value fields, skip logic) has to happen in a
   single request/response lifecycle, in memory, without a durable job store to fall back
   on.

The screenshots (GrowEasy's real product) are a strong signal: this is not a toy spec,
it is a reimplementation of a feature that already exists in their live product. The bar
is "would this pass code review at GrowEasy," not "does it technically satisfy the
checklist."

## 2. Explicit requirements (stated directly in the PDF)

- 4-step frontend flow: Upload → Preview (no AI) → Confirm → Display AI result.
- Backend: accept CSV upload, parse, batch records to an LLM, return structured JSON.
- Exactly 15 CRM fields, with `crm_status` and `data_source` constrained to fixed enums.
- `created_at` must satisfy `new Date(created_at)` in JS (i.e. any ISO-8601-ish or
  JS-parseable string works — this is a loose constraint, not a strict format).
- Multi-value email/mobile handling: first value wins the field, the rest are appended to
  `crm_note`.
- Records with neither email nor mobile must be skipped, and skipped counts must be shown.
- Output must remain valid as a single CSV row conceptually (no unescaped newlines) even
  though the transport format is JSON — this implies the AI (or a post-processor) must
  sanitize embedded newlines in free-text fields like `crm_note`/`description`.
- Tech stack is fixed for frontend/backend/AI; database is explicitly optional and the
  project should default to stateless.

## 3. Hidden / implied requirements

These are not written as bullet points but are necessary for the explicit requirements to
actually work:

- **AI output cannot be trusted blindly.** The spec says "the AI should" skip invalid
  records and use only allowed enum values — but LLMs are probabilistic. The backend must
  independently re-validate every AI-returned record (zod schema + business rule) rather
  than assuming the model followed instructions. This is a correctness requirement
  disguised as a prompting requirement.
- **Batching implies partial failure handling.** "Send records to an AI model in batches"
  only makes sense as an architectural requirement if batches can fail independently
  (rate limits, timeouts, malformed model output on one batch). The design must isolate
  batch failures so one bad batch doesn't fail the entire import.
- **Column-name independence implies the AI needs the full header row + a sample of data,
  not just headers.** Real CSVs have ambiguous headers (`"Phone"` vs `"phone_2"`, `"Date"`
  with no timezone, `"Status"` meaning something CRM-specific). The AI needs a few sample
  rows per column to disambiguate, e.g. distinguishing a `city` column from a `state`
  column when both contain proper nouns.
- **Large CSVs stress the "stateless" constraint.** Without a DB or job queue, a big file
  processed synchronously risks HTTP timeouts (esp. on serverless hosts like Vercel).
  The architecture must pick a deliberate stance on this (chunked/streamed response,
  bounded file size, or both) rather than ignoring it.
- **The frontend preview step (Step 2) must not touch the AI.** This means CSV parsing
  logic must exist independently of AI extraction, and — since the backend also parses
  the CSV independently as the source of truth — that parsing logic is a natural candidate
  for the shared package rather than being duplicated.
- **Idempotent, provider-agnostic AI boundary.** "You may use OpenAI, Gemini, Claude" plus
  the instruction to keep business logic swappable across providers means the extraction
  contract (input shape, output shape) must be provider-neutral. This is a dependency
  inversion requirement, not a suggestion.
- **CRM enum mismatches must degrade gracefully.** "If none match confidently, leave it
  blank" for `data_source` implies the AI must be explicitly allowed to abstain rather than
  guess — over-eager enum-guessing is a failure mode worth designing against.

## 4. Edge cases to design for

| #   | Edge case                                                                                 | Why it matters                                                                                                                                                                              |
| --- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Empty CSV / header-only CSV                                                               | Must not crash; should report 0 imported, 0 skipped.                                                                                                                                        |
| 2   | CSV with only one column (e.g. just emails)                                               | AI must still extract what it can.                                                                                                                                                          |
| 3   | Duplicate header names                                                                    | `email,email,phone` — parser must not silently drop a column.                                                                                                                               |
| 4   | BOM-prefixed CSV (common from Excel exports)                                              | Must strip UTF-8 BOM before parsing.                                                                                                                                                        |
| 5   | Mixed delimiters / quoting (Excel `;`-delimited exports in some locales)                  | Parser should detect or at least fail with a clear, actionable error.                                                                                                                       |
| 6   | Embedded commas, quotes, and newlines inside quoted fields                                | Standard CSV quoting rules must be respected (RFC 4180).                                                                                                                                    |
| 7   | Rows with more/fewer columns than the header                                              | Must not throw; should be treated as a malformed row and reported.                                                                                                                          |
| 8   | Non-UTF8 encodings (Windows-1252 from old Excel)                                          | At minimum, detect and surface a clear error rather than producing mojibake.                                                                                                                |
| 9   | Multiple email/phone columns, or one column with multiple values separated by `;`/`,`/`/` | Must apply "first wins, rest to crm_note" consistently.                                                                                                                                     |
| 10  | Row has phone but no email, or email but no phone                                         | Valid — only skip when _both_ are missing.                                                                                                                                                  |
| 11  | Row has neither                                                                           | Skip, and count it.                                                                                                                                                                         |
| 12  | `crm_status`/`data_source` values that don't map to any enum                              | Leave blank per spec, never invent a new enum value.                                                                                                                                        |
| 13  | Dates in `DD/MM/YYYY`, `MM-DD-YYYY`, Excel serial numbers, or already-ISO                 | Must still satisfy `new Date(created_at)`; ambiguous day/month order is a genuine risk the AI/prompt must be told how to resolve (assume a consistent convention, document the assumption). |
| 14  | Free-text fields containing raw newlines or stray double quotes                           | Must be sanitized so the record stays representable as one logical CSV row.                                                                                                                 |
| 15  | Extremely large CSV (10k+ rows)                                                           | Must not block the event loop or exceed AI context/token limits — batching + concurrency limits required.                                                                                   |
| 16  | AI returns malformed JSON for a batch                                                     | Must retry/skip that batch without failing the whole import; failed rows should be reported, not silently dropped.                                                                          |
| 17  | AI hallucinates an extra field or omits a required key                                    | Zod validation at the boundary must strip/catch this before it reaches the client.                                                                                                          |
| 18  | Duplicate leads within the same file (same email twice)                                   | Not explicitly required to dedupe — decide and document: pass both through, since dedup is a CRM-level concern GrowEasy doesn't ask for here.                                               |
| 19  | File is not actually a CSV (e.g. renamed .xlsx or image)                                  | Reject early with a clear 4xx error before wasting an AI call.                                                                                                                              |
| 20  | Upload with no file / wrong field name / empty body                                       | Standard multipart validation.                                                                                                                                                              |
| 21  | Gemini API key missing/invalid or provider outage                                         | Must fail the request with a clear 502/503-style error, not hang or crash the process.                                                                                                      |
| 22  | User double-clicks Confirm                                                                | Frontend should disable the button while a request is in flight.                                                                                                                            |

## 5. Risks

- **AI non-determinism** is the single biggest risk to evaluation score, since "AI Prompt
  Engineering" is the first-listed evaluation criterion. Mitigation: structured output
  (JSON schema-constrained generation) instead of freeform prompting + parsing, plus
  strict post-validation.
- **Statelessness vs. large files vs. serverless timeouts.** A synchronous "upload →
  parse → call AI N times → respond" flow can exceed platform timeouts (Vercel Hobby
  functions cap at 10s; Railway/Render don't have this problem for a long-lived Node
  process). This drives the deployment recommendation in `11-deployment-plan.md` to run
  the Express backend on a platform without aggressive request timeouts.
- **Over-engineering.** The brief explicitly warns against Java/Spring-style
  over-engineering. Risk: introducing a job queue, DI container, or repository pattern
  for a project with no database and no persistent jobs. Mitigation is addressed
  point-by-point in `03-system-architecture.md` §6 ("Simplicity decisions").
- **Provider lock-in.** Prompting directly against the Gemini SDK from inside services
  would violate the "provider-independent" requirement. Mitigated by the `AiExtractionProvider`
  interface described in `07-ai-design.md`.
- **Token/cost blowup on large files.** Sending full CSVs in one prompt is both a
  reliability risk (context limits) and a cost risk. Batching bounds both.

## 6. Evaluation criteria mapped to deliverables

| Criterion (from PDF)                                                | Where it's addressed                                                        |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| AI prompt engineering, field mapping, messy data, ambiguous columns | `07-ai-design.md`                                                           |
| API design, clean architecture, error handling, batch processing    | `05-api-design.md`, `03-system-architecture.md`                             |
| Modern UI, responsive layout, CSV preview, loading/error states     | `03-system-architecture.md` (frontend section), `10-implementation-plan.md` |
| Readability, type safety, folder structure, reusability             | `04-folder-structure.md`, `06-shared-package.md`, `09-coding-guidelines.md` |
| Performance, edge cases, production readiness                       | `08-data-flow.md`, `11-deployment-plan.md`                                  |

## 7. Non-goals (explicitly out of scope)

- Authentication/authorization — not mentioned anywhere in the brief.
- Persistent storage of uploaded files or imported leads — explicitly optional/discouraged.
- Multi-tenant CRM features (lead editing, pipelines, dashboards) — only the import flow
  is in scope.
- Support for file formats other than CSV (no `.xlsx` parsing) — "Excel sheets" in the
  examples refers to CSVs _exported from_ Excel, not native `.xlsx` binary parsing.
