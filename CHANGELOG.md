# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0]

### Added

- Classifiers for three more verified types: sell, dividend, direct-debit.
- Verified against a one-year real export (562 rows): 22 sell, 34 dividend, 12 direct-debit.
- sell mirrors buy's shape, with the file's own signs (shares negative, amount positive).
- dividend includes an FX leg only when the instrument isn't EUR-native, same rule as card. Amount has no fixed sign.
- direct-debit is its own kind, not a transfer — the file calls it inbound but the amount is always negative.
- Fixture rows for each new type, including a negative dividend and an unclassified corporate action row.
- SCHEMA.md updated: three types moved to verified, CORPORATE_ACTION noted as an observed category, real counts added for the remaining unverified types.

## [0.1.0]

### Added

- Parser for Trade Republic's official transaction CSV export.
- Zod schema for the 23 columns, all validated as strings.
- Money, a decimal.js wrapper built from raw cell text — keeps the file's inconsistent decimal count (6 on cash rows, 2 on trading rows) intact.
- Classifiers for seven verified types: buy, card, card international, transfer in, transfer out, interest, saveback.
- Unknown fallback — any other row keeps its full data and shows up in issues instead of being dropped.
- Node entry point for reading a file from disk; the main entry point stays isomorphic.
- Custom classifier support, to teach the parser a new type without forking.
- CI running pnpm verify on push and PR.
- SCHEMA.md, with every claim marked verified, reported, or expected.


[Unreleased]: https://github.com/aritzmmartinez/libtraderepublic/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/aritzmmartinez/libtraderepublic/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/aritzmmartinez/libtraderepublic/releases/tag/v0.1.0