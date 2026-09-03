import { readFile } from "node:fs/promises";

import { parseTransactionsCsv } from "./parser.js";
import type { ParseOptions, ParseResult } from "./parser.js";

export async function parseTransactionsFile(
  path: string,
  options: ParseOptions = {},
): Promise<ParseResult> {
  return parseTransactionsCsv(await readFile(path, "utf8"), options);
}

export * from "./index.js";
