# 12 — UI Design

This document designs the user interface and experience for the CSV Importer. It is UX
documentation only — no React, JSX, Tailwind classes, or CSS. It assumes the flow, data
shapes, and constraints already fixed in `docs/02-requirements.md`,
`docs/05-api-design.md`, and `docs/08-data-flow.md`.

**Framing decision, stated up front**: the 4 steps in the brief (Upload, Preview,
Confirm, Display Result) are implemented as **one page with an internal step state**, not
four routed pages. There is nothing to deep-link to (no persisted import to resume — see
`docs/03-system-architecture.md` §5), so routing between steps would add URL/history
complexity with no user benefit. This decision is revisited and confirmed in §16.

---

## 1. User Journey

**1. Arrival.** The user lands on a single screen: a short heading ("Import leads from
any CSV"), one sentence of explanation, and an upload area. Nothing else competes for
attention — no sidebar, no navigation, no account chrome. This is a focused tool, not a
dashboard.

**2. Upload.** The user drags a file onto the dropzone or clicks it to open a file
picker. The instant a file is selected, it's validated client-side (extension/MIME type,
size ceiling from shared constants). If invalid, an inline error replaces the dropzone's
helper text and the user can immediately try another file — no dead end, no modal to
dismiss first.

**3. Preview (automatic, no button press).** A valid file is parsed client-side
immediately (this is fast — no spinner needed for typical files, see §9 for the rare
large-file case) and the view transitions to a preview table showing every row and every
detected column, plus a small strip above the table: "`{rows}` rows detected · Import as
GrowEasy leads?" with **Confirm** and **Choose a different file** actions. The user
scans the table to sanity-check that their file looks right before committing to the AI
call — this is the entire point of the preview step per the brief, and the UI should not
rush past it.

**4. Confirm → AI processing.** Clicking Confirm disables further input, replaces the
action strip with a processing indicator (see §9), and the raw file is sent to the
backend. The preview table stays visible and scrollable underneath/behind the processing
indicator (dimmed) rather than being replaced by a blank loading page — the user doesn't
lose their place.

**5. Results.** On success, the view transitions to the results screen: summary counts at
the top, then the imported records table, with skipped records available directly below
(not hidden behind a tab — see §16). The user can scan results, expand a note that's been
truncated, and start a new import ("Import another file") which resets to step 1.

**6. Failure, at any step.** Errors never dead-end the flow. Every error state (§10)
pairs a clear message with a concrete next action (try again, choose a different file,
go back).

### System responses at each transition

| User action                       | System response                                                                                                                                             |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Drops/selects a file              | Validate → parse → render preview, all within ~1 interaction, no intermediate "click to continue"                                                           |
| Clicks Confirm                    | Button enters a busy state immediately (no delay before feedback), request fires                                                                            |
| AI processing completes (success) | View transitions to results; a brief success acknowledgment (toast: "Import complete — 40 of 42 leads imported") reinforces the outcome without blocking it |
| AI processing fails entirely      | View returns to the preview step (file/data preserved) with an error banner and a Retry action — the user never has to re-upload after a transient failure  |
| Partial AI failure                | Treated as success (per `docs/05-api-design.md` §2) — results show normally, with a non-blocking notice about the batches that failed                       |

---

## 2. Page Layout

Single page, three visual regions stacked vertically: a minimal header, the active step's
content, and (only during preview/results) a fixed action/summary bar. No footer beyond
what's needed for basic attribution.

### Upload screen

- Centered content column, generous vertical whitespace (this is the "empty" first
  impression — it should feel calm, not sparse-as-in-unfinished).
- Dropzone is the single dominant element: large hit area, dashed border, centered icon +
  "Drag & drop your CSV here" + "or click to browse" + small print for supported types
  and max size.
- Responsive: dropzone stays roughly centered with a max width on desktop (so it doesn't
  stretch into an absurd drop target on ultrawide monitors); on mobile it fills the
  available width with reduced vertical padding.

### Preview screen

- Header strip (sticky to top of the content area, not the whole page): row count, file
  name with a small "x" to remove/replace, Confirm button (primary, right-aligned on
  desktop; full-width on mobile, stacked below the file info).
