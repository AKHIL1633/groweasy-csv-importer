# 04 — Folder Structure

## 1. Monorepo tooling choice

**npm workspaces** (built into npm ≥ 7, zero extra tooling to install or learn) over
pnpm/Turborepo/Nx. Rationale: three packages, no complex build graph, no need for remote
build caching at this project's scale. If build speed becomes a real pain later, adding
Turborepo on top of an existing npm-workspaces layout is a non-breaking, additive change
— so this choice doesn't foreclose anything. (If the team already has a strong pnpm
preference, pnpm workspaces are a fine drop-in alternative; the folder layout below is
identical either way.)

## 2. Top-level layout

```
groweasy-csv-importer/
├── apps/
│   ├── web/                     # Next.js frontend
│   └── api/                     # Express backend
├── packages/
│   └── shared/                  # shared types, zod schemas, constants, utils
├── docs/                        # this documentation set
├── .github/
│   └── workflows/                # CI (lint, typecheck, test) — added in later phase
├── .env.example
├── .gitignore
├── .prettierrc
├── .eslintrc.cjs (or eslint.config.js, flat config)
├── package.json                 # workspace root
├── tsconfig.base.json           # shared TS compiler options, extended by each package
├── turbo.json                   # only if/when Turborepo is added — not in initial scope
└── README.md
```

## 3. `apps/api` (Express backend)

```
apps/api/
├── src/
│   ├── index.ts                  # process entrypoint: loads env, starts HTTP server
│   ├── app.ts                    # builds and returns the Express app (no listen() here — testable)
│   ├── env.ts                    # zod-validated environment config, single source of truth
│   ├── routes/
│   │   ├── index.ts               # mounts all routers
│   │   ├── imports.routes.ts      # POST /api/imports
│   │   └── health.routes.ts       # GET /api/health
│   ├── controllers/
│   │   └── imports.controller.ts  # thin: validate request, call service, shape response
│   ├── services/
│   │   ├── csv-parsing.service.ts     # buffer -> typed rows (uses packages/shared parseCsv)
│   │   ├── import.service.ts          # orchestrates parse -> batch -> extract -> validate -> aggregate
│   │   └── lead-normalization.service.ts # post-AI validation, multi-email/mobile rule, skip rule
│   ├── providers/
│   │   └── ai/
│   │       ├── ai-extraction-provider.ts   # interface + factory (selects implementation by env)
│   │       ├── gemini-extraction-provider.ts
│   │       └── prompts/
│   │           └── lead-extraction.prompt.ts
│   ├── middleware/
│   │   ├── upload.middleware.ts    # multer config (memory storage, size/type limits)
│   │   ├── error-handler.middleware.ts
│   │   ├── not-found.middleware.ts
│   │   └── request-logger.middleware.ts
│   ├── errors/
│   │   └── app-error.ts            # AppError + subclasses (ValidationError, UpstreamAiError, ...)
│   ├── lib/
│   │   └── logger.ts               # pino instance
│   └── types/
│       └── express.d.ts            # request augmentation types, if any
├── test/
│   ├── unit/
│   │   ├── services/
│   │   └── providers/
│   └── fixtures/
│       └── csv/                    # sample messy CSVs used in tests
├── package.json
├── tsconfig.json
└── Dockerfile                      # bonus
```

Notes:

- `app.ts` vs `index.ts` split exists purely so tests can `import { buildApp } from './app'`
  and hit it with `supertest` without binding a real port.
- `providers/ai/` is the only folder with an interface + swappable implementation; nothing
  else in the backend uses this pattern, deliberately (see `03-system-architecture.md` §6).

## 4. `apps/web` (Next.js frontend)

Using the Next.js App Router.

```
apps/web/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                 # the importer wizard entry point
│   │   ├── globals.css
│   │   └── favicon.ico
│   ├── components/
│   │   ├── ui/                       # shadcn/ui primitives (button, table, dialog, badge, ...)
│   │   ├── csv-importer/
│   │   │   ├── csv-importer.tsx       # top-level state machine for the 4 steps
│   │   │   ├── upload-step.tsx
│   │   │   ├── preview-step.tsx
│   │   │   ├── results-step.tsx
│   │   │   ├── import-summary-cards.tsx
│   │   │   └── data-table/
│   │   │       ├── data-table.tsx      # generic scrollable/sticky-header table
│   │   │       └── virtualized-body.tsx
│   │   └── layout/
│   │       ├── header.tsx
│   │       └── theme-toggle.tsx        # bonus: dark mode
│   ├── hooks/
│   │   ├── use-csv-upload.ts
│   │   └── use-import-request.ts
│   ├── lib/
│   │   ├── api-client.ts               # typed fetch wrapper against apps/api, using shared schemas
│   │   └── format.ts
│   ├── types/
│   │   └── import-wizard.ts            # UI-only state types (not shared — see 06-shared-package.md)
│   └── styles/
│       └── (tailwind config lives at project root)
├── public/
├── next.config.ts
├── tailwind.config.ts
├── components.json                    # shadcn/ui config
├── package.json
└── tsconfig.json
```

Notes:

- `components/ui/` holds shadcn/ui-generated primitives only; app-specific composition
  lives in `components/csv-importer/`. This keeps "reusable primitive" vs
  "feature-specific" concerns visually separate in the tree.
- No `store/` directory — see `03-system-architecture.md` §6 on why global state
  management is deliberately not used.

## 5. `packages/shared`

```
packages/shared/
├── src/
│   ├── index.ts                 # public barrel export
│   ├── constants/
│   │   ├── crm-fields.ts         # CRM_FIELDS list + field metadata
│   │   ├── crm-status.ts         # CRM_STATUS_VALUES
│   │   ├── data-source.ts        # DATA_SOURCE_VALUES
│   │   └── limits.ts             # default batch size, max file size, max rows
│   ├── schemas/
│   │   ├── crm-record.schema.ts       # the 15-field CRM record, zod
│   │   ├── import-request.schema.ts   # upload constraints
│   │   ├── import-response.schema.ts  # API response envelope
│   │   └── api-error.schema.ts
│   ├── types/
│   │   └── index.ts              # types not fully derivable from a schema
│   └── utils/
│       ├── parse-csv.ts          # the one CSV parser used by both apps
│       ├── csv-safe-text.ts      # newline/quote sanitization for CSV-safe strings
│       └── contact-extraction.ts # split multi-value email/phone strings, "first + rest" rule
├── package.json
└── tsconfig.json
```

See `06-shared-package.md` for what belongs here vs. in each app, and why.

## 6. Naming conventions

- Files: `kebab-case.ts`. React components: `kebab-case.tsx` file, `PascalCase` export.
- One primary export per file where practical; barrel files (`index.ts`) only at package/
  folder boundaries meant for external consumption, not sprinkled through every subfolder.
- Test files live next to a `test/` root per app (not `__tests__` interleaved with source)
  to keep `src/` reserved for shipped code.

## 7. Why this shape and not something flatter/deeper

- Flatter (no `services/`, everything in `controllers/`) would violate the brief's "thin
  controller" requirement directly.
- Deeper (e.g. a `domain/`, `application/`, `infrastructure/` DDD-style split) is the kind
  of Java/Spring-style layering the brief explicitly warns against for a codebase this
  size — three services and one provider interface don't need four architectural layers.
