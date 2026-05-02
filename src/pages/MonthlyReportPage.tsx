import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Chart as ChartJS,
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar, Pie } from "react-chartjs-2";
import BottomNav from "../components/BottomNav";
import { summarizeMonthlyEntries, type MonthlySummary } from "../domain/analytics";
import {
  buildCategoryTable,
  compareMonths,
  computeKpiDeltas,
  dailyVariableExpenses,
  listFixedRealizations,
  previousMonthKey as previousMonthKeyFn,
  topExpenseCategories,
  type CategoryComparison,
  type CategoryTableRow,
  type FixedRealizationRow,
  type KpiDelta,
} from "../domain/report";
import { listMonthEntries } from "../services/recordsService";
import { exportMonthlyReportToExcel } from "../services/reportExport";
import type { EntryDoc } from "../types/models";
import { currentMonthKey, formatMonthKey, getMonthProgress, listRecentMonthKeys, todayISO } from "../utils/dates";
import { formatILS } from "../utils/money";

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

type LoadState = "idle" | "loading" | "ready" | "error";

const KIND_LABELS: Record<"income" | "fixed" | "variable", string> = {
  income: "הכנסה",
  fixed: "הוצאה קבועה",
  variable: "הוצאה משתנה",
};

function formatPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function formatSignedILS(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${formatILS(Math.abs(value))}`;
}

function deltaArrow(delta: KpiDelta): { className: string; symbol: string } {
  if (!delta.pct && delta.value === 0) return { className: "flat", symbol: "·" };
  if (delta.value > 0) return { className: "up", symbol: "▲" };
  if (delta.value < 0) return { className: "down", symbol: "▼" };
  return { className: "flat", symbol: "·" };
}

function KpiCard(props: {
  label: string;
  value: string;
  delta: KpiDelta;
  invertColors?: boolean;
}) {
  const arrow = deltaArrow(props.delta);
  let className = arrow.className;
  if (props.invertColors && className === "up") className = "down";
  else if (props.invertColors && className === "down") className = "up";

  return (
    <div className="mb-kpi">
      <div className="mb-kpi-lbl">{props.label}</div>
      <div className="mb-kpi-val">{props.value}</div>
      <div className={`mb-kpi-delta ${className}`}>
        {arrow.symbol} {formatPct(props.delta.pct)} ({formatSignedILS(props.delta.value)})
      </div>
    </div>
  );
}

function KpiCountCard(props: { label: string; value: number; delta: KpiDelta }) {
  const arrow = deltaArrow(props.delta);
  return (
    <div className="mb-kpi">
      <div className="mb-kpi-lbl">{props.label}</div>
      <div className="mb-kpi-val">{props.value.toLocaleString("he-IL")}</div>
      <div className={`mb-kpi-delta ${arrow.className}`}>
        {arrow.symbol} {formatPct(props.delta.pct)} ({props.delta.value >= 0 ? "+" : "−"}
        {Math.abs(props.delta.value)})
      </div>
    </div>
  );
}

function CompositionChart(props: { summary: MonthlySummary }) {
  const { totals } = props.summary;
  const hasData = totals.fixed + totals.variable + totals.income > 0;

  const data = useMemo(
    () => ({
      labels: ["הכנסות", "הוצאות קבועות", "הוצאות משתנות"],
      datasets: [
        {
          data: [totals.income, totals.fixed, totals.variable],
          backgroundColor: ["#10B981", "#A78BFA", "#FB7185"],
          borderColor: "#fff",
          borderWidth: 2,
        },
      ],
    }),
    [totals.income, totals.fixed, totals.variable]
  );

  const options = useMemo(
    () =>
      ({
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom" as const, rtl: true, labels: { font: { family: "Rubik" } } },
          tooltip: {
            rtl: true,
            callbacks: {
              label: (ctx: any) => `${ctx.label}: ${formatILS(Number(ctx.raw || 0))}`,
            },
          },
        },
      }) as const,
    []
  );

  if (!hasData) return <div className="mb-report-empty">אין נתונים להצגה</div>;

  return (
    <div className="mb-chart-wrap">
      <Pie data={data} options={options} />
    </div>
  );
}

function TopCategoriesChart(props: { entries: EntryDoc[] }) {
  const groups = useMemo(() => topExpenseCategories(props.entries, 8), [props.entries]);

  if (groups.length === 0) return <div className="mb-report-empty">אין הוצאות בחודש זה</div>;

  const data = {
    labels: groups.map((group) => group.category),
    datasets: [
      {
        label: "סכום",
        data: groups.map((group) => group.value),
        backgroundColor: "#FF8C5A",
        borderRadius: 6,
      },
    ],
  };

  const options = {
    indexAxis: "y" as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        rtl: true,
        callbacks: {
          label: (ctx: any) => formatILS(Number(ctx.raw || 0)),
        },
      },
    },
    scales: {
      x: { ticks: { font: { family: "Rubik" }, callback: (val: any) => `₪${val}` } },
      y: { ticks: { font: { family: "Rubik" } } },
    },
  };

  return (
    <div className="mb-chart-wrap tall">
      <Bar data={data} options={options} />
    </div>
  );
}

const HEBREW_DAYS_SHORT = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

function dayOfWeekLabel(monthKey: string, dayIndex: number): string {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 1, dayIndex + 1);
  return HEBREW_DAYS_SHORT[date.getDay()];
}

function DailyChart(props: { entries: EntryDoc[]; monthKey: string }) {
  const dailyValues = useMemo(
    () => dailyVariableExpenses(props.entries, props.monthKey),
    [props.entries, props.monthKey]
  );
  const totalSpend = dailyValues.reduce((sum, value) => sum + value, 0);
  const daysWithSpend = dailyValues.filter((value) => value > 0).length;
  const average = daysWithSpend > 0 ? totalSpend / daysWithSpend : 0;

  if (totalSpend === 0)
    return <div className="mb-report-empty">לא נרשמו הוצאות משתנות עם תאריך יומי</div>;

  const data = {
    labels: dailyValues.map((_, index) => [String(index + 1), dayOfWeekLabel(props.monthKey, index)]),
    datasets: [
      {
        label: "הוצאות משתנות יומיות",
        data: dailyValues,
        backgroundColor: dailyValues.map((value) => (value === 0 ? "#FFE0CC" : "#FF5C35")),
        borderRadius: 4,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        rtl: true,
        callbacks: {
          title: (items: any[]) => {
            const raw = items[0]?.label;
            const day = Array.isArray(raw) ? raw[0] : raw;
            return `יום ${day || ""}`;
          },
          label: (ctx: any) => formatILS(Number(ctx.raw || 0)),
        },
      },
      annotation: undefined,
    },
    scales: {
      x: { ticks: { font: { family: "Rubik" } }, grid: { display: false } },
      y: {
        ticks: { font: { family: "Rubik" }, callback: (val: any) => `₪${val}` },
        grid: { color: "#FFF0E8" },
      },
    },
  };

  return (
    <>
      <div className="mb-chart-wrap">
        <Bar data={data} options={options} />
      </div>
      <div style={{ fontSize: 11, color: "#C4997A", marginTop: 8, textAlign: "center" }}>
        ממוצע ליום עם הוצאה: {formatILS(average)} · {daysWithSpend} ימים פעילים
      </div>
    </>
  );
}

function ComparisonTable(props: {
  comparison: CategoryComparison[];
  previousLabel: string;
  currentLabel: string;
}) {
  const visibleRows = props.comparison.filter((row) => row.previous !== 0 || row.current !== 0);

  if (visibleRows.length === 0)
    return <div className="mb-report-empty">אין נתונים להשוואה</div>;

  return (
    <table className="mb-table">
      <thead>
        <tr>
          <th>קטגוריה</th>
          <th>סוג</th>
          <th className="num">{props.previousLabel}</th>
          <th className="num">{props.currentLabel}</th>
          <th className="num">שינוי ₪</th>
          <th className="num">שינוי %</th>
        </tr>
      </thead>
      <tbody>
        {visibleRows.map((row) => {
          const isExpenseGrowth = row.kind !== "income" && row.deltaAbs > 0;
          const isExpenseDrop = row.kind !== "income" && row.deltaAbs < 0;
          const isIncomeGrowth = row.kind === "income" && row.deltaAbs > 0;
          const isIncomeDrop = row.kind === "income" && row.deltaAbs < 0;
          const cls =
            isIncomeGrowth || isExpenseDrop ? "pos" : isIncomeDrop || isExpenseGrowth ? "neg" : "muted";

          return (
            <tr key={`${row.kind}-${row.category}`}>
              <td>{row.category}</td>
              <td>
                <span className={`mb-kind-pill ${row.kind}`}>{KIND_LABELS[row.kind]}</span>
              </td>
              <td className="num">{formatILS(row.previous)}</td>
              <td className="num">{formatILS(row.current)}</td>
              <td className={`num ${cls}`}>{formatSignedILS(row.deltaAbs)}</td>
              <td className={`num ${cls}`}>{formatPct(row.deltaPct)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function FixedRealizationsTable(props: { rows: FixedRealizationRow[] }) {
  if (props.rows.length === 0)
    return <div className="mb-report-empty">לא נרשמו הוצאות קבועות החודש</div>;

  return (
    <table className="mb-table">
      <thead>
        <tr>
          <th>תיאור</th>
          <th>קטגוריה</th>
          <th className="num">סכום</th>
          <th>תאריך חיוב</th>
          <th>סטטוס</th>
        </tr>
      </thead>
      <tbody>
        {props.rows.map((row) => (
          <tr key={row.id}>
            <td>{row.description}</td>
            <td>{row.category}</td>
            <td className="num">{formatILS(row.amount)}</td>
            <td className="muted">{row.date || "—"}</td>
            <td>
              <span className={`mb-status-pill ${row.lifecycle}`}>
                {row.lifecycle === "scheduled" ? "מתוזמנת" : "ירדה"}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CategoryBreakdownTable(props: { rows: CategoryTableRow[] }) {
  if (props.rows.length === 0)
    return <div className="mb-report-empty">אין עסקאות בחודש זה</div>;

  return (
    <table className="mb-table">
      <thead>
        <tr>
          <th>קטגוריה</th>
          <th>סוג</th>
          <th className="num">מספר</th>
          <th className="num">סכום</th>
          <th style={{ minWidth: 140 }}>% מהוצאות</th>
        </tr>
      </thead>
      <tbody>
        {props.rows.map((row) => (
          <tr key={`${row.kind}-${row.category}`}>
            <td>{row.category}</td>
            <td>
              <span className={`mb-kind-pill ${row.kind}`}>{row.kindLabel}</span>
            </td>
            <td className="num">{row.count}</td>
            <td className="num">{formatILS(row.value)}</td>
            <td>
              {row.kind === "income" ? (
                <span className="muted">—</span>
              ) : (
                <>
                  <div style={{ fontSize: 11, color: "#4A3020" }}>
                    {(row.shareOfExpenses * 100).toFixed(1)}%
                  </div>
                  <div className="mb-share-bar">
                    <div
                      className="mb-share-fill"
                      style={{ width: `${Math.min(100, row.shareOfExpenses * 100)}%` }}
                    />
                  </div>
                </>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function MonthlyReportPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const fallbackMonth = currentMonthKey();
  const requestedMonthKey = searchParams.get("month");
  const initialMonth =
    requestedMonthKey && /^\d{4}-\d{2}$/.test(requestedMonthKey) ? requestedMonthKey : fallbackMonth;

  const [monthKey, setMonthKey] = useState<string>(initialMonth);
  const [currentEntries, setCurrentEntries] = useState<EntryDoc[]>([]);
  const [previousEntries, setPreviousEntries] = useState<EntryDoc[]>([]);
  const [state, setState] = useState<LoadState>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const monthOptions = useMemo(
    () => listRecentMonthKeys(18, fallbackMonth, "desc"),
    [fallbackMonth]
  );

  const prevKey = useMemo(() => previousMonthKeyFn(monthKey), [monthKey]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState("loading");
      setErrorMessage("");
      try {
        const [currentList, previousList] = await Promise.all([
          listMonthEntries(monthKey, { ensureFixedRealizations: false }),
          listMonthEntries(prevKey, { ensureFixedRealizations: false }),
        ]);
        if (cancelled) return;
        setCurrentEntries(currentList);
        setPreviousEntries(previousList);
        setState("ready");
      } catch (error: any) {
        if (cancelled) return;
        setCurrentEntries([]);
        setPreviousEntries([]);
        setState("error");
        setErrorMessage(error?.message || "לא הצלחנו לטעון את הדו״ח החודשי.");
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [monthKey, prevKey]);

  const referenceISO = todayISO();
  const summary = useMemo(
    () => summarizeMonthlyEntries(currentEntries, monthKey, referenceISO),
    [currentEntries, monthKey, referenceISO]
  );
  const previousSummary = useMemo(
    () => (previousEntries.length ? summarizeMonthlyEntries(previousEntries, prevKey, referenceISO) : null),
    [previousEntries, prevKey, referenceISO]
  );
  const deltas = useMemo(() => computeKpiDeltas(summary, previousSummary), [summary, previousSummary]);
  const categoryTable = useMemo(() => buildCategoryTable(currentEntries), [currentEntries]);
  const comparison = useMemo(
    () => compareMonths(currentEntries, previousEntries),
    [currentEntries, previousEntries]
  );
  const fixedRows = useMemo(
    () => listFixedRealizations(currentEntries, referenceISO),
    [currentEntries, referenceISO]
  );

  const monthLabel = formatMonthKey(monthKey);
  const previousLabel = formatMonthKey(prevKey);
  const totalDays = getMonthProgress(monthKey).totalDays;

  const handleMonthChange = (nextMonth: string) => {
    setMonthKey(nextMonth);
    const params = new URLSearchParams(searchParams);
    params.set("month", nextMonth);
    setSearchParams(params, { replace: true });
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExport = async () => {
    try {
      await exportMonthlyReportToExcel({
        monthKey,
        summary,
        categoryTable,
        comparison,
        fixedRealizations: fixedRows,
        previousMonthKey: prevKey,
      });
    } catch (error: any) {
      alert(error?.message || "שגיאה בייצוא הקובץ");
    }
  };

  return (
    <>
      <div className="mb-report">
        <header className="mb-report-header">
          <div>
            <div className="mb-report-title">דו״ח חודשי · {monthLabel}</div>
            <div className="mb-report-sub">
              {totalDays} ימים · השוואה מול {previousLabel}
            </div>
          </div>
          <div className="mb-report-actions">
            <select
              className="mb-month-pick"
              value={monthKey}
              onChange={(event) => handleMonthChange(event.target.value)}
              aria-label="בחר חודש"
            >
              {monthOptions.map((optionKey) => (
                <option key={optionKey} value={optionKey}>
                  {formatMonthKey(optionKey)}
                </option>
              ))}
            </select>
            <button type="button" className="mb-report-btn" onClick={handlePrint}>
              🖨️ הדפסה
            </button>
            <button type="button" className="mb-report-btn primary" onClick={handleExport}>
              📥 ייצוא Excel
            </button>
            <Link to="/" className="mb-report-btn ghost">
              ← לדשבורד
            </Link>
          </div>
        </header>

        {state === "loading" ? (
          <div className="mb-report-section">
            <div className="mb-report-empty">טוען נתונים…</div>
          </div>
        ) : null}

        {errorMessage ? (
          <div className="mb-report-section" style={{ borderColor: "#FCA5A5" }}>
            <div className="mb-report-empty" style={{ color: "#B91C1C" }}>
              {errorMessage}
            </div>
          </div>
        ) : null}

        <section className="mb-kpi-grid">
          <KpiCard label="הכנסות" value={formatILS(summary.totals.income)} delta={deltas.income} />
          <KpiCard
            label="הוצאות"
            value={formatILS(summary.totals.expenses)}
            delta={deltas.expenses}
            invertColors
          />
          <KpiCard label="יתרה" value={formatILS(summary.totals.balance)} delta={deltas.balance} />
          <KpiCard
            label="שיעור חיסכון"
            value={formatPct(summary.savingsRate)}
            delta={deltas.savingsRate}
          />
          <KpiCard
            label="יחס הוצאות / הכנסות"
            value={formatPct(summary.expenseLoad)}
            delta={deltas.expenseLoad}
            invertColors
          />
          <KpiCountCard
            label="מספר עסקאות"
            value={summary.counts.all}
            delta={deltas.transactionCount}
          />
        </section>

        <section className="mb-report-section">
          <div className="mb-report-section-title">הרכב חודשי</div>
          <CompositionChart summary={summary} />
        </section>

        <section className="mb-report-section">
          <div className="mb-report-section-title">Top 8 קטגוריות הוצאה</div>
          <TopCategoriesChart entries={currentEntries} />
        </section>

        <section className="mb-report-section">
          <div className="mb-report-section-title">הוצאות משתנות לפי יום</div>
          <DailyChart entries={currentEntries} monthKey={monthKey} />
        </section>

        <section className="mb-report-section">
          <div className="mb-report-section-title">השוואה מול {previousLabel}</div>
          <ComparisonTable
            comparison={comparison}
            previousLabel={previousLabel}
            currentLabel={monthLabel}
          />
        </section>

        <section className="mb-report-section">
          <div className="mb-report-section-title">פירוט הוצאות קבועות</div>
          <FixedRealizationsTable rows={fixedRows} />
        </section>

        <section className="mb-report-section">
          <div className="mb-report-section-title">טבלת קטגוריות מלאה</div>
          <CategoryBreakdownTable rows={categoryTable} />
        </section>
      </div>

      <BottomNav variant="mobile" />
    </>
  );
}
