# 11 — Deployment Plan

## 1. Target platforms

| App                  | Platform                                | Why                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web` (Next.js) | **Vercel**                              | Native Next.js support, zero-config, fastest path to a public URL.                                                                                                                                                                                                                                                                                                    |
| `apps/api` (Express) | **Railway or Render** (free/hobby tier) | Long-lived Node process, no per-request timeout ceiling — important because AI batch extraction on a large CSV can run longer than a serverless function's timeout budget (e.g. Vercel Hobby serverless functions cap around 10s). Running the backend on a persistent-process host removes this as a risk entirely, rather than engineering around a platform limit. |
| `packages/shared`    | N/A (not deployed)                      | Built as part of both apps' build step via the workspace; never hosted independently.                                                                                                                                                                                                                                                                                 |

This two-platform split is the simplest option that avoids the timeout risk. An
all-in-on-Vercel approach (Next.js API routes instead of a separate Express service) was
considered and rejected — see §5.

## 2. Environment variables

`apps/api` (set on Railway/Render dashboard, never committed):

| Variable               | Required         | Default      | Notes                                                                          |
| ---------------------- | ---------------- | ------------ | ------------------------------------------------------------------------------ |
| `PORT`                 | provided by host | —            | Railway/Render inject this.                                                    |
| `NODE_ENV`             | yes              | `production` |                                                                                |
| `AI_PROVIDER`          | yes              | `gemini`     | Selects the provider implementation.                                           |
| `GEMINI_API_KEY`       | yes              | —            | From Google AI Studio. Secret.                                                 |
| `ALLOWED_ORIGIN`       | yes              | —            | Exact deployed Vercel URL(s), comma-separated if a preview URL is also needed. |
| `MAX_UPLOAD_SIZE_MB`   | no               | `5`          |                                                                                |
| `MAX_CSV_ROWS`         | no               | `10000`      |                                                                                |
| `AI_BATCH_SIZE`        | no               | `25`         |                                                                                |
| `AI_BATCH_CONCURRENCY` | no               | `3`          |                                                                                |
| `AI_BATCH_MAX_RETRIES` | no               | `2`          |                                                                                |

`apps/web` (set on Vercel dashboard):

| Variable                   | Required | Notes                                                                             |
| -------------------------- | -------- | --------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_BASE_URL` | yes      | The deployed backend's base URL (e.g. `https://groweasy-csv-api.up.railway.app`). |

`env.ts` on the backend validates all of these with a zod schema at process startup and
crashes immediately with a clear message if something required is missing — a
misconfigured deploy should fail loudly at boot, not fail mysteriously on the first
request.

`.env.example` at the repo root (and/or per-app) documents every variable above with a
placeholder value and a one-line description, so `README.md`'s setup instructions are
just "copy `.env.example` to `.env` and fill in the real values."

## 3. Build & start commands

`apps/api`:

- Build: `npm run build --workspace apps/api` (tsc → `dist/`)
- Start: `node dist/index.js`

`apps/web`:

- Build: Vercel auto-detects Next.js; root directory set to `apps/web` in Vercel project
  settings, with the monorepo's workspace install handled by Vercel's default npm
  workspace support.

Both apps build `packages/shared` as a workspace dependency automatically as part of
`npm install` + each app's own build step (TypeScript project references or a simple
`tsc -b`, decided in Phase 0 of implementation) — no separate manual "build shared first"
step required for either platform's build pipeline.

## 4. CORS

Backend `cors()` middleware is configured with `origin: env.ALLOWED_ORIGIN.split(",")`,
never a wildcard, since the API accepts file uploads and should not be callable from
arbitrary origins in production. Local dev adds `http://localhost:3000` to the allowed
list via `.env` only in development.

## 5. Why not Vercel-only (Next.js API routes instead of Express)

Considered: skip the separate Express service and implement `/api/imports` as a Next.js
Route Handler, deploying everything to Vercel as one project. Rejected because:

- The brief's tech stack explicitly specifies **Node.js + Express** as the backend — that
  is a stated constraint, not just a suggestion, and evaluators are explicitly grading
  "API design" as an Express backend concern.
- Vercel serverless function execution time limits are a real risk for a multi-batch AI
  extraction request on a larger CSV; a dedicated long-lived Node process sidesteps this
  without needing to engineer around it (e.g. splitting into multiple round-trips just to
  respect a platform timeout).
- Keeping frontend and backend as genuinely separate deployable services also better
  demonstrates the "clean architecture" / "API design" evaluation criteria, since the API
  has to stand on its own (versioned, documented, independently callable) rather than
  being an implementation detail of the frontend app.

## 6. Docker (bonus, optional — see Phase 6 of the implementation plan)

If time permits: a `Dockerfile` per app (`apps/api/Dockerfile`, `apps/web/Dockerfile`)
using multi-stage builds (install → build → slim runtime image), plus a root
`docker-compose.yml` for local dev convenience. This is additive and does not change the
actual deployment targets above — Railway/Render both support deploying directly from a
Dockerfile if that path is used instead of their native Node buildpacks, so choosing to
build the Dockerfiles doesn't require re-deciding the hosting platforms.

## 7. Pre-submission checklist

- [ ] Frontend hosted URL loads and completes a full upload → preview → confirm → results
      cycle against the real (not local) backend.
- [ ] Backend `GET /api/health` reachable directly at its public URL.
- [ ] `GEMINI_API_KEY` set on the host, not in any committed file.
- [ ] `ALLOWED_ORIGIN` matches the actual deployed frontend URL exactly (including
      `https://`, no trailing slash mismatches — a common silent CORS-failure cause).
- [ ] GitHub repository is public.
- [ ] README includes: setup instructions, architecture summary, env var list, the
      hosted URL, and any known limitations.
- [ ] Submission email to `varun@groweasy.ai` includes hosted app URL, GitHub URL, and
      the position being applied for, per the brief's exact checklist.
