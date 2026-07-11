// application/vnd.ms-excel and text/plain are deliberately included even
// though they're not "the" CSV MIME type — browsers/OSes commonly mislabel
// .csv this way (see docs/05-api-design.md §2). application/octet-stream
// covers the common case of no file association existing at all. The
// mandatory .csv extension check elsewhere is what keeps this permissive
// list safe.
export const ACCEPTED_CSV_MIME_TYPES: readonly string[] = [
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
  "text/plain",
  "application/octet-stream",
];

export const ACCEPTED_CSV_EXTENSION = ".csv";