- Below it, the data table fills remaining vertical space, scrolling internally (§6) —
  the page itself doesn't grow to accommodate 500 rows.
- Hierarchy: file identity and the Confirm action are the only things above the fold
  besides the table's header row — nothing else competes with "does this data look
  right, and do I want to proceed."

### Loading (AI processing) state

- Not a separate screen — an overlay/inline state on top of the preview screen (see §16
  for why this is deliberately not its own step). Table dims slightly and becomes
  non-interactive; the action strip's Confirm button is replaced by a progress indicator
  and status text ("Analyzing 42 leads with AI...").

### Result screen

- Summary bar at top: 3 compact stat tiles (Imported, Skipped, Total) — see §16 for why
  this is 3, not more.
- Below: the imported records table (primary focus, larger share of vertical space), then
  a clearly-labeled but visually secondary "Skipped records" section (collapsed by
  default if empty or small; expanded by default if non-trivial in count — see §16).
- A persistent "Import another file" action, top-right on desktop, bottom of content on
  mobile.

---

## 3. Component Hierarchy

```
App
 └─ CsvImporterPage
     └─ CsvImporter (owns wizard state — see §4)
         ├─ AppHeader                       (static: title + tagline, no nav)
         ├─ StepStatusRegion                (aria-live region announcing step changes, §12)
         ├─ UploadStep                      (rendered when step = "upload")
         │   ├─ Dropzone
         │   └─ UploadErrorMessage
         ├─ PreviewStep                     (rendered when step = "preview" | "processing")
         │   ├─ FileSummaryBar
         │   │   ├─ FileIdentity            (name, size, remove/replace)
         │   │   └─ ConfirmAction           (Button, or ProcessingIndicator when step = "processing")
         │   ├─ DataTable (variant: preview)
         │   └─ ImportErrorBanner           (shown on retry-after-failure)
         └─ ResultsStep                     (rendered when step = "results")
             ├─ SummaryStatTiles
             ├─ PartialFailureNotice         (conditional)
             ├─ DataTable (variant: results, section: imported)
             ├─ SkippedRecordsSection
             │   └─ DataTable (variant: results, section: skipped)
             └─ StartOverAction
```

### Responsibilities

