import { Money, decimal, maybeDecimal } from "../money.js";
import type { RawRow } from "../schema.js";
import type { Movement } from "../types.js";

export const CLASSIFIED_TYPES = [
  "TRADING|BUY",
  "CASH|CARD_TRANSACTION",
  "CASH|CARD_TRANSACTION_INTERNATIONAL",
  "CASH|TRANSFER_INSTANT_INBOUND",
  "CASH|TRANSFER_INSTANT_OUTBOUND",
  "CASH|INTEREST_PAYMENT",
  "CASH|BENEFITS_SAVEBACK",
] as const;

export function parseDatetime(value: string): Date {
  const truncated = value.replace(/(\.\d{3})\d+/, "$1");
  const date = new Date(truncated);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError(`Not an ISO 8601 datetime: ${JSON.stringify(value)}`);
  }
  return date;
}

function nullIfEmpty(value: string): string | null {
  return value === "" ? null : value;
}

function base(row: RawRow) {
  const currency = row.currency || "EUR";
  return {
    id: row.transaction_id,
    datetime: parseDatetime(row.datetime),
    fee: Money.maybe(row.fee, currency),
    tax: Money.maybe(row.tax, currency),
    description: row.description,
    raw: row,
  };
}

export function classify(row: RawRow): Movement {
  const currency = row.currency || "EUR";
  const key = `${row.category}|${row.type}`;

  switch (key) {
    case "TRADING|BUY":
      return {
        ...base(row),
        kind: "buy",
        amount: Money.parse(row.amount, currency),
        isin: row.symbol,
        name: row.name,
        assetClass: row.asset_class,
        shares: decimal(row.shares),
        price: Money.parse(row.price, currency),
      };

    case "CASH|CARD_TRANSACTION":
    case "CASH|CARD_TRANSACTION_INTERNATIONAL":
      return {
        ...base(row),
        kind: "card",
        amount: Money.parse(row.amount, currency),
        merchant: row.name,
        international: row.type === "CARD_TRANSACTION_INTERNATIONAL",
        originalAmount: Money.maybe(
          row.original_amount,
          row.original_currency || currency,
        ),
        fxRate: maybeDecimal(row.fx_rate),
        mccCode: nullIfEmpty(row.mcc_code),
      };

    case "CASH|TRANSFER_INSTANT_INBOUND":
    case "CASH|TRANSFER_INSTANT_OUTBOUND":
      return {
        ...base(row),
        kind: "transfer",
        amount: Money.parse(row.amount, currency),
        direction: row.type.endsWith("_INBOUND") ? "inbound" : "outbound",
        instant: true,
        counterpartyName: nullIfEmpty(row.counterparty_name),
        counterpartyIban: nullIfEmpty(row.counterparty_iban),
        paymentReference: nullIfEmpty(row.payment_reference),
      };

    case "CASH|INTEREST_PAYMENT":
      return {
        ...base(row),
        kind: "interest",
        amount: Money.parse(row.amount, currency),
      };

    case "CASH|BENEFITS_SAVEBACK":
      return {
        ...base(row),
        kind: "saveback",
        amount: Money.parse(row.amount, currency),
      };

    default:
      return {
        ...base(row),
        kind: "unknown",
        amount: Money.maybe(row.amount, currency),
        category: row.category,
        type: row.type,
      };
  }
}
