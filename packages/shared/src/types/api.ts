// Generic response envelope (docs/05-api-design.md §1: "All success
// responses: `{ data: ... }`"). Kept as a plain TS type, not a zod schema,
// because zod schemas validate concrete shapes — there is no runtime
// equivalent of "a schema for any T". Concrete endpoints wrap their own
// result schema in `z.object({ data: resultSchema })` inline where needed
// (see apps/web/src/lib/api-client.ts), rather than each hand-writing a
// dedicated `{data: T}` schema — those inferred shapes structurally satisfy
// this same generic type.
export interface ApiResponse<T> {
  data: T;
}
