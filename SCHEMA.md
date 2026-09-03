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
| 4  | `category`           | `CASH` or `TRADING`                               | Top-level partition. |
| 5  | `type`               | `ALL_CAPS_SNAKE_CASE` enum, English, not localised | See the type lists below. |
| 6  | `asset_class`        | Empty on CASH; `FUND` observed on TRADING          | `STOCK`, `CRYPTO`, `SYNTHETIC` reported (a physical-gold ETC shows up as `SYNTHETIC`). |
| 7  | `name`               | Merchant/counterparty (CASH) or instrument name (TRADING) | |
| 8  | `symbol`             | ISIN, TRADING only                                 | Empty on CASH. |
| 9  | `shares`             | Quantity, 10 decimals, TRADING only                | |
| 10 | `price`              | Unit price, 10 decimals, TRADING only              | |
| 11 | `amount`             | Signed net amount, in `currency`                   | **Precision is inconsistent: 6 decimals on CASH, 2 on TRADING. Parse as an arbitrary-precision string; never assume a decimal count.** |
| 12 | `fee`                | Commission                                         | Empty across the whole sample. |
| 13 | `tax`                | Withholding, negative                              | Seen on `INTEREST_PAYMENT` and `BENEFITS_SAVEBACK`, reported separately from `amount`. |
| 14 | `currency`           | Settlement currency                                | `EUR` across the whole sample. |
| 15 | `original_amount`    | Pre-FX amount                                      | Only on foreign-currency card transactions. |
| 16 | `original_currency`  | Original currency                                  | e.g. `USD`. |
| 17 | `fx_rate`            | Applied rate, 6 decimals                           | |
| 18 | `description`        | Free-text, human readable                          | Contains order/reservation IDs. |
| 19 | `transaction_id`     | UUIDv7 (time-sortable)                             | Good deduplication key. |
| 20 | `counterparty_name`  | Counterparty on transfers                          | |
| 21 | `counterparty_iban`  | Counterparty IBAN                                  | Seen only on an inbound transfer in the sample — unconfirmed whether outbound rows carry it. |
| 22 | `payment_reference`  | SEPA payment reference                             | Empty across the whole sample. |
| 23 | `mcc_code`           | Merchant category code (ISO 18245)                 | Card transactions only. |

## Sign convention (verified)

Money out is negative (buys, fees, card payments, outgoing transfers). Money in
is positive (dividends, interest, incoming transfers, saveback). The side never
has to be inferred from the description.

## `type` values — verified in a real export

`BUY`, `CARD_TRANSACTION`, `CARD_TRANSACTION_INTERNATIONAL`,
`TRANSFER_INSTANT_INBOUND`, `TRANSFER_INSTANT_OUTBOUND`, `INTEREST_PAYMENT`,
`BENEFITS_SAVEBACK`

These are the seven this library classifies today.

## `type` values — reported by another parser, not verified here

Handled by Quoin's Trade Republic adapter against a ~515-row real export, so
they very likely exist, but their column layout has not been checked cell by
cell for this library:

`SELL`, `DIVIDEND`, `CUSTOMER_INPAYMENT`, `TRANSFER_INBOUND`,
`TRANSFER_DIRECT_DEBIT_INBOUND`

They currently classify as `unknown` here — with the whole row attached — rather
than being mapped on a guess. Promoting one is a small change: add the
`category|type` case in `src/classifiers/index.ts` and a fixture row. Do it when
someone can confirm the row's shape.

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

Schema verified against a real export downloaded in April 2026. Trade Republic's
official CSV export launched April 2026 and may still evolve; this document
reflects the format as of that date.
