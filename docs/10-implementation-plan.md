# 10 — Implementation Plan

**Context: the real submission deadline is today, 2026-07-11, 6 PM.** With more than 6
hours available, there is enough time to build the full core flow plus a handful of
bonus items — but not enough time for scope creep, rework, or a late-discovered
deployment problem. This plan is written as a strict, time-boxed sequence with one
non-negotiable rule baked in up front:

> **Deploy a trivial end-to-end skeleton first, before building real features.**
> The single biggest risk to a hard deadline is discovering a deployment/CORS/env-var
> problem at 5:45 PM. Phase 0 ends with a "hello world" frontend calling a "hello world"
> backend, both already hosted on the real platforms. Every phase after that ships into
> an already-working deployment pipeline, so deploying the finished feature is a config
> no-op, not a new risk.

Time budgets below are targets, not guarantees — if a phase overruns, cut from the
**Bonus** phase (6) first, never from Phases 0–5 (the core, evaluated flow).

## Phase 0 — Scaffold + deploy skeleton (target: 45 min)

- Initialize the monorepo: root `package.json` with npm workspaces, `tsconfig.base.json`,
  Prettier/ESLint config, `.gitignore`, `.env.example`.
- `apps/api`: minimal Express app with `GET /api/health` only.
- `apps/web`: minimal Next.js app with a static page that fetches `/api/health` and
  displays the result.
- `packages/shared`: empty package wired into both apps' TS path resolution (proves the
  workspace linking works before anything depends on it).
- Push to GitHub (public repo, required for submission).
- **Deploy both immediately**: frontend to Vercel, backend to Railway/Render (see
  `11-deployment-plan.md`). Confirm the deployed frontend can reach the deployed backend
  (CORS configured correctly) before writing a single line of real feature code.
- Acceptance: hosted frontend URL shows "API status: ok" pulled live from the hosted
  backend URL.

## Phase 1 — Shared package (target: 30–40 min)

- `constants/`: `crm-fields.ts`, `crm-status.ts`, `data-source.ts`, `limits.ts`.
- `schemas/`: `crm-record.schema.ts`, `import-request.schema.ts`,
  `import-response.schema.ts`, `api-error.schema.ts`.
- `utils/parse-csv.ts`, `utils/csv-safe-text.ts`, `utils/contact-extraction.ts`.
- Unit tests for `parse-csv` and `contact-extraction` against the messy-CSV edge cases in
  `01-assignment-analysis.md` §4 — written now, while the rules are fresh, since both
  apps depend on this package being correct.
- Acceptance: `packages/shared` builds/typechecks standalone; its tests pass.

## Phase 2 — Backend core (target: 45 min)

- `env.ts` (zod-validated config), `app.ts`/`index.ts` split, `middleware/` (upload via
  multer memory storage, centralized error handler, request logger, not-found).
  `errors/app-error.ts`.
- `services/csv-parsing.service.ts` using the shared `parseCsv`.
- Wire `POST /api/imports` end-to-end **without AI yet** — parse the upload and echo back
  the parsed rows verbatim as `imported`, with `skipped: []`. This proves the upload →
  parse → response → frontend-render path works before adding the AI dependency, isolating
  where any bug is if something breaks later.
- Acceptance: uploading a real CSV through the (still basic) frontend returns parsed rows
  from the real backend.

## Phase 3 — AI integration (target: 60–75 min)

- `providers/ai/ai-extraction-provider.ts` (interface + factory), `gemini-extraction-provider.ts`,
  `prompts/lead-extraction.prompt.ts` per `07-ai-design.md`.
- `services/lead-normalization.service.ts` (post-AI validation, skip-rule enforcement,
  enum clamping, CSV-safe text).
- `services/import.service.ts`: batching, bounded concurrency, per-batch retry, aggregation.
- Replace the Phase 2 echo behavior with real AI extraction.
- Test against the **sample CRM records from the brief** first (should map ~1:1), then
  against at least 2 deliberately messy fixture CSVs (ambiguous headers, multiple emails
  in one cell, missing contact info rows, non-ISO dates) — these become
  `apps/api/test/fixtures/csv/`.
