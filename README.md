<h1 align="center">libtraderepublic</h1>

<p align="center">
  Parse Trade Republic's official <strong>transaction CSV export</strong> into a typed, extensible domain model.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/libtraderepublic"><img src="https://img.shields.io/npm/v/libtraderepublic?logo=npm&logoColor=white&color=cb3837" alt="npm version"></a>
  <a href="https://github.com/aritzmmartinez/libtraderepublic/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/aritzmmartinez/libtraderepublic/ci.yml?branch=main&logo=github&label=CI" alt="CI status"></a>
  <a href="https://www.npmjs.com/package/libtraderepublic"><img src="https://img.shields.io/npm/types/libtraderepublic?logo=typescript&logoColor=white" alt="TypeScript types included"></a>
  <a href="LICENSE"><img src="https://img.shields.io/npm/l/libtraderepublic?color=blue" alt="MIT licence"></a>
</p>

<p align="center">
  <a href="#install">Install</a>
  ·
  <a href="#quick-start">Quick start</a>
  ·
  <a href="#the-result">The result</a>
  ·
  <a href="#domain-model">Domain model</a>
  ·
  <a href="#extensibility">Extensibility</a>
  ·
  <a href="SCHEMA.md">Schema notes</a>
</p>

---

> **libtraderepublic** is an independent, community-maintained project. It is
> **not affiliated with, endorsed by, or officially supported by Trade Republic
> Bank GmbH**. It parses the transaction CSV that Trade Republic itself lets
> you export from your own account — no login, no scraping, no access to your
> credentials or account.

Trade Republic launched an official transaction CSV export in April 2026. This
library turns that file into typed movements, and nothing else: you download the
CSV by hand from the app, you hand it the text.

- **Exact money.** Amounts are `decimal.js` under a `Money` wrapper, built only
  from the raw cell text. Never a JavaScript `number`.
- **No assumed precision.** The file writes 6 decimals on cash rows and 2 on
  trading rows; `amount.raw` is the exact cell, byte for byte.
- **Typed model.** A discriminated union on `kind`, so an added movement type
  breaks every incomplete `switch` at compile time.
- **Lenient parsing.** A row with a `type` this version does not know becomes an
  `unknown` movement with the whole row attached. Nothing is ever dropped.
- **Header drift is data, not a crash.** A new or missing column is reported in
  `issues`; the other 22 still parse.
- **Extensible.** Teach the parser a new type by composing over the built-in
  classifier — no fork, no patch.
- **Isomorphic.** The main entry point imports no `node:` builtins; it runs in a
  browser, a worker or a Node process.
