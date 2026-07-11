import Papa from "papaparse";
import type { CsvPreview, CsvRow } from "../types/csv";

function extractRow(rawRow: Record<string, string>, headers: string[]): CsvRow {
  const row: CsvRow = {};
  for (const header of headers) {
    const value = rawRow[header];
    row[header] = typeof value === "string" ? value : "";
  }
  return row;
}

// The one CSV parser used by both apps (docs/06-shared-package.md §4) — the
// browser's client-side preview and the backend's authoritative parse must
// never diverge. Takes a string, not a Buffer: this package has no Node
// types available (it also runs in the browser), so the backend decodes
// its upload buffer to a string before calling this.
export function parseCsv(input: string): CsvPreview {
  const trimmed = input.trim();

  if (trimmed.length === 0) {
    throw new Error("The file is empty.");
  }

  const result = Papa.parse<Record<string, string>>(trimmed, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
    transformHeader: (header) => header.trim(),
    transform: (value) => value.trim(),
  });

  const headers = result.meta.fields ?? [];

  if (headers.length === 0) {
    throw new Error("No columns could be detected in this file.");
  }

  const rows = result.data.map((rawRow) => extractRow(rawRow, headers));

  return { headers, rows };
}
