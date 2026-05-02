import type { MonthlySummary } from "../domain/analytics";
import type {
  CategoryComparison,
  CategoryTableRow,
  FixedRealizationRow,
} from "../domain/report";
import { formatMonthKey } from "../utils/dates";

interface ExportArgs {
  monthKey: string;
  summary: MonthlySummary;
  categoryTable: CategoryTableRow[];
  comparison: CategoryComparison[];
  fixedRealizations: FixedRealizationRow[];
  previousMonthKey: string;
}

function kindLabel(kind: "income" | "fixed" | "variable"): string {
  if (kind === "income") return "הכנסה";
  if (kind === "fixed") return "הוצאה קבועה";
  return "הוצאה משתנה";
}

function lifecycleLabel(lifecycle: "posted" | "scheduled"): string {
  return lifecycle === "scheduled" ? "מתוזמנת" : "ירדה";
}

function pctOrEmpty(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

export async function exportMonthlyReportToExcel(args: ExportArgs): Promise<void> {
  const XLSX = await import("xlsx");
  const { monthKey, summary, categoryTable, comparison, fixedRealizations } = args;

  const monthLabel = formatMonthKey(monthKey);
  const previousLabel = formatMonthKey(args.previousMonthKey);

  const summaryRows = [
    ["דוח חודשי", monthLabel],
    [],
    ["סעיף", "ערך"],
    ["הכנסות", summary.totals.income],
    ["הוצאות", summary.totals.expenses],
    ["הוצאות קבועות", summary.totals.fixed],
    ["הוצאות משתנות", summary.totals.variable],
    ["יתרה", summary.totals.balance],
    ["שיעור חיסכון", pctOrEmpty(summary.savingsRate)],
    ["יחס הוצאות/הכנסות", pctOrEmpty(summary.expenseLoad)],
    ["מספר עסקאות", summary.counts.all],
    ["הכנסות (כמות)", summary.counts.income],
    ["הוצאות (כמות)", summary.counts.expense],
  ];

  const categoryRows = [
    ["קטגוריה", "סוג", "מספר עסקאות", "סכום", "% מסך הוצאות"],
    ...categoryTable.map((row) => [
      row.category,
      row.kindLabel,
      row.count,
      row.value,
      row.kind === "income" ? "—" : `${(row.shareOfExpenses * 100).toFixed(1)}%`,
    ]),
  ];

  const comparisonRows = [
    ["קטגוריה", "סוג", `${previousLabel}`, `${monthLabel}`, "שינוי ₪", "שינוי %"],
    ...comparison.map((row) => [
      row.category,
      kindLabel(row.kind),
      row.previous,
      row.current,
      row.deltaAbs,
      pctOrEmpty(row.deltaPct),
    ]),
  ];

  const fixedRows = [
    ["תיאור", "קטגוריה", "סכום", "תאריך חיוב", "סטטוס"],
    ...fixedRealizations.map((row) => [
      row.description,
      row.category,
      row.amount,
      row.date || "—",
      lifecycleLabel(row.lifecycle),
    ]),
  ];

  const workbook = XLSX.utils.book_new();
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  const categorySheet = XLSX.utils.aoa_to_sheet(categoryRows);
  const comparisonSheet = XLSX.utils.aoa_to_sheet(comparisonRows);
  const fixedSheet = XLSX.utils.aoa_to_sheet(fixedRows);

  if (!workbook.Workbook) workbook.Workbook = {};
  workbook.Workbook.Views = [{ RTL: true }];

  XLSX.utils.book_append_sheet(workbook, summarySheet, "סיכום");
  XLSX.utils.book_append_sheet(workbook, categorySheet, "קטגוריות");
  XLSX.utils.book_append_sheet(workbook, comparisonSheet, "השוואה");
  XLSX.utils.book_append_sheet(workbook, fixedSheet, "קבועות");

  XLSX.writeFile(workbook, `דוח-חודשי-${monthKey}.xlsx`);
}
