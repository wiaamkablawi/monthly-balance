import type { EntryDoc } from "../types/models";
import { getMonthProgress, todayISO } from "../utils/dates";
import { formatILS } from "../utils/money";
import { getEntryLifecycle, isFixedExpense, isVariableExpense, sortEntriesByDisplayDate } from "./entries";

export type DashboardInsightTone = "good" | "warn" | "neutral";

export interface DashboardInsight {
  tone: DashboardInsightTone;
  title: string;
  value: string;
  detail: string;
}

export interface MonthlySummary {
  totals: {
    income: number;
    variable: number;
    fixed: number;
    expenses: number;
    balance: number;
    scheduledFixed: number;
    postedExpenses: number;
  };
  counts: {
    all: number;
    income: number;
    expense: number;
    variable: number;
    fixed: number;
  };
  topVariableCategory: { category: string; value: number } | null;
  largestExpense: EntryDoc | null;
  largestIncome: EntryDoc | null;
  recentActivity: EntryDoc[];
  progress: ReturnType<typeof getMonthProgress>;
  savingsRate: number | null;
  expenseLoad: number | null;
  fixedShare: number | null;
  averageExpense: number | null;
}

export function groupVariableExpensesByCategory(entries: EntryDoc[]): Array<{ category: string; value: number }> {
  const totals = new Map<string, number>();

  for (const entry of entries) {
    if (!isVariableExpense(entry)) continue;
    const category = entry.category || "ללא קטגוריה";
    totals.set(category, (totals.get(category) || 0) + Number(entry.amount || 0));
  }

  return Array.from(totals.entries())
    .map(([category, value]) => ({ category, value }))
    .sort((left, right) => right.value - left.value);
}

export function summarizeMonthlyEntries(
  entries: EntryDoc[],
  monthKey: string,
  referenceISO: string = todayISO()
): MonthlySummary {
  let income = 0;
  let variable = 0;
  let fixed = 0;
  let scheduledFixed = 0;
  let postedExpenses = 0;
  let incomeCount = 0;
  let expenseCount = 0;
  let variableCount = 0;
  let fixedCount = 0;
  let expenseAccumulator = 0;
  let expenseAccumulatorCount = 0;
  let largestExpense: EntryDoc | null = null;
  let largestIncome: EntryDoc | null = null;

  for (const entry of entries) {
    const amount = Number(entry.amount || 0);

    if (entry.type === "income") {
      income += amount;
      incomeCount += 1;
      if (!largestIncome || amount > Number(largestIncome.amount || 0)) largestIncome = entry;
      continue;
    }

    expenseCount += 1;
    expenseAccumulator += amount;
    expenseAccumulatorCount += 1;

    if (!largestExpense || amount > Number(largestExpense.amount || 0)) largestExpense = entry;

    if (isFixedExpense(entry)) {
      fixed += amount;
      fixedCount += 1;

      if (getEntryLifecycle(entry, referenceISO) === "scheduled") {
        scheduledFixed += amount;
      } else {
        postedExpenses += amount;
      }
      continue;
    }

    variable += amount;
    variableCount += 1;
    postedExpenses += amount;
  }

  const expenses = variable + fixed;
  const balance = income - expenses;
  const topVariableCategory = groupVariableExpensesByCategory(entries)[0] || null;
  const progress = getMonthProgress(monthKey, referenceISO);

  return {
    totals: {
      income,
      variable,
      fixed,
      expenses,
      balance,
      scheduledFixed,
      postedExpenses,
    },
    counts: {
      all: entries.length,
      income: incomeCount,
      expense: expenseCount,
      variable: variableCount,
      fixed: fixedCount,
    },
    topVariableCategory,
    largestExpense,
    largestIncome,
    recentActivity: sortEntriesByDisplayDate(entries).slice(0, 8),
    progress,
    savingsRate: income > 0 ? balance / income : null,
    expenseLoad: income > 0 ? postedExpenses / income : null,
    fixedShare: expenses > 0 ? fixed / expenses : null,
    averageExpense: expenseAccumulatorCount > 0 ? expenseAccumulator / expenseAccumulatorCount : null,
  };
}

export function buildDashboardInsights(summary: MonthlySummary): DashboardInsight[] {
  const progressPercent = Math.round(summary.progress.progress * 100);
  const expenseLoadPercent = summary.expenseLoad === null ? null : Math.round(summary.expenseLoad * 100);

  return [
    {
      tone: summary.totals.balance >= 0 ? "good" : "warn",
      title: "יתרה חודשית",
      value: formatILS(summary.totals.balance),
      detail:
        summary.totals.balance >= 0
          ? "החישוב מבוסס רק על הכנסות, הוצאות קבועות והוצאות משתנות שנשמרו לחודש הזה."
          : "החישוב מבוסס רק על הנתונים שנשמרו לחודש הזה, וכרגע ההוצאות גבוהות מההכנסות.",
    },
    {
      tone: summary.totals.scheduledFixed > 0 ? "neutral" : "good",
      title: "תשלומים שטרם ירדו",
      value: formatILS(summary.totals.scheduledFixed),
      detail:
        summary.totals.scheduledFixed > 0
          ? "אלו התחייבויות קבועות שכבר מתוזמנות לחודש אבל טרם הגיע מועד החיוב שלהן."
          : "כל ההתחייבויות הקבועות של החודש כבר עברו או שאין כרגע תשלומים ממתינים.",
    },
    summary.topVariableCategory
      ? {
          tone: "neutral",
          title: "קטגוריה מובילה",
          value: `${summary.topVariableCategory.category} · ${formatILS(summary.topVariableCategory.value)}`,
          detail: "זו הקטגוריה שמשכה את רוב ההוצאה המשתנה בחודש הנבחר.",
        }
      : {
          tone: "good",
          title: "הוצאות משתנות",
          value: "אין חריגות",
          detail: "עדיין לא נרשמו הוצאות משתנות בחודש הזה.",
        },
    expenseLoadPercent === null
      ? {
          tone: "neutral",
          title: "קצב הוצאות",
          value: `${progressPercent}% מהחודש`,
          detail: "כדי לקבל הערכת קצב מול הכנסות צריך קודם לרשום הכנסה חודשית אחת לפחות.",
        }
      : {
          tone: expenseLoadPercent > progressPercent + 12 ? "warn" : expenseLoadPercent < progressPercent - 8 ? "good" : "neutral",
          title: "קצב הוצאות מול זמן",
          value: `${expenseLoadPercent}% הוצאות מול ${progressPercent}% מהחודש`,
          detail:
            expenseLoadPercent > progressPercent + 12
              ? "קצב ההוצאות בפועל מהיר יותר מההתקדמות של החודש. כדאי לבדוק מה דוחף את הפער."
              : expenseLoadPercent < progressPercent - 8
              ? "קצב ההוצאות נשאר מתחת לקצב התקדמות החודש, וזה סימן תפעולי טוב."
              : "הקצב כרגע דומה להתקדמות החודש ואין סטייה חריגה.",
        },
  ];
}
