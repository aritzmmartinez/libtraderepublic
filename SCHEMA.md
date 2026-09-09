# Trade Republic transaction CSV — schema notes

What this document is: the file format as observed, with each claim tagged by
how it is known. **Verified** = seen in a real export. **Reported** = seen by
another parser running against a larger real export (Quoin's production Trade
Republic adapter, ~515 rows), but not re-checked here cell by cell.
**Expected** = a reasonable guess, never assumed by the code.

Trade Republic launched this official export in April 2026 and it may still
change. Nothing here is a specification — it is a field report.

## File shape (verified)

- Separator: comma. Fields wrapped in double quotes.
- Decimal separator: `.` — the file is **not** localised by account language.
- Dates: ISO 8601, UTC.
- One header row, 23 columns.

## Columns (23, verified)

| #  | Column               | Description                                       | Notes |
|----|----------------------|---------------------------------------------------|-------|
| 1  | `datetime`           | Timestamp, ISO 8601 UTC                           | Precision is inconsistent: microseconds on CASH rows, milliseconds on TRADING rows. Do not assume a fixed length. |
| 2  | `date`               | `YYYY-MM-DD`                                      | Redundant with `datetime`, same day. |
| 3  | `account_type`       | Only `DEFAULT` observed                           | Other values not confirmed. |
| 4  | `category`           | `CASH` or `TRADING`                               | Top-level partition. `CORPORATE_ACTION` also observed (2 rows in the reference export), not modelled yet — falls through to `unknown`. |
| 5  | `type`               | `ALL_CAPS_SNAKE_CASE` enum, English, not localised | See the type lists below. |
| 6  | `asset_class`        | Empty on CASH; `FUND` observed on TRADING          | `STOCK`, `CRYPTO`, `SYNTHETIC` reported (a physical-gold ETC shows up as `SYNTHETIC`). |
| 7  | `name`               | Merchant/counterparty (CASH) or instrument name (TRADING) | |
| 8  | `symbol`             | ISIN, TRADING only                                 | Empty on CASH. |
| 9  | `shares`             | Quantity, 10 decimals, TRADING only                | |
| 10 | `price`              | Unit price, 10 decimals, TRADING only              | |
| 11 | `amount`             | Signed net amount, in `currency`                   | **Precision is inconsistent: 6 decimals on CASH, 2 on TRADING. Parse as an arbitrary-precision string; never assume a decimal count.** |
| 12 | `fee`                | Commission                                         | Empty across the whole sample except `SELL` (17 of 22 rows carry a value). |
| 13 | `tax`                | Withholding, negative                              | Reported separately from `amount`, never folded in. Seen on `INTEREST_PAYMENT`, `BENEFITS_SAVEBACK`, `DIVIDEND` (31 of 34 rows), and also `TRADING\|BUY` (13 of 226 rows) — the field is common to every kind, so this changes no model. |
| 14 | `currency`           | Settlement currency                                | `EUR` across the whole sample. |
| 15 | `original_amount`    | Pre-FX amount                                      | On foreign-currency card transactions, and on dividends from non-EUR instruments. When present, columns 15–17 come filled together. |
| 16 | `original_currency`  | Original currency                                  | e.g. `USD`. |
| 17 | `fx_rate`            | Applied rate, 6 decimals                           | |
| 18 | `description`        | Free-text, human readable                          | Contains order/reservation IDs. |
| 19 | `transaction_id`     | UUIDv7 (time-sortable)                             | Good deduplication key. |
| 20 | `counterparty_name`  | Counterparty on transfers                          | |
| 21 | `counterparty_iban`  | Counterparty IBAN                                  | Seen only on an inbound transfer in the sample — unconfirmed whether outbound rows carry it. |
| 22 | `payment_reference`  | SEPA payment reference                             | Empty across the whole sample. |
| 23 | `mcc_code`           | Merchant category code (ISO 18245)                 | Card transactions only. |

## Sign convention (verified)

Money out is negative (buys, fees, card payments, outgoing transfers, direct
debits). Money in is positive (interest, incoming transfers, saveback, sell
proceeds). The side never has to be inferred from the description.

Two documented exceptions where the sign is not fixed:

- `CARD_TRANSACTION` is usually negative but can be positive (3 of 167 rows in
  the reference export) — a refund. Do not assume a card amount is money out.
- `DIVIDEND` is usually positive but can be negative (4 of 34 rows) — all seen
  are tiny non-EUR dividends where withholding plus FX rounding leaves the net
  below zero. It is not a distinct event, just a valid field combination.

`TRANSFER_DIRECT_DEBIT_INBOUND` is always negative despite the `_INBOUND` in its
name — a direct debit charges you. This is why the library models it as its own
`direct-debit` kind rather than a `transfer` with a derived `direction`.

## `type` values — verified in a real export

