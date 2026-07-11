# 07 — AI Design

This is the highest-weighted evaluation area ("AI Prompt Engineering" is listed first),
so the design leans on two ideas: **make the model's job as narrow as possible**, and
**never trust the model's output without re-checking it in code**.

## 1. Provider abstraction

```ts
// packages/shared or apps/api/src/providers/ai — interface types can live in shared,
// implementation must stay in apps/api (see 06-shared-package.md §6)

interface AiExtractionProvider {
  extractRecords(input: ExtractionBatchInput): Promise<ExtractionBatchResult>;
}
```

`GeminiExtractionProvider` is the only implementation, selected by a factory reading
`AI_PROVIDER` (default `gemini`) from validated env config:

```ts
function createAiExtractionProvider(config: AiProviderConfig): AiExtractionProvider {
  switch (config.provider) {
    case "gemini":
      return new GeminiExtractionProvider(config);
    default:
      throw new Error(`Unsupported AI provider: ${config.provider}`);
  }
}
```

`ImportService` depends only on the `AiExtractionProvider` interface, injected at
construction (plain factory function, not a DI framework — see
`03-system-architecture.md` §6). Adding `OpenAiExtractionProvider` or
`ClaudeExtractionProvider` later means: implement the interface, add one `case` to the
factory. Zero changes to `ImportService`, controllers, or routes. This is the concrete
mechanism behind the brief's "provider-independent" requirement.

## 2. Why structured output, not "ask nicely and parse"

The naive approach — prompt the model to "return JSON" and `JSON.parse()` the response —
is a reliability risk: models occasionally wrap output in prose, markdown fences, or
produce near-valid JSON. Instead:

- Use Gemini's **structured output** feature (`responseMimeType: "application/json"` +
  `responseSchema`), which constrains generation so the model can only emit tokens that
  form valid JSON matching the given schema. This eliminates the entire class of
  "model chattered before the JSON" or "trailing comma" failures at the source, rather
  than trying to regex/strip them out after the fact.
- The `responseSchema` passed to Gemini is generated from the **same** shared zod CRM
  schema used to validate the response afterward (via a zod-to-JSON-schema conversion at
  provider construction time), so the "shape I asked for" and "shape I validate against"
  can never drift apart.
- Even with structured output constraining shape, **values** can still be wrong (e.g. an
  invalid enum string is structurally impossible if the schema uses a JSON Schema `enum`,
  but a hallucinated phone number in the wrong field is still possible). That's what §4
  (post-validation) is for — structured output solves shape, not truthfulness.

## 3. Prompt design

One prompt template per batch call, built from the shared CRM field list/constants
(never hand-duplicated into the prompt string):

**System/instruction content** (built once, not per-batch):

1. **Role framing**: "You are extracting CRM lead data from an arbitrary CSV export. Column
   names are unpredictable and may come from Facebook Lead Ads, Google Ads, a real-estate
   CRM, or a manually created spreadsheet."
2. **Target schema**: the 15 fields, each with its description (from
   `constants/crm-fields.ts`) — e.g. `mobile_without_country_code`: "the lead's phone
   number with any country code/prefix removed."
3. **Enum constraints spelled out explicitly** (redundant with `responseSchema`, but
   redundancy in a prompt costs nothing and measurably improves adherence):
   - `crm_status`: exactly one of `GOOD_LEAD_FOLLOW_UP | DID_NOT_CONNECT | BAD_LEAD | SALE_DONE`, or `""` if the source data gives no confident signal — never invent a status.
   - `data_source`: exactly one of the five allowed slugs, or `""` if no confident match — explicitly instructed not to guess a "closest" value.
4. **Field-mapping heuristics** (the actual "intelligence" — see §3.1 below).
5. **Multi-value handling rule**: first email/mobile found → the field; any additional
   emails/mobiles → appended to `crm_note` as plain readable text (e.g.
   `"Additional email: x@y.com"`).
6. **Date handling rule**: `created_at` must be a value JS `new Date(...)` can parse.
   Prefer preserving the source format if it's already unambiguous (e.g. `YYYY-MM-DD...`);
   only reformat when the source is ambiguous or non-standard. If no date-like column
   exists, leave `created_at` blank rather than fabricating "now."
7. **Skip instruction**: if a row has neither an email nor a phone number in any
   recognizable column, do not include it in the output at all.
8. **CSV-safety instruction**: never emit raw newline characters inside a field value;
   use `\n` literally if a line break is semantically needed inside `crm_note`/`description`.
9. **Few-shot examples**: 2–3 compact input→output pairs covering (a) a clean, obviously-
   labeled CSV, (b) a messy CSV with ambiguous headers (e.g. `Contact`, `Ph.`, `Date Added`),
   and (c) a row that must be skipped. Few-shot examples are the single highest-leverage
   tool for "handling ambiguous columns," which is called out explicitly as an evaluation
   criterion.

**Per-batch content**: the batch's header row + up to N rows (raw, as parsed — the model
sees exactly what a human reviewer would see, nothing pre-transformed) as compact JSON,
plus `batchIndex`/`totalBatches` for the model's own context (not used programmatically).

### 3.1 Field-mapping heuristics included in the prompt

These are the concrete instructions that do the "intelligent mapping" work, derived from
thinking through the example source types in the brief (Facebook/Google Ads exports, real
estate CRM exports, manual spreadsheets):