- **No dialects needed.** Trade Republic's `type` column is a machine
  identifier in fixed English, not a localised label — see
  [why](#why-there-is-no-dialect-layer).

## Install

```sh
pnpm add libtraderepublic
npm install libtraderepublic
yarn add libtraderepublic
```

ESM only. There is no CommonJS build; use `import`, not `require`.

| Import                  | Contents                                             | Requires |
|-------------------------|------------------------------------------------------|----------|
| `libtraderepublic`      | Parser, schema, classifiers, `Money`, all types       | Nothing — isomorphic |
| `libtraderepublic/node` | The above, plus `parseTransactionsFile`               | Node ≥ 20 (`node:fs/promises`) |

### Entry points

The split exists so a browser bundle never pulls a Node builtin in. Everything
in `libtraderepublic` takes CSV *text*: where that text came from — a `<input
type="file">`, a `fetch`, a database column — is your problem, not the library's.
`libtraderepublic/node` re-exports the whole isomorphic API and adds a single
convenience that reads from disk, so a Node consumer only ever needs the one
import.

## Quick start

```ts
import { parseTransactionsCsv } from "libtraderepublic";

const { records, movements, issues } = parseTransactionsCsv(csvText);

console.log(`${records.length} rows, ${issues.length} issues`);

for (const movement of movements) {
  switch (movement.kind) {
    case "buy":
      console.log(movement.isin, movement.shares.toFixed(), movement.amount.raw);
      break;
    case "card":
      console.log(movement.merchant, movement.originalAmount?.currency ?? "EUR");
      break;
    case "transfer":
      console.log(movement.direction, movement.counterpartyName);
      break;
    case "interest":
    case "saveback":
      console.log(movement.amount.raw, "tax:", movement.tax?.raw ?? "none");
      break;
    case "unknown":
      // Never dropped. `movement.raw` is the whole row.
      console.log("unclassified:", movement.category, movement.type);
      break;
  }
}
```

### From a file (Node)

```ts
import { parseTransactionsFile } from "libtraderepublic/node";

const result = await parseTransactionsFile("./transactions.csv");
```

### Getting the file

In the Trade Republic app: your profile → transactions → export. You get one CSV,
and that is the only input this library takes.

The menu labels above are given in English for readability; they were followed in
a non-English account, so the exact English wording is unverified — the same
verified/unverified distinction this project applies to the `type` values.

## The result

```ts
interface ParseResult {
  records: RawRow[];
  movements: Movement[];
  issues: Issue[];
}
```

| Field       | Contents |
|-------------|----------|
| `records`   | Every row that validated as 23 string cells, in file order, untouched apart from trimming. |
| `movements` | One typed movement per record, in the same order. Unrecognised rows are `kind: "unknown"`, not gaps. A record whose cells could not be read has no movement, so `movements` can be shorter than `records` — do not index one by the other. |
| `issues`    | Everything worth telling you about. Never fatal on its own. |

Parsing is lenient on purpose. `parseTransactionsCsv` does not throw on a row it
cannot make sense of, because a broker export is a historical record: losing one
line silently is worse than reporting it and carrying on. The only thing that
can remove a row from `movements` is a cell that cannot be read at all (a
non-numeric amount on a recognised type, an unparseable timestamp) — and that
row is still in `records` and in `issues`, with its original cells.

**Strict pieces, tolerant pipeline.** The primitives *do* throw:
`Money.parse("1,5", "EUR")` is a `TypeError`, and so is a `datetime` that is not
ISO 8601. That is deliberate — a bad amount must never turn into a silent zero.
`parseTransactionsCsv` catches those throws per row and records them as
`invalid-row`, so strictness at the cell level never costs you the other 514
rows. `classify` called directly is the strict layer, and will throw; the parser
is the tolerant one.

| `Issue.code`     | Means |
|------------------|-------|
| `unknown-type`   | A `category\|type` pair this version does not classify. The movement is in `movements` as `unknown`. |
| `invalid-row`    | The row could not be read as 23 cells, or a recognised type had an unusable cell. |
| `unknown-column` | The header carries a column this version does not know — the export format may have moved. |
| `missing-column` | A column this version expects is absent from the header. |
| `malformed-csv`  | The CSV reader could not parse the line at all. |

## Supported types

`category` + `type` is the discriminator. Seven pairs are classified today:

| `category\|type`                       | `Movement["kind"]` | Status |
|----------------------------------------|--------------------|--------|
| `TRADING\|BUY`                          | `buy`              | Verified |
| `CASH\|CARD_TRANSACTION`                | `card`             | Verified |
| `CASH\|CARD_TRANSACTION_INTERNATIONAL`  | `card`             | Verified |
| `CASH\|TRANSFER_INSTANT_INBOUND`        | `transfer`         | Verified |
| `CASH\|TRANSFER_INSTANT_OUTBOUND`       | `transfer`         | Verified |
| `CASH\|INTEREST_PAYMENT`                | `interest`         | Verified |
| `CASH\|BENEFITS_SAVEBACK`               | `saveback`         | Verified |
| anything else                           | `unknown`          | — |

`SELL`, dividends, `CUSTOMER_INPAYMENT` and the non-instant SEPA transfer types
are *reported* by another parser running against a larger real export, but their
column layout has not been checked cell by cell here, so they classify as
`unknown` rather than being mapped on a guess. Promoting one is a two-line change
plus a fixture row — see [SCHEMA.md](./SCHEMA.md), or use a
[custom classifier](#a-custom-classifier) today without waiting for a release.

### Why there is no dialect layer

Broker exports usually need one: when a file writes human-readable labels, the
same event reads differently depending on the account's language, and the parser
has to work out which localisation it is looking at before it can classify
anything.

Trade Republic's does not. `type` is `ALL_CAPS_SNAKE_CASE` in fixed English and
does not follow the account's language setting, and the decimal separator is
always `.`. There is no header-language detection and no label normalisation to
do here. The entire "unknown" surface is one thing: a `type` this version has not
been taught yet — which is exactly what the `unknown` kind is for.

## Domain model

### Movements

One movement per CSV row, discriminated on `kind`:

- `buy` — instrument purchase, with `isin`, `name`, `assetClass`, `shares`, `price`
- `card` — card payment, with `merchant`, `international`, `originalAmount`, `fxRate`, `mccCode`
- `transfer` — SEPA movement, with `direction`, `instant`, `counterpartyName`, `counterpartyIban`, `paymentReference`
- `interest` — interest payment, with withholding in `tax`
- `saveback` — Trade Republic's card-spending rebate, with withholding in `tax`
- `unknown` — anything else, with `category`, `type`, and the whole row in `raw`

Every movement carries `id` (the export's UUIDv7 `transaction_id`, a good
deduplication key), `datetime`, `amount`, `fee`, `tax`, `description` and `raw`.

The union is exhaustive, so this is checked at compile time:

```ts
function label(movement: Movement): string {
  switch (movement.kind) {
    case "buy":      return `Bought ${movement.shares.toFixed()} × ${movement.name}`;
    case "card":     return `Card: ${movement.merchant}`;
    case "transfer": return `Transfer ${movement.direction}`;
    case "interest": return "Interest";
    case "saveback": return "Saveback";
    case "unknown":  return `Unclassified ${movement.type}`;
    // Add a kind and TypeScript points at this function.
  }
}
```

Amounts keep the file's sign: money out is negative (buys, card payments,
outgoing transfers), money in is positive (interest, saveback, incoming
transfers). The side never has to be inferred from the description.

### Transactions

Not yet. Grouping related rows into composite transactions (a trade and its fee,
a dividend and its withholding) is a v2 question, and one worth answering against
more real exports than the sample this schema was verified on. Today the library
gives you rows as movements, faithfully, and leaves the grouping to you.

## Money

`Money` exists to make one class of bug impossible: a broker amount held in a
JavaScript `number`.

```ts
import { Money, decimal, maybeDecimal } from "libtraderepublic";

const amount = Money.parse("-120.26", "EUR");

amount.raw;          // "-120.26" — exactly what the cell said
amount.value;        // Decimal, for arithmetic
amount.currency;     // "EUR"
amount.isNegative;   // true
amount.abs().raw;    // "120.26"
amount.toJSON();     // { amount: "-120.26", currency: "EUR" }

Money.maybe("", "EUR");   // null — the empty cell TR writes when a column does not apply
Money.parse("1,5", "EUR"); // throws: the export is not localised, a comma is a bug

decimal("1.2345678900");    // Decimal, for the non-currency columns (shares, fx_rate)
maybeDecimal("");           // null, same empty-cell rule as Money.maybe
```

### `decimal()` vs `Decimal`

Both are exported and they are not interchangeable:

- **`decimal(text)`** is the one to use on CSV cells. It rejects an empty or
  non-numeric string with a `TypeError` instead of producing `NaN`, so a bad
  `shares` cell becomes an `invalid-row` issue rather than a quantity nobody
  can trust. `maybeDecimal(text)` is the same check, returning `null` for the
  empty cell.
- **`Decimal`** is the `decimal.js` class itself, re-exported so you can do
  arithmetic on `movement.shares` or `amount.value`, write an `instanceof`
  check, or configure the library's precision — without adding `decimal.js` to
  your own dependencies and risking a second copy.

Rule of thumb: text from the file goes through `decimal()`; values already
parsed by this library are `Decimal` and you use it directly.

There is no public constructor: a `Money` can only come from the CSV text via
`Money.parse`. `toString()` returns `raw`, so an amount round-trips back to the
file byte for byte — which matters, because Trade Republic writes `500.000000`
in a cash row and `-120.26` in a trading row and neither count is safe to assume.

Arithmetic lives on `.value`, deliberately: summing money is a portfolio
question, not a parsing one.

## Extensibility

### A custom classifier

`parseTransactionsCsv` takes a classifier. Compose over the built-in one and
anything you do not handle falls through to the default — including, still, the
`unknown` fallback:

```ts
import { classify, parseTransactionsCsv, Money, decimal } from "libtraderepublic";
import type { Movement, RawRow } from "libtraderepublic";

function classifyWithSell(row: RawRow): Movement {
  if (row.category === "TRADING" && row.type === "SELL") {
    return {
      ...classify(row), // id, datetime, fee, tax, description, raw
      kind: "buy",      // your model's sell shape
      isin: row.symbol,
      name: row.name,
      assetClass: row.asset_class,
      shares: decimal(row.shares),
      price: Money.parse(row.price, row.currency),
      amount: Money.parse(row.amount, row.currency),
    };
  }
  return classify(row);
}

const result = parseTransactionsCsv(csvText, { classify: classifyWithSell });
```

This is the supported way to run ahead of the library: you get a type mapped
today, and when it lands upstream you delete your wrapper.

### Reading the raw row

Every movement — `unknown` included — carries `raw`, the validated row. Nothing
in the CSV is unreachable because the classifier did not model it yet:

```ts
for (const movement of result.movements) {
  if (movement.kind === "unknown") {
    console.log(movement.type, movement.raw.symbol, movement.raw.shares);
  }
}
```

### Validating your own shapes

The Zod schemas are exported, so a consumer's own boundary can reuse them
instead of redeclaring the format:

```ts
import { rawRowSchema, movementSchema, CSV_COLUMNS } from "libtraderepublic";
```

Zod is the single source of truth here — every TypeScript type in this library is
`z.infer` of a schema, never a hand-written twin that can drift from it.

## Notes & caveats

- **Timestamps.** `datetime` is UTC, with microseconds on cash rows and
  milliseconds on trading rows. `Date` only specifies three fractional digits, so
  the fraction is truncated before parsing; the full original string stays in
  `raw.datetime`.
- **Savings plans are indistinguishable.** A recurring savings-plan purchase is
  written as an ordinary `type=BUY`. The only signal is prose in `description`.
  This library does not infer it — a guess dressed up as a field is worse than an
  absent field.
- **Row order is file order.** `movements` follows `records`, but a row that
  failed to classify has no movement, so the two arrays are not index-aligned —
  match them on `movement.raw` or `movement.id`, never on position. The
  export is roughly chronological, but nothing here re-sorts it.
- **Format stability.** The schema was verified against a real export downloaded
  in April 2026, the month the export launched. It may still evolve — that is why
  header drift is an `issue` and not an exception.
- **Dependencies.** `decimal.js`, `papaparse`, `zod`. Nothing else.

## Development

```sh
pnpm install
pnpm test
pnpm run verify   # lint + typecheck + build + test
```

The test fixture at `test/fixtures/transactions.csv` is entirely **synthetic**:
invented ISINs, invented amounts, invented counterparties, one row per verified
type plus one deliberately unrecognised row. No real export, and no real
portfolio data, is in this repository or ever should be. It also pins the
inconsistent-precision case (6 decimals on cash, 2 on trading) as an invariant,
so a future refactor cannot quietly normalise amounts.

Hit a `type` this library reports as `unknown`? Open an issue with the
`category|type` pair and a **synthetic** row showing the column layout. Please
never paste a real export.

## Licence

MIT — see [LICENSE](./LICENSE).
