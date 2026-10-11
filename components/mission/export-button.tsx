"use client";

import { Button } from "@/components/ui/button";
import { Download } from "@/components/icons";
import { useToast } from "@/components/ui/use-toast";
import { downloadFile, exportTimestamp, toCsv, toJson } from "@/lib/export";

interface ExportButtonProps {
  /** Rows exactly as loaded from the API. Nothing is synthesized. */
  rows: readonly unknown[];
  columns: readonly string[];
  /** Used in the filename and the confirmation toast. */
  name: string;
  format?: "csv" | "json";
}

/**
 * Exports the rows currently loaded for this view.
 *
 * Replaces the "Export" buttons that previously sat on four pages with no
 * handler at all: clicking them looked like a working feature but produced
 * nothing. When there are no rows the button is disabled rather than writing an
 * empty file.
 */
export function ExportButton({ rows, columns, name, format = "csv" }: ExportButtonProps) {
  const { toast } = useToast();
  const empty = rows.length === 0;

  function handleExport() {
    if (empty) return;
    const stamp = exportTimestamp();

    if (format === "json") {
      downloadFile(
        `inspectra-${name}-${stamp}.json`,
        toJson(rows, { columns }),
        "application/json",
      );
    } else {
      downloadFile(
        `inspectra-${name}-${stamp}.csv`,
        toCsv(rows, columns),
        "text/csv",
      );
    }

    toast({
      title: `${name} exported`,
      description: `${rows.length} record(s) written as ${format.toUpperCase()}.`,
    });
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={empty}
      title={empty ? `No ${name} to export yet` : `Export ${rows.length} ${name} as ${format.toUpperCase()}`}
    >
      <Download className="mr-2 h-4 w-4" />
      Export {format.toUpperCase()}
    </Button>
  );
}