- Acceptance: the sample CSV from the brief round-trips correctly; a messy fixture CSV
  produces sensible mappings and correctly skips a contact-less row.

## Phase 4 — Frontend core (target: 75–90 min)

- Install shadcn/ui primitives needed: button, table, dialog/sheet, badge, progress,
  toast/sonner.
- `components/csv-importer/`: `csv-importer.tsx` (step state via `useReducer`),
  `upload-step.tsx` (drag-and-drop + file picker), `preview-step.tsx` (client-side
  `parseCsv`, scrollable/sticky-header table), `results-step.tsx` (summary cards +
  results table with imported/skipped distinction).
- `lib/api-client.ts`: typed fetch wrapper, parses responses through shared zod schemas.
- Loading state on Confirm (disabled button + spinner/progress), error state (toast +
  inline message) for both parse failures and API failures.
- Acceptance: full manual walkthrough — drop a CSV, see preview, confirm, see loading
  state, see results with correct imported/skipped counts — works on the deployed URLs,
  not just localhost.

## Phase 5 — End-to-end hardening (target: 30–45 min)

- Run through the edge-case table in `01-assignment-analysis.md` §4 against the deployed
  app: empty CSV, header-only CSV, contact-less rows, multi-email rows, a non-CSV file.
- Verify mobile viewport (browser devtools responsive mode at minimum) for all 3 table
  views.
- Verify the `.env.example` is complete and a fresh `npm install` + `npm run dev` at repo
  root actually boots both apps.
- Write the README (setup instructions, architecture summary, env vars, deployed URL,
  known limitations) — required for submission, not optional.
- **Checkpoint**: if this phase completes with time to spare before 6 PM, proceed to
  Phase 6. If not, stop here and submit — a solid, working core flow beats a broken
  attempt at bonus features.

## Phase 6 — Bonus features, time-boxed and prioritized in this order

Only start the next item if the current one is done and time remains. Ordered by
score-per-minute (highest first), not by the order listed in the brief:

1. **README polish + Docker (optional) is already covered in Phase 5/11** — skip
   duplicating here.
2. **Retry mechanism for failed AI batches** — likely already implemented as part of
   Phase 3's design (§5 of `07-ai-design.md`); if so, this item is free — just confirm
   it's actually exercised (e.g. temporarily point at a bad API key to see graceful
   degradation), don't build it from scratch here.
3. **Progress indicator during AI processing** — start with a simple indeterminate
   spinner/progress bar tied to the request lifecycle (cheap, real UX value). Only
   attempt the full chunked-streaming progress design from `07-ai-design.md` §5 if
   solid time remains — it's the highest-effort bonus item.
4. **Dark mode** — cheap with shadcn/ui + Tailwind's dark class strategy; a theme toggle
   plus `dark:` variants on the already-built components.
5. **Virtualized results table** — only matters for large CSVs; worth doing if the
   results/preview tables don't already handle a few hundred rows smoothly, otherwise
   lower priority than the items above.
6. **Unit tests beyond Phase 1/3's minimum** — additional service-layer tests
   (`ImportService` batching/retry against a fake provider, per `07-ai-design.md` §7).
7. **Docker setup** — a `Dockerfile` per app; lowest priority since hosted deployment
   (required) already proves the app runs correctly without containers.

## Explicit non-goals for this pass

Not attempting: authentication, persistence/database, multi-file upload, CSV export of
results, undo/edit of imported records. None are required by the brief; all would eat
time that's better spent hardening the required core flow before 6 PM.

## Order-of-operations rationale

Backend-before-frontend-features (Phase 2/3 before Phase 4's real wiring) is deliberate:
it's far faster to debug AI extraction quality against `curl`/a REST client than through
a UI, and it means Phase 4 is "wire a UI to an API that's already known to work" rather
than debugging both layers simultaneously under time pressure.
