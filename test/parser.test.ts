import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { classify } from "../src/classifiers/index.js";
import { Money, decimal, maybeDecimal } from "../src/money.js";
import { parseTransactionsCsv } from "../src/parser.js";
import { CSV_COLUMNS, rawRowSchema } from "../src/schema.js";
import { dividendMovementSchema } from "../src/types.js";
import type { Movement, MovementKind } from "../src/types.js";

const csv = readFileSync(
  fileURLToPath(new URL("./fixtures/transactions.csv", import.meta.url)),
  "utf8",
);

const result = parseTransactionsCsv(csv);
const emptyRow = rawRowSchema.parse({});

function only<K extends MovementKind>(
  kind: K,
  index = 0,
): Extract<Movement, { kind: K }> {
  const matches = result.movements.filter((m) => m.kind === kind);
  const movement = matches[index];
  if (!movement) throw new Error(`No ${kind} movement at index ${index}`);
  return movement as Extract<Movement, { kind: K }>;
}

describe("parseTransactionsCsv", () => {
  it("reads every row of the fixture, header included", () => {
    expect(result.records).toHaveLength(13);
    expect(result.movements).toHaveLength(13);
    expect(result.issues.filter((i) => i.code !== "unknown-type")).toEqual([]);
  });

  it("classifies each verified type", () => {
    expect(result.movements.map((m) => m.kind)).toEqual([
      "transfer",
      "buy",
      "card",
      "card",
      "interest",
      "saveback",
      "transfer",
      "sell",
      "dividend",
      "dividend",
      "dividend",
      "direct-debit",
      "unknown",
    ]);
  });

  it("maps a BUY with its instrument and quantity", () => {
    const buy = only("buy");
    expect(buy.isin).toBe("IE00EXAMPLE01");
    expect(buy.assetClass).toBe("FUND");
    expect(buy.shares.toFixed()).toBe("1.23456789");
    expect(buy.price.raw).toBe("97.4200000000");
    expect(buy.amount.isNegative).toBe(true);
    expect(buy.id).toBe("0195f3a0-2222-7000-8000-000000000002");
  });

  it("maps a card transaction with its FX leg and MCC", () => {
    const domestic = only("card", 0);
    expect(domestic.international).toBe(false);
    expect(domestic.originalAmount).toBeNull();
    expect(domestic.mccCode).toBe("5812");

    const international = only("card", 1);
    expect(international.international).toBe(true);
    expect(international.originalAmount?.raw).toBe("-49.990000");
    expect(international.originalAmount?.currency).toBe("USD");
    expect(international.fxRate?.toFixed()).toBe("1.105123");
  });

  it("keeps tax separate from amount on interest and saveback", () => {
    expect(only("interest").amount.raw).toBe("2.410000");
    expect(only("interest").tax?.raw).toBe("-0.470000");
    expect(only("saveback").tax?.raw).toBe("-0.070000");
  });

  it("reads transfer direction from the type, not from the sign", () => {
    const inbound = only("transfer", 0);
    expect(inbound.direction).toBe("inbound");
    expect(inbound.instant).toBe(true);
    expect(inbound.counterpartyIban).toBe("ES9121000418450200051332");

    const outbound = only("transfer", 1);
    expect(outbound.direction).toBe("outbound");
    expect(outbound.counterpartyName).toBe("Example Recipient");
    expect(outbound.counterpartyIban).toBeNull();
  });

  it("signs money out negative and money in positive", () => {
    for (const movement of result.movements) {
      if (
        movement.kind === "unknown" ||
        movement.kind === "dividend" ||
        !movement.amount
      )
        continue;
      const outbound =
        movement.kind === "buy" ||
        movement.kind === "card" ||
        movement.kind === "direct-debit" ||
        (movement.kind === "transfer" && movement.direction === "outbound");
      expect(movement.amount.isNegative).toBe(outbound);
    }
  });

  it("maps a SELL with buy's shape but the file's own signs", () => {
    const sell = only("sell");
    expect(sell.isin).toBe("IE00EXAMPLE01");
    expect(sell.assetClass).toBe("FUND");
    expect(sell.shares.toFixed()).toBe("-0.5");
    expect(sell.amount.isNegative).toBe(false);
    expect(sell.price.raw).toBe("99.1000000000");
    expect(sell.fee?.raw).toBe("-0.99");
    expect(sell.id).toBe("0195f3a0-8888-7000-8000-000000000008");
  });

  it("maps a DIVIDEND, EUR instrument, without an FX leg", () => {
    const div = only("dividend", 0);
    expect(div.isin).toBe("ES0000000001");
    expect(div.shares.toFixed()).toBe("10");
    expect(div.amount.raw).toBe("4.560000");
    expect(div.tax?.raw).toBe("-0.680000");
    expect(div.originalAmount).toBeNull();
    expect(div.fxRate).toBeNull();
  });

  it("maps a DIVIDEND, non-EUR instrument, with its FX leg", () => {
    const div = only("dividend", 1);
    expect(div.isin).toBe("US0000000002");
    expect(div.amount.isNegative).toBe(false);
    expect(div.originalAmount?.raw).toBe("3.690000");
    expect(div.originalAmount?.currency).toBe("USD");
    expect(div.fxRate?.toFixed()).toBe("1.149532");
  });

  it("accepts a negative DIVIDEND amount without failing validation", () => {
    const div = only("dividend", 2);
    expect(div.amount.isNegative).toBe(true);
    expect(div.amount.raw).toBe("-0.010000");
    expect(() => dividendMovementSchema.parse(div)).not.toThrow();
  });

  it("maps a DIRECT_DEBIT as money out, with no direction field", () => {
    const dd = only("direct-debit");
    expect(dd.amount.raw).toBe("-29.990000");
    expect(dd.amount.isNegative).toBe(true);
    expect("direction" in dd).toBe(false);
    expect(dd.description).toMatch(/Example Streaming Service/);
  });
});

