/**
 * Client-side data export.
 *
 * There is no `/api/export` endpoint on the backend, so these build files from
 * records already fetched through the typed API rather than from a server
 * report. PDF export is deliberately not offered: no PDF library is wired up,
 * and a button that produced nothing would be a fake feature.
 */

function cellValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * RFC 4180 quoting. Every field is wrapped in double quotes with inner quotes
 * doubled — needed because inspection descriptions and finding notes contain
 * commas and newlines, and a naive join produces a file that silently misaligns
 * columns in every spreadsheet.
 *
 * Rows are `unknown[]` rather than `Record<string, unknown>[]` so typed
 * interfaces (Finding, MaintenanceTicket) can be exported without an index
 * signature being bolted onto them.
 */
export function toCsv(rows: readonly unknown[], columns: readonly string[]): string {
  const header = columns.map((column) => `"${column}"`).join(",");
  const body = rows
    .map((row) => {
      const record = row as Record<string, unknown>;
      return columns
        .map((column) => `"${cellValue(record[column]).replace(/"/g, '""')}"`)
        .join(",");
    })
    .join("\r\n");
  return body.length > 0 ? `${header}\r\n${body}\r\n` : `${header}\r\n`;
}

export function toJson(rows: readonly unknown[], meta: Record<string, unknown> = {}): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      ...meta,
      count: rows.length,
      records: rows,
    },
    null,
    2,
  );
}

export function downloadFile(filename: string, contents: string, mime: string): void {
  const blob = new Blob([contents], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoked on the next tick so the navigation has time to start in Safari/Firefox.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function exportTimestamp(): string {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
}
