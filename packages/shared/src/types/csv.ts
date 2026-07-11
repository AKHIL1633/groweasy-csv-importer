export type CsvRow = Record<string, string>;

export interface CsvPreview {
  headers: string[];
  rows: CsvRow[];
}
