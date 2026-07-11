# 03 — System Architecture

## 1. High-level shape

A monorepo with three packages: a Next.js frontend, an Express backend, and a shared
package consumed by both. No database, no queue, no separate worker process. One
synchronous (but internally batched/parallelized) request handles a full import.

```
┌─────────────────────────┐         ┌──────────────────────────┐
│   apps/web (Next.js)    │  HTTP   │   apps/api (Express)      │
│                          │ ──────► │                            │
│  Upload → client parse  │         │  Controller (thin)         │
│  → preview table         │         │  → ImportService            │
│  → Confirm → POST file  │         │     → CsvParsingService     │
│  → results table         │ ◄────── │     → LeadExtractionService │
└─────────────────────────┘  JSON   │        → AiExtractionProvider│
                                      │           (Gemini today)   │
                                      └──────────────────────────┘
                 ▲                                  ▲
                 │              imports              │
                 └────────────────┬─────────────────┘
                                   │
                        packages/shared
                (zod schemas, types, constants, csv utils)
```

## 2. Components and responsibilities

### 2.1 `apps/web` (Next.js + TypeScript + Tailwind + shadcn/ui)

- **Upload step**: drag-and-drop / file-picker component. Validates file type/size
  client-side before doing anything else (fast feedback, avoids a wasted round trip).
- **Preview step**: parses the CSV **in the browser** using the same `parseCsv` utility
  from `packages/shared` that the backend uses, so preview rows and backend-parsed rows
  are guaranteed consistent. Renders into a virtualized/scrollable table. No network call.
- **Confirm step**: a single explicit action that uploads the _original file_ (not the
  client-parsed JSON) to the backend via `multipart/form-data`. The raw file is
  authoritative; the backend re-parses it itself (see §6.3 for why).
- **Results step**: renders the API response (extracted records, skipped records,
  counts) in a second table, with distinct visual treatment for skipped rows.
- State is local component/page state (React `useState`/`useReducer`) — no global store
  needed for a 4-step linear wizard.

### 2.2 `apps/api` (Express + TypeScript)

Layering, thin → thick:

```
routes/          → HTTP verbs + paths only, wire to controllers
controllers/      → parse+validate request (zod), call one service method, shape response
services/         → business logic: orchestration, validation rules, batching
providers/ai/     → provider-agnostic AI extraction interface + Gemini implementation
middleware/       → multer upload handling, centralized error handler, request logging
```

- **Controllers** never contain business logic. A controller's job: validate input shape
  (via shared zod schemas), call exactly one service method, map the result to an HTTP
  response. If a controller has an `if` statement deciding _business_ behavior, that's a
  sign logic leaked out of the service layer.
- **`ImportService`** is the orchestrator for the one real use case: given a raw CSV
  buffer, parse it, chunk it into batches, run each batch through the AI provider (bounded
  concurrency), validate/normalize every returned record against the shared zod schema,
  apply the skip rule (no email AND no mobile → skip), and assemble the final
  `ImportResult`.
- **`AiExtractionProvider`** is an interface, not a class you instantiate directly.
  `GeminiExtractionProvider` is the only implementation today. See `07-ai-design.md` for
  the full contract. This is the one place dependency inversion is used deliberately,
  because it's the one dependency the brief explicitly says must be swappable.

### 2.3 `packages/shared`

The single source of truth for anything both apps need to agree on:

- **Zod schemas**: CRM record shape, upload constraints, API request/response envelopes.
  Types are derived from schemas via `z.infer`, never hand-duplicated.
- **Constants**: the CRM field list, `CRM_STATUS_VALUES`, `DATA_SOURCE_VALUES`, batch
  size defaults, file size/row limits.
- **CSV utilities**: a single `parseCsv()` used by both the frontend (preview) and the
  backend (authoritative parse), so "what a valid row looks like" is defined exactly once.
- **Types**: anything not already implied by a zod schema (e.g. API error shape).

See `06-shared-package.md` for the full breakdown.

## 3. Request lifecycle (summary — full detail in `08-data-flow.md`)

1. Browser parses CSV client-side for preview only (no AI, no network).
2. User clicks Confirm → browser `POST`s the raw file to `POST /api/imports`.
3. Express parses multipart body (`multer`, memory storage — nothing touches disk).
4. `CsvParsingService` re-parses the buffer into typed rows (source of truth).
5. `ImportService` chunks rows into batches (env-configurable size, default 25).
6. Each batch is sent to `AiExtractionProvider.extractRecords()` with bounded
   concurrency (default 3 in-flight batches).
7. Each returned record is validated against the shared CRM zod schema; invalid/
   incomplete records are corrected where possible (e.g. re-applying the
   first-email/first-mobile rule as a safety net) or routed to the skipped list.