describe("precision", () => {
  it("never assumes a decimal count: CASH rows carry 6, TRADING rows 2", () => {
    expect(only("transfer", 0).amount.raw).toBe("500.000000");
    expect(only("buy").amount.raw).toBe("-120.26");
  });

  it("round-trips every amount back to the exact cell text", () => {
    for (const movement of result.movements) {
      expect(movement.amount?.raw ?? "").toBe(movement.raw.amount);
    }
  });

  it("parses both microsecond and millisecond timestamps", () => {
    expect(only("transfer", 0).datetime.toISOString()).toBe(
      "2026-04-01T08:12:33.123Z",
    );
    expect(only("buy").datetime.toISOString()).toBe("2026-04-02T09:15:02.123Z");
  });
});

function csvOf(...rows: Partial<Record<string, string>>[]): string {
  const header = CSV_COLUMNS.join(",");
  const lines = rows.map((row) =>
    CSV_COLUMNS.map((column) => `"${row[column] ?? ""}"`).join(","),
  );
  return [header, ...lines].join("\n") + "\n";
}

const goodInterest = {
  datetime: "2026-04-05T00:03:00.000123Z",
  category: "CASH",
  type: "INTEREST_PAYMENT",
  amount: "2.410000",
  currency: "EUR",
  transaction_id: "good-1",
};

describe("strict cells, tolerant pipeline", () => {
  it("turns an unreadable amount into an issue instead of throwing", () => {
    const bad = { ...goodInterest, amount: "1,50", transaction_id: "bad-1" };

    expect(() => classify({ ...emptyRow, ...bad })).toThrow(TypeError);

    const parsed = parseTransactionsCsv(csvOf(bad));
    expect(parsed.issues.map((i) => i.code)).toEqual(["invalid-row"]);
    expect(parsed.issues[0]?.message).toMatch(/1,50/);
    expect(parsed.movements).toEqual([]);
    expect(parsed.records.map((r) => r.transaction_id)).toEqual(["bad-1"]);
  });

  it("does the same for an unparseable timestamp", () => {
    const bad = { ...goodInterest, datetime: "not-a-date" };
    const parsed = parseTransactionsCsv(csvOf(bad));
    expect(parsed.issues.map((i) => i.code)).toEqual(["invalid-row"]);
    expect(parsed.movements).toEqual([]);
  });

  it("keeps every other row when one is unreadable", () => {
    const parsed = parseTransactionsCsv(
      csvOf(
        goodInterest,
        { ...goodInterest, amount: "1,50", transaction_id: "bad-1" },
        { ...goodInterest, transaction_id: "good-2" },
      ),
    );

    expect(parsed.records).toHaveLength(3);
    expect(parsed.movements).toHaveLength(2);
    expect(parsed.issues.map((i) => i.line)).toEqual([3]);
  });

  it("does not index-align records with movements", () => {
    const parsed = parseTransactionsCsv(
      csvOf({ ...goodInterest, amount: "1,50" }, { ...goodInterest }),
    );

    expect(parsed.records).toHaveLength(2);
    expect(parsed.movements).toHaveLength(1);
    expect(parsed.movements[0]?.raw).toBe(parsed.records[1]);
  });
});