- Prefer semantic matching over exact header-string matching: a column named `Phone`,
  `Mobile`, `Contact Number`, `Ph.`, or `WhatsApp` all map to the phone field; `Full Name`,
  `Lead Name`, `Contact Name` all map to `name`.
- If a single column contains a combined value (e.g. `"John Doe <john@x.com>"` or
  `"City, State"`), split it into the appropriate separate fields rather than leaving it
  concatenated in one.
- If **no** column plausibly maps to a required CRM concept (e.g. no city-like column
  exists anywhere), leave that field blank — never fabricate a value.
- `country_code` vs. a phone number that already includes a leading `+91`: extract the
  code separately so `mobile_without_country_code` never itself starts with `+` or a
  country prefix.
- Free text that doesn't fit any structured field (a generic "Comments"/"Message" column,
  campaign metadata, ad set name, etc.) goes into `description`, not discarded.

## 4. Post-AI validation (defense in depth)

The prompt asks the model to follow the rules above, but the backend re-derives the rules
it can re-derive deterministically, rather than trusting the model followed them:

1. Parse the AI's structured JSON response (already schema-shaped, per §2).
2. Validate every record against the shared `crmRecordSchema` (zod). A record that fails
   schema validation outright (not just "field is blank," but literally malformed) is
   dropped into `skipped` with reason `AI_EXTRACTION_FAILED`, not silently coerced.
3. Re-apply the **skip rule** in code: if both `email` and `mobile_without_country_code`
   are empty after extraction, move the record to `skipped` with reason
   `MISSING_CONTACT_INFO` — even if the model already tried to omit it, this is the actual
   enforcement point, not the prompt.
4. Re-run `csv-safe-text` sanitization (from `packages/shared/utils`) on `crm_note` and
   `description` regardless of what the model produced, to guarantee the CSV-row
   invariant holds even if the model ignored instruction #8.
5. Confirm `crm_status`/`data_source` are members of the allowed enum arrays (imported
   from the same shared constants used to build the prompt and the `responseSchema`); if
   not, coerce to `""` rather than reject the whole record — a bad enum guess shouldn't
   sink an otherwise-good lead.
6. Confirm `new Date(created_at)` doesn't produce `Invalid Date`; if it does, blank the
   field rather than reject the record.

This means the AI is responsible for _judgment_ (which column means what), while the
backend is responsible for _invariants_ (schema shape, enum membership, the skip rule,
CSV safety) — judgment calls are cheap to get slightly wrong per-row, invariant
violations are not acceptable at all.

## 5. Batching, concurrency, retries, and progress (bonus)

- Rows are chunked into batches of `AI_BATCH_SIZE` (default 25) by `ImportService`.
- Batches run with bounded concurrency (`AI_BATCH_CONCURRENCY`, default 3) via a small
  concurrency-limited `Promise` pool — not a queueing library, just a loop that keeps at
  most N promises in flight (see `03-system-architecture.md` §6 on why no job queue).
- Each batch gets up to 2 retries with exponential backoff (e.g. 500ms, 2s) on
  retryable failures (HTTP 429/5xx/timeout from Gemini). Non-retryable failures
  (e.g. a 400 indicating a genuinely malformed request) fail the batch immediately.
- A batch that exhausts retries does not fail the HTTP request — its rows are recorded in
  `skipped` with reason `AI_EXTRACTION_FAILED`, and `summary.batches.failed` increments
  (see `05-api-design.md` §2 on why this is a `200`, not an error response).
- **Progress indicator (bonus)**: rather than a polling job-status endpoint (which would
  reintroduce state), the `POST /api/imports` response is sent as an HTTP chunked/
  streamed response — the server writes one newline-delimited JSON progress event per
  completed batch (`{ type: "batch_complete", batchIndex, of }`) as it happens, then a
  final `{ type: "result", data: ... }` event when done. The frontend reads the stream
  incrementally to drive a progress bar. This achieves the "progress during AI
  processing" and "streaming/incremental" bonus items on the _same_ connection, with no
  server-side job store — fully compatible with the stateless constraint. This is a
  phase-2/bonus enhancement; the MVP ships with a single buffered JSON response first
  (see `10-implementation-plan.md`).

## 6. Token / cost considerations

- Sending only the current batch's rows (not the whole file) per prompt keeps each call
  well inside context limits regardless of overall file size.
- The system/instruction portion of the prompt is identical across all batches in an
  import; if the chosen SDK supports prompt/context caching for repeated prefixes, this
  is a natural place to use it to cut latency and cost on multi-batch imports — a phase-2
  optimization, not required for correctness.
- `AI_BATCH_SIZE` is deliberately configurable rather than hard-coded, since the right
  tradeoff between "fewer, larger batches (cheaper, slower failure isolation)" and "more,
  smaller batches (more resilient, more overhead)" is a tuning decision, not an
  architectural one.

## 7. Testability

Because `AiExtractionProvider` is an interface, unit tests for `ImportService` use a
fake/in-memory provider that returns canned `ExtractionBatchResult`s — no network calls,
no real API key needed to test batching, retry, and aggregation logic. A small number of
integration tests do exercise the real `GeminiExtractionProvider` against fixture CSVs
(`test/fixtures/csv/`) covering the messy/ambiguous cases from `01-assignment-analysis.md`
§4, gated behind an env flag so CI can run without requiring a live API key if none is
configured.
