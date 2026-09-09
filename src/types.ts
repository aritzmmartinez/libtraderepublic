import { z } from "zod";

import { Decimal, Money } from "./money.js";
import { rawRowSchema } from "./schema.js";

const money = () =>
  z.custom<Money>((value) => value instanceof Money, {
    message: "Expected a Money",
  });
const dec = () =>
  z.custom<Decimal>((value) => value instanceof Decimal, {
    message: "Expected a Decimal",
  });

const movementBase = z.object({
  id: z.string(),
  datetime: z.date(),
  amount: money(),
  fee: money().nullable(),
  tax: money().nullable(),
  description: z.string(),
  raw: rawRowSchema,
});

export const buyMovementSchema = movementBase.extend({
  kind: z.literal("buy"),
  isin: z.string(),
  name: z.string(),
  assetClass: z.string(),
  shares: dec(),
  price: money(),
});

export const sellMovementSchema = movementBase.extend({
  kind: z.literal("sell"),
  isin: z.string(),
  name: z.string(),
  assetClass: z.string(),
  shares: dec(),
  price: money(),
});

export const dividendMovementSchema = movementBase.extend({
  kind: z.literal("dividend"),
  isin: z.string(),
  name: z.string(),
  assetClass: z.string(),
  shares: dec(),
  originalAmount: money().nullable(),
  fxRate: dec().nullable(),
});

export const directDebitMovementSchema = movementBase.extend({
  kind: z.literal("direct-debit"),
});

export const cardMovementSchema = movementBase.extend({
  kind: z.literal("card"),
  merchant: z.string(),
  international: z.boolean(),
  originalAmount: money().nullable(),
  fxRate: dec().nullable(),
  mccCode: z.string().nullable(),
});

export const transferMovementSchema = movementBase.extend({
  kind: z.literal("transfer"),
  direction: z.enum(["inbound", "outbound"]),
  instant: z.boolean(),
  counterpartyName: z.string().nullable(),
  counterpartyIban: z.string().nullable(),
  paymentReference: z.string().nullable(),
});

export const interestMovementSchema = movementBase.extend({
  kind: z.literal("interest"),
});

export const savebackMovementSchema = movementBase.extend({
  kind: z.literal("saveback"),
});

export const unknownMovementSchema = movementBase.extend({
  kind: z.literal("unknown"),
  amount: money().nullable(),
  category: z.string(),
  type: z.string(),
});

export const movementSchema = z.discriminatedUnion("kind", [
  buyMovementSchema,
  sellMovementSchema,
  dividendMovementSchema,
  directDebitMovementSchema,
  cardMovementSchema,
  transferMovementSchema,
  interestMovementSchema,
  savebackMovementSchema,
  unknownMovementSchema,
]);

export type BuyMovement = z.infer<typeof buyMovementSchema>;
export type SellMovement = z.infer<typeof sellMovementSchema>;
export type DividendMovement = z.infer<typeof dividendMovementSchema>;
export type DirectDebitMovement = z.infer<typeof directDebitMovementSchema>;
export type CardMovement = z.infer<typeof cardMovementSchema>;
export type TransferMovement = z.infer<typeof transferMovementSchema>;
export type InterestMovement = z.infer<typeof interestMovementSchema>;
export type SavebackMovement = z.infer<typeof savebackMovementSchema>;
export type UnknownMovement = z.infer<typeof unknownMovementSchema>;
export type Movement = z.infer<typeof movementSchema>;
export type MovementKind = Movement["kind"];

export type Issue =
  | { code: "invalid-row"; line: number; message: string; raw: unknown }
  | { code: "unknown-type"; line: number; message: string; raw: unknown }
  | { code: "unknown-column"; line: number; message: string; raw: unknown }
  | { code: "missing-column"; line: number; message: string; raw: unknown }
  | { code: "malformed-csv"; line: number; message: string; raw: unknown };