describe("optional numeric cells", () => {
  it("returns null for an empty cell instead of throwing", () => {
    expect(maybeDecimal("")).toBeNull();
    expect(maybeDecimal("   ")).toBeNull();
    expect(decimal("1.105123").toFixed()).toBe("1.105123");
    expect(() => decimal("")).toThrow(TypeError);
  });

  it("classifies a domestic card row whose FX columns are empty", () => {
    const parsed = parseTransactionsCsv(
      csvOf({
        datetime: "2026-04-03T18:44:05.987654Z",
        category: "CASH",
        type: "CARD_TRANSACTION",
        name: "Example Coffee Bar",
        amount: "-12.750000",
        currency: "EUR",
        transaction_id: "card-1",
      }),
    );

    expect(parsed.issues).toEqual([]);
    const card = parsed.movements[0];
    expect(card?.kind).toBe("card");
    if (card?.kind !== "card") throw new Error("not a card movement");
    expect(card.fxRate).toBeNull();
    expect(card.originalAmount).toBeNull();
    expect(card.mccCode).toBeNull();
  });
});

describe("unknown rows", () => {
  it("keeps an unclassified type instead of dropping it", () => {
    const unknown = only("unknown");
    expect(unknown.category).toBe("CORPORATE_ACTION");
    expect(unknown.type).toBe("LIQUIDATION_PROCEEDS");
    expect(unknown.raw.symbol).toBe("IE00EXAMPLE99");
    expect(unknown.raw.shares).toBe("2.0000000000");
    expect(unknown.amount?.raw).toBe("2.00");
  });

  it("reports it as an issue without failing the parse", () => {
    const issues = result.issues.filter((i) => i.code === "unknown-type");
    expect(issues).toHaveLength(1);
    expect(issues[0]?.line).toBe(14);
  });

  it("can be taught a type by composing over the built-in classifier", () => {
    const extended = parseTransactionsCsv(csv, {
      classify: (row) => {
        if (
          row.category === "CORPORATE_ACTION" &&
          row.type === "LIQUIDATION_PROCEEDS"
        ) {
          return {
            ...classify(row),
            kind: "sell",
            isin: row.symbol,
            name: row.name,
            assetClass: row.asset_class,
            shares: decimal(row.shares),
            price: Money.parse(row.price, row.currency),
            amount: Money.parse(row.amount, row.currency),
          };
        }
        return classify(row);
      },
    });

    expect(extended.movements.map((m) => m.kind)).not.toContain("unknown");
    expect(extended.issues).toEqual([]);
  });

  it("reports header drift instead of throwing", () => {
    const drifted = parseTransactionsCsv(
      `${CSV_COLUMNS.join(",")},new_column\n${CSV_COLUMNS.map(() => "").join(",")},x\n`,
    );
    expect(drifted.issues.map((i) => i.code)).toContain("unknown-column");

    const short = parseTransactionsCsv(
      'datetime,category,type,amount\n"2026-04-01T00:00:00Z","CASH","INTEREST_PAYMENT","1.000000"\n',
    );
    expect(short.issues.map((i) => i.code)).toContain("missing-column");
    expect(short.movements.map((m) => m.kind)).toEqual(["interest"]);
  });
});
