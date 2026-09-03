import { Decimal } from "decimal.js";

export class Money {
  readonly value: Decimal;

  private constructor(
    readonly raw: string,
    readonly currency: string,
  ) {
    this.value = new Decimal(raw);
  }

  static parse(raw: string, currency: string): Money {
    const trimmed = raw.trim();
    if (trimmed === "" || !isFinite(Number(trimmed))) {
      throw new TypeError(`Not a numeric amount: ${JSON.stringify(raw)}`);
    }
    return new Money(trimmed, currency);
  }

  static maybe(raw: string, currency: string): Money | null {
    return raw.trim() === "" ? null : Money.parse(raw, currency);
  }

  get isNegative(): boolean {
    return this.value.isNegative();
  }

  abs(): Money {
    return new Money(this.value.abs().toFixed(), this.currency);
  }

  toString(): string {
    return this.raw;
  }

  toJSON(): { amount: string; currency: string } {
    return { amount: this.raw, currency: this.currency };
  }
}

export function decimal(raw: string): Decimal {
  const trimmed = raw.trim();
  if (trimmed === "" || !isFinite(Number(trimmed))) {
    throw new TypeError(`Not a numeric value: ${JSON.stringify(raw)}`);
  }
  return new Decimal(trimmed);
}

export function maybeDecimal(raw: string): Decimal | null {
  return raw.trim() === "" ? null : decimal(raw);
}

export { Decimal };