8. Results are aggregated into `{ imported: CrmRecord[], skipped: SkippedRecord[], totalImported, totalSkipped, meta }` and returned as JSON.
9. Frontend renders the result table from that single JSON payload.

## 4. Cross-cutting concerns

- **Error handling**: every thrown error in the API is an instance of a small
  `AppError` hierarchy (`ValidationError`, `UpstreamAiError`, `PayloadTooLargeError`,
  etc.) caught by one Express error-handling middleware that maps it to a consistent
  `{ error: { code, message, details? } }` JSON envelope and the right HTTP status.
  Nothing downstream of a route handler writes to `res` directly on the error path.
- **Validation**: all external input (HTTP body/query/file metadata, and AI provider
  output) is validated at the boundary with zod. Nothing internal re-validates data that
  already crossed a validated boundary.
- **Configuration**: all tunables (batch size, concurrency, max file size, AI provider
  selection, API keys) come from environment variables, validated once at startup with a
  zod schema (`env.ts`) that fails fast with a clear message if misconfigured — not
  scattered `process.env.X` reads through the codebase.
- **Logging**: structured (JSON) request/import logging via a minimal logger
  (`pino` or equivalent), no `console.log` in application code.

## 5. Why no database

The brief marks a database as optional and pushes toward statelessness. Nothing in the
functional requirements needs data to outlive a single request:

- No requirement to list past imports, re-run a failed import, or persist leads.
- No user accounts/auth, so there's no per-user history to store.
- The "skip invalid records" and "total imported/skipped" outputs are derivable entirely
  from the current request's data.

Introducing a database here would add migration/connection-pool/ORM surface area with no
functional payoff, and would work against the "avoid unnecessary abstraction" principle
in the brief. If a future requirement needs persistence (e.g. "let users review past
imports"), the natural extension point is adding a `packages/shared` `ImportRecord` type
and a storage-backed service behind the same `ImportService` interface — not a rearchitecture.

## 6. Simplicity decisions (deliberately rejected complexity)

The brief explicitly asks to flag over-engineering. These are things a more
"enterprise" design might reach for, and why they're rejected here:

| Rejected                                                          | Why it doesn't earn its cost here                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Job queue (BullMQ/Redis) + async job polling                      | Statelessness requirement + no need to survive a server restart mid-import. A single request with bounded batch concurrency finishes well within a reasonable timeout for the CSV sizes this assignment targets (thousands, not millions, of rows). If true async processing is ever needed, HTTP chunked streaming (see `07-ai-design.md` §5) solves the "progress" bonus requirement without a queue. |
| Microservices (separate AI service, separate parsing service)     | One Express process is sufficient; splitting processes here only adds network hops and deployment complexity with no scaling need at this stage.                                                                                                                                                                                                                                                        |
| Repository pattern / ORM                                          | No database. A repository pattern abstracting over nothing is pure ceremony.                                                                                                                                                                                                                                                                                                                            |
| Heavy DI container (NestJS-style decorators/modules, InversifyJS) | Plain factory functions (`createImportService(deps)`) give the same testability and swappability as a DI container, with far less machinery, for a codebase this size. Dependency inversion is applied only at the one seam that needs it (AI provider), per the brief's own instruction.                                                                                                               |
| Turborepo/Nx build orchestration                                  | Three packages, no complex build graph or remote caching need. Native npm/pnpm workspaces are enough; see `04-folder-structure.md` for the exact choice.                                                                                                                                                                                                                                                |
| Global state management (Redux/Zustand) on the frontend           | A 4-step linear wizard fits in local component state. Introducing a store adds indirection with no shared-across-routes state to justify it.                                                                                                                                                                                                                                                            |
| Result/Either monadic error handling                              | Idiomatic Express uses `throw` + centralized middleware. A `Result<T, E>` pattern is a reasonable choice in some codebases but is unnecessary ceremony layered on top of what Express's error middleware already does well.                                                                                                                                                                             |
| Multiple AI provider implementations built up front               | Only Gemini is required. The _interface_ is designed so OpenAI/Claude providers can be added later without touching business logic — but building unused providers now would be speculative work the brief warns against.                                                                                                                                                                               |

## 7. Deployment shape (summary — detail in `11-deployment-plan.md`)

Frontend and backend deploy as two independent services (frontend on Vercel; backend on
a long-lived Node host such as Railway/Render) rather than colocating the Express app as
Vercel serverless functions, primarily because AI batch processing can run long enough to
risk serverless function timeouts. Both are stateless, so horizontal scaling later is a
non-issue if it's ever needed.
