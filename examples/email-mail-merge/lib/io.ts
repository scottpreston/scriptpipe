/**
 * Parse a simple comma-separated CSV (no quoted fields) into row objects keyed by header.
 *
 * This is example-specific on purpose: file and JSON IO come from `@scriptpipe/core`, but
 * parsing a particular input format is a domain concern a real project would handle with
 * its own parser (e.g. `csv-parse` or `papaparse`).
 */
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    throw new Error('CSV is empty — expected a header row and at least one record.');
  }

  const header = lines[0]!.split(',').map((cell) => cell.trim());
  return lines.slice(1).map((line, index) => {
    const cells = line.split(',');
    if (cells.length !== header.length) {
      throw new Error(
        `CSV row ${index + 1} has ${cells.length} column(s), expected ${header.length}.`,
      );
    }
    const row: Record<string, string> = {};
    header.forEach((key, col) => {
      row[key] = cells[col]!;
    });
    return row;
  });
}
