# 06 — Shared Package (`packages/shared`)

## 1. Purpose

`packages/shared` exists so that "what is a valid CRM record," "what CSV parsing means,"
and "what the API contract looks like" are each defined **exactly once** and imported by
both `apps/web` and `apps/api`. Every duplicated type or magic string between frontend
and backend is a future bug (schemas drifting apart silently). This is a direct answer to
the brief's "Shared Types / Shared Constants / Shared Zod Schemas / Shared Utilities"
requirement — not a generic monorepo convention.

Rule of thumb for what belongs here: **if both apps need to agree on it, it's shared; if
only one app cares, it stays local to that app.**

## 2. Shared Zod Schemas (`schemas/`)

- `crm-record.schema.ts` — the 15-field CRM record. This is the schema both the backend
  (validating AI output before it leaves the server) and the frontend (typing the results
  table) use. Field-level rules live here: `crm_status` and `data_source` are
  `z.enum([...]).or(z.literal(""))` (blank is explicitly allowed per the brief), `email`
  uses `z.string().email().optional()`, etc.
- `import-request.schema.ts` — upload constraints (file presence, size ceiling, allowed
  MIME/extension) used by the backend's upload middleware and by the frontend to
  pre-validate before even attempting an upload.
- `import-response.schema.ts` — the full `POST /api/imports` response envelope
  (`imported`, `skipped`, `summary`). The backend constructs the response and validates
  it against this schema before sending (a cheap "did I just serialize garbage" check);
  the frontend's `api-client.ts` parses every response through this same schema, so a
  contract mismatch fails immediately and legibly in development instead of surfacing as
  a confusing UI bug three components downstream.
- `api-error.schema.ts` — the `{ error: { code, message, details? } }` shape.

All TypeScript types used across the app boundary are derived with `z.infer<typeof schema>`
— never hand-written in parallel with a schema, which is how frontend/backend types drift.

## 3. Shared Constants (`constants/`)

- `crm-fields.ts` — the ordered list of the 15 CRM fields plus lightweight metadata
  (label, whether it's required for a record to count as "valid"). Both the results table
  column definitions (frontend) and the AI prompt's field descriptions (backend) are
  generated from this single list, so adding/renaming a CRM field is a one-file change.
- `crm-status.ts` / `data-source.ts` — the enum value arrays from the brief, verbatim.
  Used to build the zod enum, the AI prompt's "only use one of these" instruction, and any
  frontend status badge/coloring.
- `limits.ts` — `MAX_UPLOAD_SIZE_MB`, `MAX_CSV_ROWS`, `DEFAULT_AI_BATCH_SIZE`,
  `DEFAULT_AI_BATCH_CONCURRENCY`. Defaults live here; env vars can override at runtime on
  the backend, but the frontend's client-side pre-validation uses these same default
  constants so the two layers of validation can't silently disagree.

## 4. Shared Utilities (`utils/`)

- `parse-csv.ts` — the single CSV-parsing function. Wraps a well-tested parsing library
  (e.g. `papaparse`), configured once (header detection, BOM stripping, delimiter
  handling, quote handling per RFC 4180) and exported as one function:
  `parseCsv(input: string | Buffer): ParsedCsv`. Used by:
  - the frontend, client-side, for the Step 2 preview (no AI, instant feedback);
  - the backend, server-side, as the authoritative parse of the uploaded file.

  Using one implementation in both places is what guarantees "what you previewed is what
  got imported" — if frontend and backend used different CSV parsers, a row that looks
  fine in preview could silently behave differently once it reaches the AI step (e.g.
  different quote-escaping edge cases).

- `csv-safe-text.ts` — sanitizes free-text values (`crm_note`, `description`) so they
  never contain raw unescaped newlines, satisfying the brief's "each record must remain a
  single CSV row" rule. Applied as a final normalization pass on AI output before it's
  returned to the client, regardless of what the AI actually produced.
- `contact-extraction.ts` — pure functions implementing the "first email/mobile wins, the
  rest go to `crm_note`" rule. This logic is intentionally _not_ left entirely to the AI
  prompt — it's re-applied deterministically as a backend safety net after AI extraction
  (see `07-ai-design.md` §4), and the same splitting logic is exposed here so it's testable
  in isolation and reusable if the frontend ever needs to preview this behavior.

## 5. Shared Types (`types/`)

Anything needed across the boundary that isn't naturally a zod schema output — e.g. the
`AiExtractionProvider` request/response TypeScript interfaces (these aren't validated
over the wire, since they're an internal backend contract, but are still worth typing
centrally since `07-ai-design.md`'s examples and backend code both reference them)
live in `types/index.ts`. Kept intentionally small — most things belong in `schemas/`
instead so validation and typing never drift apart.

## 6. What deliberately does NOT live here

- **UI-only state** (e.g. "which wizard step is active," loading flags, form field focus)
  — lives in `apps/web`, because the backend has no reason to know about frontend UI
  state and putting it in `shared` would blur the "both apps need this" rule.
- **Express-specific types** (`Request`/`Response` augmentations) — stay in `apps/api`.
- **The Gemini SDK types / prompt strings** — stay in `apps/api/src/providers/ai`. The
  shared package must never import an AI SDK; that would leak a provider-specific
  dependency into the frontend bundle and violate the provider-independence requirement
  at a structural level, not just a business-logic level.

## 7. Build/consumption

`packages/shared` is a plain TypeScript package referenced via npm workspaces
(`"@groweasy/shared": "workspace:*"` or npm's `"*"` workspace protocol). Both apps import
directly from `@groweasy/shared` (source or a lightweight build step, decided in
implementation phase 1) — no publishing to a registry, no versioning ceremony, since it
never leaves this monorepo.
