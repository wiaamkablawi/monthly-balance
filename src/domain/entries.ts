import type { EntryDoc } from "../types/models";
import { monthKeyFromISO, todayISO } from "../utils/dates";

export type EntryLifecycle = "posted" | "scheduled";
export type EntryTone = "income" | "fixed" | "variable";

export function toMillis(value: unknown): number {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof (value as { toMillis?: unknown }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (typeof (value as { seconds?: unknown }).seconds === "number") {
    return Number((value as { seconds: number }).seconds) * 1000;
  }
  return 0;
}

export function normalizeEntryDate(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value.trim().slice(0, 10);
  if (typeof (value as { toDate?: unknown }).toDate === "function") {
    try {
      return (value as { toDate: () => Date }).toDate().toISOString().slice(0, 10);
    } catch {
      return "";
    }
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return "";
}

export function isFixedExpense(entry: Partial<EntryDoc> | null | undefined): boolean {
  return entry?.type === "expense" && (entry?.subType === "fixed" || entry?.subType === "fixed_realization");
}

export function isVariableExpense(entry: Partial<EntryDoc> | null | undefined): boolean {
  return entry?.type === "expense" && (entry?.subType === "variable" || !entry?.subType);
}

export function getEntryTone(entry: Partial<EntryDoc> | null | undefined): EntryTone {
  if (entry?.type === "income") return "income";
  return isFixedExpense(entry) ? "fixed" : "variable";
}

export function getEntryLifecycle(
  entry: Partial<EntryDoc> | null | undefined,
  referenceISO: string = todayISO()
): EntryLifecycle {
  if (!entry || !isFixedExpense(entry)) return "posted";

  const entryDate = normalizeEntryDate(entry.date);
  if (!entryDate) return "posted";
  if (monthKeyFromISO(entryDate) !== monthKeyFromISO(referenceISO)) return "posted";

  return entryDate > referenceISO ? "scheduled" : "posted";
}

export function parseAmountInput(value: string): number | null {
  const amount = Number(String(value || "").replace(/,/g, "").trim());
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount;
}

export function sortEntriesByDisplayDate(entries: EntryDoc[]): EntryDoc[] {
  return [...entries].sort((left, right) => {
    const leftDate = normalizeEntryDate(left.date);
    const rightDate = normalizeEntryDate(right.date);

    if (leftDate !== rightDate) return rightDate.localeCompare(leftDate);

    const leftTimestamp = toMillis(left.updatedAt) || toMillis(left.createdAt);
    const rightTimestamp = toMillis(right.updatedAt) || toMillis(right.createdAt);
    return rightTimestamp - leftTimestamp;
  });
}

export function getInstallmentLabel(entry: Partial<EntryDoc> | null | undefined): string | null {
  const index = Number(entry?.installmentIndex || 0);
  const total = Number(entry?.installmentsTotal || 0);
  if (!index || !total || total <= 1) return null;
  return `${index}/${total}`;
}

export function getEntryTypeLabel(entry: Partial<EntryDoc> | null | undefined): string {
  if (entry?.type === "income") return "הכנסה";
  return isFixedExpense(entry) ? "הוצאה קבועה" : "הוצאה משתנה";
}
