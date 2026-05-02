import type { EntryDoc } from "../types/models";
import { getMonthProgress, todayISO } from "../utils/dates";
import {
  getEntryLifecycle,
  getEntryTypeLabel,
  isFixedExpense,
  isVariableExpense,
  normalizeEntryDate,
} from "./entries";
import type { MonthlySummary } from "./analytics";

export type CategoryKind = "income" | "fixed" | "variable";

export interface CategoryGroup {
  category: string;
  kind: CategoryKind;
  value: number;
  count: number;
}

export interface CategoryComparison {
  category: string;
  kind: CategoryKind;
  previous: number;
  current: number;
  deltaAbs: number;
  deltaPct: number | null;
}

export interface FixedRealizationRow {
  id: string;
  description: string;
  category: string;
  amount: number;
  date: string;
  lifecycle: "posted" | "scheduled";
}

export interface CategoryTableRow {
  category: string;
  kind: CategoryKind;
  kindLabel: string;
  count: number;
  value: number;
  shareOfExpenses: number;
}

export interface KpiDelta {
  value: number;
  pct: number | null;
}

export interface KpiDeltas {
  income: KpiDelta;
  expenses: KpiDelta;
  balance: KpiDelta;
  savingsRate: KpiDelta;
  expenseLoad: KpiDelta;
  transactionCount: KpiDelta;
}

function entryKind(entry: EntryDoc): CategoryKind {
  if (entry.type === "income") return "income";
  return isFixedExpense(entry) ? "fixed" : "variable";
}

function categoryLabel(entry: EntryDoc): string {
  return (entry.category && entry.category.trim()) || "ללא קטגוריה";
}

export function dailyVariableExpenses(entries: EntryDoc[], monthKey: string): number[] {
  const totalDays = getMonthProgress(monthKey).totalDays || 31;
  const buckets = new Array(totalDays).fill(0) as number[];

  for (const entry of entries) {
    if (!isVariableExpense(entry)) continue;
    const dateISO = normalizeEntryDate(entry.date);
    if (!dateISO) continue;
    const dayRaw = Number(dateISO.split("-")[2]);
    if (!Number.isFinite(dayRaw) || dayRaw < 1 || dayRaw > totalDays) continue;
    buckets[dayRaw - 1] += Number(entry.amount || 0);
  }

  return buckets;
}

export function groupAllByCategory(entries: EntryDoc[]): CategoryGroup[] {
  const map = new Map<string, CategoryGroup>();

  for (const entry of entries) {
    const kind = entryKind(entry);
    const category = categoryLabel(entry);
    const key = `${kind}::${category}`;
    const existing = map.get(key);
    const amount = Number(entry.amount || 0);

    if (existing) {
      existing.value += amount;
      existing.count += 1;
    } else {
      map.set(key, { category, kind, value: amount, count: 1 });
    }
  }

  return Array.from(map.values()).sort((left, right) => right.value - left.value);
}

export function topExpenseCategories(entries: EntryDoc[], limit = 8): CategoryGroup[] {
  return groupAllByCategory(entries)
    .filter((group) => group.kind !== "income")
    .slice(0, limit);
}

export function compareMonths(
  currentEntries: EntryDoc[],
  previousEntries: EntryDoc[]
): CategoryComparison[] {
  const currentGroups = groupAllByCategory(currentEntries);
  const previousGroups = groupAllByCategory(previousEntries);

  const map = new Map<string, CategoryComparison>();

  const ensureRow = (category: string, kind: CategoryKind): CategoryComparison => {
    const key = `${kind}::${category}`;
    let row = map.get(key);
    if (!row) {
      row = { category, kind, previous: 0, current: 0, deltaAbs: 0, deltaPct: null };
      map.set(key, row);
    }
    return row;
  };

  for (const group of previousGroups) {
    const row = ensureRow(group.category, group.kind);
    row.previous = group.value;
  }

  for (const group of currentGroups) {
    const row = ensureRow(group.category, group.kind);
    row.current = group.value;
  }

  return Array.from(map.values())
    .map((row) => {
      const deltaAbs = row.current - row.previous;
      const deltaPct = row.previous > 0 ? deltaAbs / row.previous : null;
      return { ...row, deltaAbs, deltaPct };
    })
    .sort((left, right) => Math.abs(right.deltaAbs) - Math.abs(left.deltaAbs));
}

export function listFixedRealizations(
  entries: EntryDoc[],
  referenceISO: string = todayISO()
): FixedRealizationRow[] {
  return entries
    .filter((entry) => isFixedExpense(entry))
    .map((entry) => ({
      id: entry.id,
      description: entry.description || entry.category || "תשלום קבוע",
      category: categoryLabel(entry),
      amount: Number(entry.amount || 0),
      date: normalizeEntryDate(entry.date),
      lifecycle: getEntryLifecycle(entry, referenceISO),
    }))
    .sort((left, right) => {
      if (left.date && right.date) return left.date.localeCompare(right.date);
      if (left.date) return -1;
      if (right.date) return 1;
      return right.amount - left.amount;
    });
}

export function buildCategoryTable(entries: EntryDoc[]): CategoryTableRow[] {
  const groups = groupAllByCategory(entries);
  const totalExpenses = groups
    .filter((group) => group.kind !== "income")
    .reduce((sum, group) => sum + group.value, 0);

  return groups.map((group) => {
    const sample = entries.find(
      (entry) => entryKind(entry) === group.kind && categoryLabel(entry) === group.category
    );
    return {
      category: group.category,
      kind: group.kind,
      kindLabel: sample ? getEntryTypeLabel(sample) : group.kind === "income" ? "הכנסה" : "הוצאה",
      count: group.count,
      value: group.value,
      shareOfExpenses:
        group.kind === "income" || totalExpenses === 0 ? 0 : group.value / totalExpenses,
    };
  });
}

function buildDelta(current: number, previous: number): KpiDelta {
  const value = current - previous;
  const pct = previous !== 0 ? value / Math.abs(previous) : null;
  return { value, pct };
}

export function computeKpiDeltas(
  current: MonthlySummary,
  previous: MonthlySummary | null
): KpiDeltas {
  if (!previous) {
    const empty: KpiDelta = { value: 0, pct: null };
    return {
      income: empty,
      expenses: empty,
      balance: empty,
      savingsRate: empty,
      expenseLoad: empty,
      transactionCount: empty,
    };
  }

  const currentSavings = current.savingsRate ?? 0;
  const previousSavings = previous.savingsRate ?? 0;
  const currentLoad = current.expenseLoad ?? 0;
  const previousLoad = previous.expenseLoad ?? 0;

  return {
    income: buildDelta(current.totals.income, previous.totals.income),
    expenses: buildDelta(current.totals.expenses, previous.totals.expenses),
    balance: buildDelta(current.totals.balance, previous.totals.balance),
    savingsRate: buildDelta(currentSavings, previousSavings),
    expenseLoad: buildDelta(currentLoad, previousLoad),
    transactionCount: buildDelta(current.counts.all, previous.counts.all),
  };
}

export function previousMonthKey(monthKey: string): string {
  const [yearRaw, monthRaw] = monthKey.split("-").map(Number);
  if (!Number.isFinite(yearRaw) || !Number.isFinite(monthRaw)) return monthKey;
  const date = new Date(yearRaw, monthRaw - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
