import { z } from "zod";

export type PartialDate = {
  value: string;
  precision: "year" | "month" | "day";
};

function daysInMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function isValidPartialDate(date: PartialDate): boolean {
  const patterns = { year: /^\d{4}$/, month: /^\d{4}-\d{2}$/, day: /^\d{4}-\d{2}-\d{2}$/ };
  if (!patterns[date.precision].test(date.value)) return false;
  const [year, month, day] = date.value.split("-").map(Number);
  if (year < 1 || year > 9999) return false;
  if (date.precision === "year") return true;
  if (month < 1 || month > 12) return false;
  return date.precision === "month" || (day >= 1 && day <= daysInMonth(year, month));
}

export const partialDateSchema = z.strictObject({
  value: z.string(), precision: z.enum(["year", "month", "day"]),
}).refine(isValidPartialDate, "Invalid Gregorian date or precision");

// Numeric bounds are only for validation; never replace the stored partial date.
function bound(date: PartialDate, end: boolean): number {
  const [year, month, day] = date.value.split("-").map(Number);
  const m = date.precision === "year" ? (end ? 12 : 1) : month;
  const d = date.precision === "day" ? day : (end ? daysInMonth(year, m) : 1);
  return year * 10000 + m * 100 + d;
}

export const periodSchema = z.strictObject({
  from: partialDateSchema.nullable(), to: partialDateSchema.nullable(),
}).refine(({ from, to }) => !from || !to || bound(from, false) <= bound(to, true),
  "Period starts definitely after its end");

export const accessedAtSchema = z.string().refine(
  (value) => isValidPartialDate({ value, precision: "day" }), "Invalid access date",
).nullable();

export function dateProperties(prefix: string, date: PartialDate | null) {
  return { [`${prefix}Value`]: date?.value ?? null, [`${prefix}Precision`]: date?.precision ?? null };
}