`BUY`, `SELL`, `CARD_TRANSACTION`, `CARD_TRANSACTION_INTERNATIONAL`,
`TRANSFER_INSTANT_INBOUND`, `TRANSFER_INSTANT_OUTBOUND`,
`TRANSFER_DIRECT_DEBIT_INBOUND`, `INTEREST_PAYMENT`, `DIVIDEND`,
`BENEFITS_SAVEBACK`

These are the ten this library classifies today. `SELL`, `DIVIDEND` and
`TRANSFER_DIRECT_DEBIT_INBOUND` were promoted in 0.2.0 after verification
against a one-year real export (562 rows) — see the shape tables below.

### `SELL` (verified, 22 rows)

Same columns as `BUY` (`symbol`, `name`, `asset_class`, `shares`, `price` all
filled), with the file's own signs, not inferred:

| Column | In `SELL` | vs `BUY` |
|--------|-----------|----------|
| `shares` | always negative | positive |
| `amount` | always positive | negative |
| `fee` | optional, 17 of 22 rows carry a value | empty in the sample |
| `tax` | empty in all 22 rows | — |
| `datetime` | 3-digit fraction in 100% of rows | some `BUY` rows have no fraction |

### `DIVIDEND` (verified, 34 rows)

| Column | In `DIVIDEND` |
|--------|---------------|
| `shares` | always filled, always positive |
| `price` | always empty |
| `tax` | optional, 31 of 34 rows — withholding when it applies |
| `amount` | **no fixed sign** — 4 of 34 rows negative (see Sign convention) |
| `original_amount` / `original_currency` / `fx_rate` | filled together iff the instrument trades in a non-EUR currency; absent for EUR-native instruments. Same "FX only if it applies" rule as `card`. |

### `TRANSFER_DIRECT_DEBIT_INBOUND` (verified, 12 rows)

| Column | In `TRANSFER_DIRECT_DEBIT_INBOUND` |
|--------|-----------------------------------|
| `amount` | always negative — a direct debit charges you |
| `name`, `asset_class`, `symbol`, `shares`, `price` | always empty |
| `counterparty_name`, `counterparty_iban` | empty in the sample — unlike `transfer`, which fills them for instant transfers. The creditor appears only inside `description` as free text. |

Modelled as its own `direct-debit` kind, not a `transfer`: forcing it into
`transfer` would derive `direction: "inbound"` on a row where money leaves.
There is no `direction` field — it is always money out.

## `type` values — reported by another parser, not verified here

Handled by Quoin's Trade Republic adapter against a ~515-row real export, so
it very likely exists, but its column layout has not been checked cell by cell
for this library:

`CUSTOMER_INPAYMENT`

It was not observed at all in the one-year, 562-row export verified for 0.2.0 —
it may be specific to another account type or an older export. It classifies as
`unknown` here — with the whole row attached — rather than being mapped on a
guess. Promoting it is a small change: add the `category|type` case in
`src/classifiers/index.ts` and a fixture row, once someone can confirm the
row's shape.

(`TRANSFER_INBOUND` was also on this list; it did appear in the 0.2.0 export,
twice — see the next section.)

## `type` values — seen in the real export but not modelled yet

Present in the one-year export but at a volume too low to commit to a shape with
the same discipline the project applied to the single-row types it did model.
They stay `unknown` via the general fallback:

| `category\|type` | rows |
|------------------|------|
| `CASH\|TRANSFER_INBOUND` | 2 |
| `CORPORATE_ACTION\|PRIVATE_MARKET_BUY` | 1 |
| `CORPORATE_ACTION\|LIQUIDATION_PROCEEDS` | 1 |
| `CORPORATE_ACTION\|LIQUIDATION_DIVIDEND` | 1 |
| `CORPORATE_ACTION\|INTERMEDIATE_SECURITIES_DISTRIBUTION` | 1 |

`CORPORATE_ACTION` is not modelled as a category of its own yet; both its rows
fall through the general `unknown` fallback. Revisit when more real volume
appears, with the same process: check filled/empty columns, check the sign
convention, and only then promote.

## `type` values — expected, unobserved anywhere

An explicit tax-withholding type, a standard (non-instant) SEPA deposit and
withdrawal, and something like `SAVINGS_PLAN_EXECUTION`.

## Known limitation: savings plans are indistinguishable

In the sample, a recurring savings-plan purchase is written as an ordinary
`type=BUY`. The only signal that it was a DCA execution rather than a manual
order is the free text in `description`. There is no structured field for it, so
this library does not classify it — inferring it from prose would be a guess
dressed up as data.

## Why there is no dialect layer

`type` is a machine identifier in fixed English. It does not change with the
account's language setting, so there is no header-language detection and no
localised-label normalisation to do — the entire "unknown" surface is a `type`
this version has not been taught yet, which is exactly what the `unknown`
movement kind is for.

## Format version

Schema first verified against a real export downloaded in April 2026, then
re-checked for 0.2.0 against a one-year export of 562 rows. Trade Republic's
official CSV export launched April 2026 and may still evolve; this document
reflects the format as of that date.