| Component                                    | Responsible for                                                                                                                                                                                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CsvImporter`                                | Owns the wizard's state machine (§4); renders exactly one step's tree at a time; passes down only the state/handlers each child needs.                                                                                                                  |
| `AppHeader`                                  | Static branding/title only — no logic, no state.                                                                                                                                                                                                        |
| `Dropzone`                                   | Drag/drop + file-picker affordance, client-side validation (type/size), emits a validated `File` up or an inline error. Purely presentational + validation, no parsing.                                                                                 |
| `FileSummaryBar` / `FileIdentity`            | Shows what's selected, lets the user remove/replace before confirming.                                                                                                                                                                                  |
| `ConfirmAction`                              | A single component that renders either the Confirm button or (once submitted) the processing indicator — one place owns that transition, so the action area never shows two conflicting affordances.                                                    |
| `DataTable`                                  | One generic, reusable table (sticky header, scroll containers, empty/loading states) parameterized by column config and row data — used for both the preview and the two results tables (imported/skipped), not three bespoke implementations. See §16. |
| `SummaryStatTiles`                           | Renders the 3 top-line counts from the API response.                                                                                                                                                                                                    |
| `SkippedRecordsSection`                      | Collapsible wrapper around the skipped-records table with its own count in the section header.                                                                                                                                                          |
| `ImportErrorBanner` / `PartialFailureNotice` | Distinct components because they're semantically different (hard failure needing retry vs. informational partial-success notice), even though they may share visual styling.                                                                            |
| `StartOverAction`                            | Resets `CsvImporter`'s state back to the upload step.                                                                                                                                                                                                   |

---

## 4. State Management

All state is **local to `CsvImporter`**, held via a single reducer — no global store (this
repeats and confirms the decision in `docs/03-system-architecture.md` §6: a linear,
single-user wizard has no state that needs to outlive this component tree or be shared
across routes).

### State categories

| Category                     | Examples                                                                                                                                                 | Lives in                                                                                                                                         |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Wizard state**             | current step (`upload \| preview \| processing \| results`), the selected `File`, parsed `{ headers, rows }`, the API result, the current error (if any) | `CsvImporter`'s reducer — the single source of truth for "what screen are we on and why"                                                         |
| **Local/ephemeral UI state** | dropzone drag-over highlight, whether the skipped-records section is expanded, hover/focus state on a table cell for note expansion                      | Owned by the individual leaf component (`Dropzone`, `SkippedRecordsSection`) — never lifted, because nothing else needs to know about it         |
| **Derived state**            | row count (`rows.length`), whether Confirm is enabled (`step === "preview" && rows.length > 0`), imported/skipped percentages for the stat tiles         | Computed inline from wizard state at render time — never stored as its own state, to avoid it going stale relative to the data it's derived from |

### Why one reducer instead of several `useState`s

The wizard has meaningfully coupled transitions (e.g., "confirm" simultaneously means
"leave preview," "enter processing," and "clear any previous error") — a reducer makes
these transitions atomic and named (`FILE_SELECTED`, `CONFIRM_REQUESTED`,
`IMPORT_SUCCEEDED`, `IMPORT_FAILED`, `RESET`), which is easier to reason about and test
than coordinating five independent `useState` calls that could theoretically fall out of
sync with each other.

### What is explicitly NOT state

The CRM field list, enum values, and validation rules are constants imported from
`packages/shared`, not state — they never change at runtime and don't belong in a
reducer.

---

## 5. API Interaction Flow

| Step            | API called?                   | Notes                                                                                                         |
| --------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------- |
| File selected   | No                            | Client-side validation + parse only (`parseCsv` from shared package).                                         |
| Viewing preview | No                            | Table renders already-parsed local data. This is the brief's explicit "no AI processing yet" requirement.     |
| Confirm clicked | **Yes** — `POST /api/imports` | The only network call in the entire flow.                                                                     |
| Viewing results | No                            | Rendered directly from the single response payload; no follow-up calls (no per-row detail fetch, no polling). |

### Loading indicator behavior

The instant Confirm is clicked, the button becomes disabled and shows a busy state
(spinner + "Processing...") — feedback must be immediate (< 100ms perceived), even though
the actual response may take several seconds, so the user never wonders whether the click
registered.

### Error handling

- **Network failure / request never completed**: show `ImportErrorBanner` with "Couldn't
  reach the server — check your connection and try again," plus a Retry button that
  re-submits the same already-selected file (no need to re-upload).
- **4xx (validation, unsupported file, too large/many rows)**: shown as a specific,
  actionable message (see §10) — these indicate the file itself needs to change, so the
  UI routes the user back toward the upload/preview step rather than offering a blind
  Retry.
- **502 (AI provider failure)**: treated as retryable — "Our AI service is temporarily
  unavailable. Try again in a moment," with Retry.
- **200 with partial batch failure**: not an error path at all — rendered as results plus
  `PartialFailureNotice` (§10).

### Retry behavior

Retry is always **manual, user-initiated** (a button), never automatic/silent — an
automatic client-side retry loop on top of the backend's own per-batch retry
(`docs/07-ai-design.md` §5) would double up retry logic across two layers and could mask
a genuinely broken upstream from the user. One clear retry affordance is preferable to
two layers of invisible retrying.

---

## 6. Table Design

One generic `DataTable` component (see §3, confirmed in §16) serves all three tables
(preview, imported results, skipped results), configured per use via column definitions
and data — not three separate implementations.

### Structural behavior (all three tables)

- **Sticky header**: the header row stays pinned while the body scrolls vertically,
  so column identity is never lost on a long scroll.
- **Vertical scrolling**: the table body scrolls within a bounded-height container (not
  the whole page) — the page layout (header, summary bar) stays fixed and reachable.
- **Horizontal scrolling**: the table sits inside its own horizontally-scrollable
  container, independent of the page's horizontal scroll (which should never occur) —
  this is what lets a 15-column CRM record stay fully tabular on a narrow screen instead
  of being crammed or truncated into illegibility.
- **Empty state**: centered message + icon inside the table's bounds ("No rows to show"
  for an edge-case empty preview; "All rows were imported successfully" for an empty
  skipped table — treated as a positive, not a generic blank).
- **Loading state**: skeleton rows (a handful of pulsing placeholder rows matching the
  real row height) rather than a spinner replacing the whole table — this reserves the
  final layout's space so nothing jumps when data arrives.

### Preview table specifics

- Columns are exactly the CSV's own detected headers, in their original order — this
  table's job is "show me my file back accurately," not to impose the CRM schema early.
- No AI-related columns or styling — it must visually read as "your raw data," not
  "already processed."

### Results table specifics

- Columns are the fixed CRM field list, in the canonical order from
  `packages/shared/constants/crm-fields.ts` — consistent regardless of what the source
  CSV looked like.
- `crm_status` and `data_source` render as colored badges, not raw enum strings (§8).
- `crm_note`/`description` are truncated per-cell with an expand affordance (§8) so one
  long note can't blow out every row's height.
- The skipped table has one additional column, `reason` (human-readable, e.g. "Missing
  email and phone number" rather than the raw `MISSING_CONTACT_INFO` code).

### Pagination vs. virtualization — decision: virtualization, not pagination

Pagination is rejected because the brief explicitly asks for a scrollable table
experience ("horizontal scrolling, vertical scrolling, sticky headers"), and pagination
would work against that by hiding rows behind page-number clicks — it also fragments the
"scan my whole file at a glance" use case the preview step exists for. Instead:

- Render all rows directly for typical files (roughly under ~200 rows) — no virtualization
  overhead needed at this scale, and it keeps the implementation simple (per the
  simplicity principle from `docs/03-system-architecture.md` §6).
- Switch to row virtualization (rendering only the rows currently in/near the viewport)
  once row count crosses that threshold, so a 10,000-row CSV doesn't create 10,000 live
  DOM rows and degrade scroll performance. This is the direct implementation of the
  bonus "virtualized table for large CSVs" item, scoped precisely to when it's needed
  rather than applied unconditionally (unconditional virtualization adds complexity —
  e.g. it complicates "sticky header," which needs a small amount of extra care under
  virtualization — for files where it has no benefit).

---

## 7. Upload Experience

| Aspect                   | Design                                                                                                                                                                                                                                                                      |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Drag & drop**          | Dropzone highlights (border + background shift) on drag-over; drop anywhere in the zone accepts the file. A drag-over state that spans the full zone (not just a tiny target) makes the interaction forgiving.                                                              |
| **File picker**          | The entire dropzone is also a click target opening the native file picker — no separate tiny "browse" link required to hit, though the helper text still says "or click to browse" for discoverability.                                                                     |
| **Validation**           | Immediate, client-side, before any parsing: extension/MIME check and size ceiling, both sourced from `packages/shared/constants/limits.ts` (so the message the user sees is always consistent with what the server will actually accept — see `docs/06-shared-package.md`). |
| **Progress**             | For typical CSV sizes, parsing is near-instantaneous — no progress UI needed. If the file approaches the size ceiling, a brief "Reading file..." indicator covers the (still short) parse time so the UI never appears frozen.                                              |
| **Error messages**       | Specific, not generic: "This doesn't look like a CSV file" vs. "This file is 8.2 MB — the maximum is 5 MB" vs. "This file has no rows" — each names the actual problem so the user knows what to fix.                                                                       |
| **Supported file types** | Stated up front in the dropzone's helper text ("CSV files up to 5 MB"), not only surfaced as an error after a wrong attempt.                                                                                                                                                |
| **Maximum size**         | Same — stated proactively, sourced from the shared constant so it can never drift out of sync with actual enforcement.                                                                                                                                                      |
| **Remove file**          | A small "x" next to the file name in the preview step's `FileIdentity` — returns directly to the upload step, no confirmation dialog needed for an action this low-stakes and reversible.                                                                                   |
| **Replace file**         | Dragging/selecting a new file at any point before Confirm silently replaces the current selection and re-parses — no need to explicitly "remove" first.                                                                                                                     |

---

## 8. Result Screen

### Summary — 3 stat tiles (see §16 for why exactly 3)

`Imported` (large number, positive/neutral color) · `Skipped` (large number, muted/amber
if > 0, otherwise unemphasized) · `Total rows processed`. Each tile is a simple
number + label, no sparkline or chart — a chart would overstate the importance of a
single-import summary that has no historical trend to show.

### Imported records table

The primary artifact of the whole flow — largest, most visually prominent table, shown
expanded and un-collapsed always.

### Skipped records section

Secondary but not hidden: a labeled, collapsible section ("Skipped records (2)") placed
directly below the imported table. Collapsed by default only when count is 0 (in which
case it shows the positive empty state, collapsed, from §6) or very large relative to
imported (to avoid the negative outcome dominating the screen); expanded by default
otherwise, since seeing _why_ rows were skipped is part of trusting the tool.

### Statistics

Kept to the 3 stat tiles above plus, if the API reports batch-level failures, a small
supplementary line ("1 of 3 AI batches failed and were retried automatically" or "...
could not be processed") — not a separate dashboard of batch metrics, which would be more
detail than a user (as opposed to a developer debugging the import) needs.

### Badges & status colors

`crm_status` badge colors (semantic, not decorative):

| Value                 | Color intent                                                    |
| --------------------- | --------------------------------------------------------------- |
| `SALE_DONE`           | Success (strongest positive signal)                             |
| `GOOD_LEAD_FOLLOW_UP` | Positive/informational (in-progress, good)                      |
| `DID_NOT_CONNECT`     | Neutral/warning (needs action, not bad)                         |
| `BAD_LEAD`            | Negative/muted (closed-out, don't overemphasize with alarm-red) |
| blank                 | Plain neutral badge, e.g. "—"                                   |

`data_source` renders as a plain neutral/outline badge (identity, not a status judgment)
— using the same color treatment as `crm_status` would visually imply source is
good/bad, which it isn't.

### Expandable notes

`crm_note` and `description` are truncated to roughly one line in the table cell (with an
ellipsis) and expand on click/tap into a popover or inline expansion showing the full
text. This is necessary because these are the two genuinely free-text, unbounded-length
fields (per `docs/07-ai-design.md` §1, they can accumulate appended extra emails/phones)
— without truncation, one long note would force every row in the table to the same
inflated height.

---

## 9. Loading Experience

| Phase                | Duration (typical)                                                     | Indicator                                                                                                                                                                                           |
| -------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CSV parsing (client) | Milliseconds–low seconds for large files                               | None for the common case; a small inline spinner + "Reading file..." only if parsing measurably takes longer than instant, so a spinner never flashes for 50ms (which reads as jank, not feedback). |
| Uploading the file   | Sub-second to a few seconds depending on size/connection               | Folded into the single "processing" indicator below — a separate upload-progress bar is not worth the complexity at a 5 MB ceiling.                                                                 |
| AI processing        | Several seconds to tens of seconds, depending on row count/batch count | The most important loading state in the product — see below.                                                                                                                                        |
| Displaying results   | Instant (client-side render of an already-fetched payload)             | None needed.                                                                                                                                                                                        |

### Recommended AI-processing indicator

A **determinate** progress bar when batch-level progress is available (MVP ships a
buffered response, so this starts **indeterminate**; the bonus streaming enhancement from
`docs/07-ai-design.md` §5 upgrades it to determinate "Processing batch 2 of 4" once that
lands — the UI component should be built to accept either mode from the start so this
upgrade doesn't require a redesign). Paired with reassuring, specific status text
("Analyzing 42 leads with AI...") rather than a bare spinner — naming what's happening
reduces perceived wait time and builds trust that the system understands the request.

Avoid: a full-page blocking spinner that hides the user's data. Keeping the dimmed
preview table visible underneath (§2) signals "your data is safe and still here," which
matters more here than in a generic loading state, since the user just handed over a file
they care about.

---

## 10. Error States

| Error                                  | When                                              | Message pattern                                                                                                                                                      | Recovery                                                           |
| -------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Invalid/unsupported file               | On selection                                      | "This doesn't look like a CSV file. Please upload a .csv file."                                                                                                      | Select a different file — stays on upload step.                    |
| Empty CSV (header-only or 0 rows)      | On client parse                                   | "This file doesn't contain any data rows."                                                                                                                           | Select a different file.                                           |
| File too large                         | On selection                                      | "This file is {size} — the maximum is {limit}."                                                                                                                      | Select a different file.                                           |
| Malformed CSV (unparseable)            | On client parse                                   | "We couldn't read this file as a CSV. Check that it's a standard comma-separated file."                                                                              | Select a different file.                                           |
| Network error on Confirm               | During request                                    | "Couldn't reach the server. Check your connection and try again."                                                                                                    | Retry (re-submits same file).                                      |
| Gemini/AI failure (all batches)        | 502 response                                      | "Our AI service is temporarily unavailable. Please try again in a moment."                                                                                           | Retry.                                                             |
| Partial AI failure                     | 200 with `summary.batches.failed > 0`             | Not an error screen — an inline notice on the results screen: "{n} leads couldn't be processed and were skipped. The rest imported successfully."                    | No action required; informational.                                 |
| No records imported (all rows skipped) | 200, `totalImported === 0`                        | Results screen still renders, but leads with a direct, non-alarming headline: "No leads could be imported — every row was missing both an email and a phone number." | "Import another file" is the natural next action, already visible. |
| No internet                            | Detected via failed fetch / browser offline event | Same treatment as network error, optionally with an explicit "You appear to be offline" cue if the browser's connectivity API is available.                          | Retry once connection returns.                                     |

General recovery principle: **the user's file selection and parsed preview are never
discarded because of a backend error.** Every recoverable error returns to the preview
step with the same file still loaded, so retrying never requires re-uploading.

---

## 11. Responsive Behaviour

| Breakpoint (conceptual) | Layout behavior                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Desktop** (wide)      | Content column has a max width and centers, so tables/cards don't stretch edge-to-edge into unreadable line lengths for surrounding text; tables show as many columns as fit before horizontal scroll kicks in; summary stat tiles sit in a single row.                                                                                                                                                                                               |
| **Tablet**              | Content column uses full available width with standard margins; stat tiles may wrap to 2+1 rather than a single row; table horizontal scroll engages sooner (fewer columns visible before scrolling), which is expected and fine — the scroll affordance is designed for exactly this.                                                                                                                                                                |
| **Mobile**              | Stat tiles stack vertically, full width; the Confirm/action bar stacks its elements (file name row, then a full-width Confirm button) instead of a single horizontal row; the dropzone reduces padding but keeps a clearly tappable area; tables **remain tables with horizontal scroll** rather than collapsing into stacked "cards per row" — see §16 for why this is a deliberate rejection of the common "responsive table → cards" pattern here. |

Controls that move (not just resize) at narrow widths: the Confirm action moves from
inline-with-file-info to its own full-width row below; "Import another file" moves from
top-right to the bottom of the results content, so it doesn't compete with the page
title for thumb-reachable space on mobile.

---

## 12. Accessibility

- **Keyboard navigation**: the dropzone is a focusable, `Enter`/`Space`-activatable
  control that opens the file picker (not a `div` with only a click handler); all actions
  (Confirm, Retry, Remove file, expand note, expand skipped section) are real buttons,
  reachable and operable via keyboard alone, in a logical tab order matching visual order.
- **ARIA**: a visually-hidden `aria-live="polite"` region (`StepStatusRegion` in the
  component tree) announces step transitions and outcomes ("File selected, 42 rows
  detected," "Processing your import," "Import complete, 40 imported, 2 skipped") for
  screen reader users who wouldn't otherwise perceive a silent visual transition.
- **Focus management**: on transitioning into a new step, focus moves to that step's
  heading (not left stranded on a button that just disappeared, and not reset all the way
  to the top of the page) — this orients keyboard/screen-reader users without disorienting
  everyone else with an unexpected scroll jump.
- **Color contrast**: status badges and error text meet WCAG AA contrast against their
  background at both the badge-fill and badge-text level, not just against the page
  background — a common miss with colored badges.
- **Screen reader table semantics**: real `<table>` markup with proper header
  associations (not a `div`-grid styled to look like a table), so row/column context is
  announced correctly — this also happens to be the simplest way to get sticky headers
  and native scrolling behavior, so accessibility and implementation simplicity point the
  same direction here.
- **Non-color status signaling**: status badges pair color with a text label (never color
  alone) — already implied by "badge," but worth stating as a requirement rather than an
  accident of using badges.

---

## 13. UI Components

| Component                                                                                | Used in                                                                                               |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `Button` (primary/secondary/ghost/destructive variants)                                  | Confirm, Retry, Remove file, Start over, Expand/collapse actions                                      |
| `Dropzone`                                                                               | Upload step                                                                                           |
| `DataTable` (generic, configurable)                                                      | Preview table, imported results table, skipped results table                                          |
| `Badge`                                                                                  | `crm_status`, `data_source` cells                                                                     |
| `SummaryStatTile`                                                                        | Results screen summary bar                                                                            |
| `Toast`                                                                                  | Success acknowledgment on import completion; non-blocking transient errors                            |
| `Banner`/inline alert (distinct from `Toast` — persistent, in-page, not auto-dismissing) | Hard-failure error state, partial-failure notice                                                      |
| `ProgressIndicator` (indeterminate and determinate modes)                                | AI-processing state                                                                                   |
| `Spinner`                                                                                | Small inline busy states (e.g. brief file-read)                                                       |
| `EmptyState`                                                                             | Empty preview/skipped tables                                                                          |
| `ErrorState`                                                                             | Unrecoverable/full parse-failure presentation, if ever needed as a full-area state rather than inline |
| `SkeletonLoader` (row-shaped)                                                            | Table loading placeholder                                                                             |
| `Popover`/`Tooltip`                                                                      | Expandable note/description cell content                                                              |
| `CollapsibleSection`                                                                     | Skipped records section                                                                               |
| `FileIdentity`                                                                           | Selected-file display with remove affordance                                                          |

Every component above maps directly to a shadcn/ui primitive or a thin composition of
one or two primitives (per `docs/04-folder-structure.md`'s `components/ui/` vs.
`components/csv-importer/` split) — nothing here requires a custom design system built
from scratch.

---

## 14. Design System

Kept deliberately restrained — this is a focused utility, not a marketing site.

- **Typography**: one clean, modern sans-serif (system font stack or a single web font
  such as Inter) across the whole app. A small, disciplined type scale: page title,
  section heading, body text, small/caption text (table cell secondary info, helper
  text). No more than these 4 sizes needed anywhere in this product.
- **Spacing**: a consistent base unit (e.g. 4px grid) applied via a small fixed set of
  spacing steps, not arbitrary one-off values — this is what makes the layout read as
  "considered" rather than "assembled."
- **Border radius**: one consistent, moderate radius (soft, not sharp; not pill-shaped)
  applied uniformly to cards, inputs, buttons, and badges, so the interface reads as one
  coherent system rather than a mix of components with different rounding conventions.
- **Shadows**: minimal — a subtle elevation shadow only where it communicates something
  real (e.g. the processing overlay sitting above the dimmed table). Flat design
  elsewhere; shadows are not used decoratively on every card.
- **Icons**: one consistent icon set (e.g. Lucide, which ships alongside shadcn/ui) at
  one consistent stroke weight throughout — upload icon, file icon, status icons, chevrons
  for expand/collapse.
- **Animation**: short, functional transitions only (150–200ms) for state changes that
  benefit from continuity (step transitions, expand/collapse, badge/toast entrance) — no
  decorative motion, no animation whose absence would make the product feel broken rather
  than merely less polished.
- **Color palette**: a neutral base (background/surface/border/text in grayscale) plus
  one primary accent color for the main call-to-action (Confirm, primary buttons) and a
  small semantic set (success/warning/error/info) reused consistently for both status
  badges and error/notice banners — the same "success green" means the same thing
  everywhere in the app, never redefined per-component.

---

## 15. Future Improvements (explicitly out of scope for this assignment)

- **Dark mode** — tracked as a bonus item already (`docs/10-implementation-plan.md`
  Phase 6); the design system above (one accent + neutral scale + semantic colors) is
  chosen partly because it maps cleanly onto a light/dark theme pair without a redesign.
- **Column search / filtering** on the results table, for larger imports where scanning
  isn't practical.
- **CSV download** of the imported/skipped results, so the AI-normalized output is
  portable outside the app.
- **Manual column-mapping override** — letting a user correct a specific AI field
  mapping before finalizing, for the rare ambiguous case the AI gets wrong. This is
  probably the single highest-value future improvement, since it directly addresses the
  core risk in `docs/01-assignment-analysis.md` (AI non-determinism) with a human-in-the-
  loop safety net — but it's a meaningfully bigger feature (an editable mapping UI) and
  is out of scope for this pass.
- **Keyboard shortcuts** (e.g. `Esc` to cancel/remove a selected file, `Enter` to confirm)
  for power users doing repeated imports.
- **Import history** — would require reversing the stateless architectural decision
  (`docs/03-system-architecture.md` §5), so this is a genuine future-scope item, not a
  near-term addition.

---

## 16. Senior Product Designer Review — simplifications adopted

Reviewing the design above with a bias toward cutting anything that adds visual or
interaction complexity without a proportional gain in usability. These are decisions,
not open questions — the sections above already reflect them.

1. **Collapse "Loading" from a 4th step into an overlay state of the Preview step.**
   Treating loading as its own full navigational step (as the brief's numbering might
   suggest) would mean building a whole screen for a transient state that has no user
   decision in it and no reason to persist. Keeping the dimmed preview table visible
   underneath a processing indicator is simpler to build, and better UX — the user's data
   never visually disappears mid-operation.

2. **Reject the "responsive table → stacked cards" pattern for mobile.** This is a very
   common responsive-table recipe, and it's wrong for this product: a CRM lead record has
   15 fields, and converting each row into a vertical label/value card on mobile would
   make scanning 40 leads dramatically slower than a horizontally-scrollable table (which
   the brief explicitly asks for). Horizontal scroll on mobile is the correct trade-off
   here, not a compromise.

3. **One generic `DataTable`, not three bespoke tables.** The original brief describes a
   preview table and a results table as if they're different components; treating
   imported vs. skipped as a third variant of the same component (rather than a third
   bespoke build) directly serves the "reusability" evaluation criterion and halves the
   surface area that needs sticky-header/scroll/empty-state logic implemented and tested.

4. **Exactly 3 summary stat tiles, not more.** An early instinct might be to also show
   "batches processed," "batches failed," "success rate %," etc. as tiles. Cut down to
   Imported / Skipped / Total — everything else (batch failure detail) is demoted to a
   single supplementary sentence (§8), because a user importing leads cares about lead
   outcomes, not backend batch mechanics; surfacing too many numbers at once dilutes the
   two that actually matter.

5. **No tab switcher between imported and skipped records.** An earlier instinct was to
   put imported/skipped behind tabs (common in dashboard UIs). Rejected: skipped records
   are usually a small minority the user specifically wants to double check ("why weren't
   these imported"), and hiding them behind a tab click adds friction to exactly the
   information most likely to prompt a follow-up action (fixing the source data and
   re-importing). A collapsible section below the main table keeps both visible in the
   same scroll, without letting skipped records visually dominate when there are few of
   them.

6. **No persistent step-number "stepper" chrome (e.g. "Step 2 of 4" progress rail).**
   With loading folded into Preview (#1 above), there are really only 3 user-facing
   moments (Upload, Preview+Confirm, Results), and the screen's own content already makes
   it obvious which one you're in. A numbered stepper component would add a permanent UI
   element that mostly restates what's already visually self-evident — cut in favor of
   the `aria-live` status region (§12), which gives screen reader users the same
   orientation information without adding visual chrome for everyone else.

7. **No confirmation dialog for "remove file."** It's a zero-cost, instantly-reversible
   action (just re-select the same file again) — a confirm-dialog here would be the kind
   of unnecessary friction that makes a tool feel bureaucratic rather than fast.

**Net effect of this review**: the shipped design has fewer distinct components and
screens than a literal reading of the 4-step brief might suggest, while satisfying every
explicit requirement (preview before AI, explicit confirm action, distinct results
display with imported/skipped/totals). That's the intended outcome — simplicity was
treated as a design constraint, not just an engineering one.
