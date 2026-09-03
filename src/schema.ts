import { z } from "zod";

export const CSV_COLUMNS = [
  "datetime",
  "date",
  "account_type",
  "category",
  "type",
  "asset_class",
  "name",
  "symbol",
  "shares",
  "price",
  "amount",
  "fee",
  "tax",
  "currency",
  "original_amount",
  "original_currency",
  "fx_rate",
  "description",
  "transaction_id",
  "counterparty_name",
  "counterparty_iban",
  "payment_reference",
  "mcc_code",
] as const;

export type CsvColumn = (typeof CSV_COLUMNS)[number];

const cell = z
  .string()
  .default("")
  .transform((value) => value.trim());

export const rawRowSchema = z.object({
  datetime: cell,
  date: cell,
  account_type: cell,
  category: cell,
  type: cell,
  asset_class: cell,
  name: cell,
  symbol: cell,
  shares: cell,
  price: cell,
  amount: cell,
  fee: cell,
  tax: cell,
  currency: cell,
  original_amount: cell,
  original_currency: cell,
  fx_rate: cell,
  description: cell,
  transaction_id: cell,
  counterparty_name: cell,
  counterparty_iban: cell,
  payment_reference: cell,
  mcc_code: cell,
});

export type RawRow = z.infer<typeof rawRowSchema>;

export function unknownColumns(header: readonly string[]): string[] {
  const known = new Set<string>(CSV_COLUMNS);
  return header.filter((name) => name !== "" && !known.has(name));
}

export function missingColumns(header: readonly string[]): CsvColumn[] {
  const present = new Set(header);
  return CSV_COLUMNS.filter((name) => !present.has(name));
}
