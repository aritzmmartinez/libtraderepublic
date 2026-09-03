import Papa from "papaparse";

import { classify } from "./classifiers/index.js";
import { missingColumns, rawRowSchema, unknownColumns } from "./schema.js";
import type { RawRow } from "./schema.js";
import type { Issue, Movement } from "./types.js";

export interface ParseOptions {
  classify?: (row: RawRow) => Movement;
}

export interface ParseResult {
  records: RawRow[];
  movements: Movement[];
  issues: Issue[];
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function parseTransactionsCsv(
  csv: string,
  options: ParseOptions = {},
): ParseResult {
  const classifyRow = options.classify ?? classify;
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: "greedy",
  });

  const issues: Issue[] = [];
  const records: RawRow[] = [];
  const movements: Movement[] = [];

  const header = parsed.meta.fields ?? [];
  for (const name of unknownColumns(header)) {
    issues.push({
      code: "unknown-column",
      line: 1,
      message: `Column not known to this version: "${name}"`,
      raw: header,
    });
  }
  for (const name of missingColumns(header)) {
    issues.push({
      code: "missing-column",
      line: 1,
      message: `Column missing from the export: "${name}"`,
      raw: header,
    });
  }

  for (const error of parsed.errors) {
    issues.push({
      code: "malformed-csv",
      line: (error.row ?? 0) + 2,
      message: error.message,
      raw: null,
    });
  }

  parsed.data.forEach((raw, index) => {
    const line = index + 2;

    const validated = rawRowSchema.safeParse(raw);
    if (!validated.success) {
      issues.push({
        code: "invalid-row",
        line,
        message: validated.error.issues.map((i) => i.message).join("; "),
        raw,
      });
      return;
    }

    const row = validated.data;
    if (row.transaction_id === "" && row.type === "" && row.amount === "") {
      return;
    }
    records.push(row);

    let movement: Movement;
    try {
      movement = classifyRow(row);
    } catch (error) {
      issues.push({ code: "invalid-row", line, message: message(error), raw });
      return;
    }

    movements.push(movement);
    if (movement.kind === "unknown") {
      issues.push({
        code: "unknown-type",
        line,
        message: `Unclassified type: "${row.category}|${row.type}"`,
        raw,
      });
    }
  });

  return { records, movements, issues };
}
