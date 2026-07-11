# 09 — Coding Guidelines

These are binding for implementation.

## 1. TypeScript

- `strict: true`, plus `noUncheckedIndexedAccess`, `noImplicitOverride`,
  `exactOptionalPropertyTypes` in `tsconfig.base.json`, extended by every package.
- **No `any`, ever.** Use `unknown` + narrowing, or a proper type. If a third-party
  library lacks types, write a minimal local `.d.ts` rather than reaching for `any`.
- No non-null assertions (`!`) except where a preceding line makes null-safety
  structurally provable and a comment says why (rare — prefer narrowing).
- No type casting (`as`) to paper over a real mismatch; `as const` for literal narrowing
  is fine.
- Prefer `type` for unions/utility compositions, `interface` for object shapes meant to
  be extended (e.g. provider interfaces). Don't mix conventions within one file.
- Every external boundary (HTTP request body, file upload metadata, AI provider
  response, env vars) is validated with a zod schema and typed via `z.infer` — never
  hand-annotated to match what you assume the shape is.

## 2. Architecture rules (enforced, not just suggested)

- **Controllers do not contain business logic.** A controller: validates the request
  (via a shared zod schema), calls exactly one service method, maps the result to a
  response. If you're writing an `if` in a controller that isn't about HTTP concerns
  (status code, response shape), it belongs in a service.
- **Services do not know about Express.** No `req`/`res` objects passed into a service —
  services take plain typed arguments and return plain typed results, so they're testable
  without spinning up HTTP.
- **Dependency inversion only at the AI provider boundary.** Don't introduce interfaces
  or injected abstractions for things that have exactly one implementation and no
  foreseeable second one (e.g. don't abstract `CsvParsingService` behind an interface —
  there's one CSV parser and one reason to change it).
- **No premature abstraction.** Three similar lines of code are better than a shared
  helper used in exactly one place "for future reuse." Extract a helper when a second
  real caller shows up, not before.
- **No speculative feature flags, config options, or extension points** for requirements
  that don't exist yet. If a future requirement shows up, add the extension point then.

## 3. Error handling

- Throw `AppError` subclasses (`errors/app-error.ts`) from services/controllers; never
  construct an error response object by hand inside a route handler.
- Exactly one Express error-handling middleware maps `AppError` → HTTP status + JSON
  envelope. Unexpected (non-`AppError`) exceptions are logged with full detail
  server-side and returned to the client as a generic `500 INTERNAL_ERROR` — never leak
  a stack trace or internal error message to the client.
- Async route handlers are wrapped (or use Express 5's native async error propagation) so
  a rejected promise always reaches the error middleware — no silently swallowed
  rejections.
- On the frontend, all API calls go through `lib/api-client.ts`, which is the single
  place that turns a non-2xx response or a schema-validation failure into a typed error
  the UI can render a message for. Components never call `fetch` directly.

## 4. Validation

- Validate once, at the boundary. Once a value has passed through a zod schema at the
  edge of the system (HTTP request, AI provider response), downstream code trusts its
  type — no redundant `if (!value)` re-checks scattered through service internals for
  values the type system already guarantees are present.
  - Exception, and it's a real one: the AI provider's output is validated **twice** on
    purpose — once as "does this match the schema" (structural) and once as "does this
    satisfy the business rules the AI was merely asked to follow, like the skip rule"
    (semantic). See `07-ai-design.md` §4 for why this specific boundary gets extra
    scrutiny — it's the one input source that isn't fully within the system's control.

## 5. Naming & style

- `kebab-case` filenames, `PascalCase` types/components, `camelCase` variables/functions,
  `SCREAMING_SNAKE_CASE` only for true constants (enum value arrays, env var names).
- Function and variable names say what they are; comments explain _why_, only when the
  why isn't obvious from the code (a workaround, a non-obvious constraint, a rule from
  the brief that isn't self-evident from the code alone — e.g. "first email wins because
  the brief specifies this, not because of a technical constraint").
- No commented-out code committed. No `// TODO` without enough context that a stranger
  could act on it (prefer just doing the thing, or filing it in `10-implementation-plan.md`
  instead of leaving it in source).
- Prettier + ESLint enforced via a pre-commit hook (or at minimum CI); formatting is never
  a PR review topic because it's not a human decision.

## 6. React / Next.js conventions

- Server Components by default; a component only becomes a Client Component
  (`"use client"`) when it needs interactivity, browser APIs, or state — the upload,
  preview-table, and results-table components are client components by necessity, but
  static layout/shell pieces are not.
- Co-locate a component's minor sub-pieces in the same file only if they're not reused
  and stay small; split into separate files once a sub-piece exceeds ~1 clear
  responsibility or is reused.
- No prop-drilling past 2 levels for the wizard state — pass the reducer's dispatch and
  relevant slice directly to each step component instead of threading through
  intermediate components that don't use it.
- Tailwind for layout/spacing/color; shadcn/ui components for interactive primitives
  (button, table, dialog, toast) rather than hand-rolling them — consistent with
  "reusable components" as an explicit evaluation criterion.

## 7. Testing

- Unit tests for: `parseCsv` edge cases (§4 of `01-assignment-analysis.md`), the
  contact-extraction (first-wins) utility, the skip-rule/normalization logic, and
  `ImportService`'s batching/concurrency/retry behavior against a fake
  `AiExtractionProvider`.
- No tests that assert against a live Gemini call in the default `npm test` run — those
  are integration tests gated behind an explicit script/env flag, so CI and local dev
  don't require a real API key to pass the suite.
- Test names describe behavior, not implementation ("skips a row with no email and no
  phone", not "test3").

## 8. Git / PR hygiene

- Small, reviewable commits scoped to one logical change.
- No committed secrets — `.env` is gitignored, `.env.example` documents every required
  variable with a description and safe placeholder.
- No committed build output (`.next/`, `dist/`) or `node_modules/`.

## 9. Definition of "done" for any unit of work

A change is done when: it compiles under `strict` TS with no `any`, it's covered by a
test where behavior is non-trivial, it follows the layering rules in §2, error paths are
handled per §3, and — for anything touching the frontend — it's been manually exercised
in the browser at both a desktop and a mobile viewport width.
