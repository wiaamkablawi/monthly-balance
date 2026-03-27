import React, { useEffect, useMemo, useState, useTransition } from "react";
import { BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Tooltip } from "chart.js";
import { Bar } from "react-chartjs-2";
import { Link, useSearchParams } from "react-router-dom";
import AppLayout from "../app/layout/AppLayout";
import ImportEntriesModal from "../components/entry/ImportEntriesModal";
import { groupVariableExpensesByCategory, summarizeMonthlyEntries } from "../domain/analytics";
import { getEntryLifecycle, getEntryTone, getEntryTypeLabel, getInstallmentLabel } from "../domain/entries";
import { ensureFixedRealizationsForMonth, listAvailableMonthKeys, listMonthEntries, listVariableExpenseTrend } from "../services/recordsService";
import type { EntryDoc } from "../types/models";
import { currentMonthKey, formatMonthKey, listRecentMonthKeys, todayISO } from "../utils/dates";
import { formatILS } from "../utils/money";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

type LoadState = "idle" | "loading" | "ready" | "error";

function mergeMonthOptions(primary: string[], secondary: string[]): string[] {
  return Array.from(new Set([...primary, ...secondary])).sort((left, right) => right.localeCompare(left));
}

function formatShortDate(dateISO: string): string {
  if (!dateISO) return "";

  try {
    return new Intl.DateTimeFormat("he-IL", {
      day: "2-digit",
      month: "short",
    }).format(new Date(dateISO));
  } catch {
    return dateISO;
  }
}

function formatTrendLabel(monthKey: string): string {
  const monthIndex = Number(monthKey.split("-")[1]) - 1;
  const labels = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  return labels[monthIndex] || monthKey;
}

function toPercent(value: number | null, fallback = 0): number {
  if (value === null || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100, Math.round(value * 100)));
}

function trendChangeText(trend: Array<{ month: string; value: number }>): string {
  if (trend.length < 2) return "אין מספיק נתונים לשינוי בין חודשים";

  const previous = trend[trend.length - 2]?.value || 0;
  const current = trend[trend.length - 1]?.value || 0;
  if (previous === 0 && current === 0) return "ללא שינוי בהוצאות המשתנות";
  if (previous === 0) return "נרשמה הוצאה משתנה ראשונה בטווח הנמדד";

  const delta = ((current - previous) / previous) * 100;
  const direction = delta > 0 ? "+" : "";
  return `${direction}${delta.toFixed(1)}% לעומת החודש הקודם`;
}

function buildInsightCards(summary: ReturnType<typeof summarizeMonthlyEntries>) {
  const savingsPercent = toPercent(summary.savingsRate);
  const fixedSharePercent = toPercent(summary.fixedShare);
  const progressPercent = toPercent(summary.progress.progress);

  return [
    {
      title: "שיעור חיסכון",
      value: summary.savingsRate === null ? "אין הכנסה" : `${savingsPercent}%`,
      detail:
        summary.savingsRate === null
          ? "כדי לחשב שיעור חיסכון צריך לפחות הכנסה אחת בחודש."
          : "כמה מההכנסה החודשית נשאר אחרי כל ההוצאות.",
      tone: summary.totals.balance >= 0 ? "positive" : "negative",
    },
    {
      title: "הוצאות קבועות",
      value: `${fixedSharePercent}%`,
      detail: "החלק של התחייבויות קבועות מתוך כלל ההוצאות בחודש.",
      tone: "neutral",
    },
    {
      title: "קצב חודש",
      value: `${progressPercent}%`,
      detail: `${summary.progress.elapsedDays} ימים עברו מתוך ${summary.progress.totalDays}.`,
      tone: "neutral",
    },
    {
      title: "עסקה מובילה",
      value: summary.topVariableCategory ? summary.topVariableCategory.category : "אין עדיין",
      detail: summary.topVariableCategory ? formatILS(summary.topVariableCategory.value) : "לא נרשמו הוצאות משתנות",
      tone: "neutral",
    },
  ] as const;
}

function entryGlyph(entry: EntryDoc): string {
  if (entry.type === "income") return "+";
  const category = String(entry.category || "").trim();
  return category ? category.charAt(0) : "₪";
}

export default function DashboardPage() {
  const [searchParams] = useSearchParams();
  const currentMonth = currentMonthKey();
  const requestedMonthKey = searchParams.get("month");
  const [monthKey, setMonthKey] = useState<string>(
    requestedMonthKey && /^\d{4}-\d{2}$/.test(requestedMonthKey) ? requestedMonthKey : currentMonth
  );
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [entries, setEntries] = useState<EntryDoc[]>([]);
  const [trend, setTrend] = useState<Array<{ month: string; value: number }>>([]);
  const [isTrendLoading, setIsTrendLoading] = useState(false);
  const [showCharts, setShowCharts] = useState(false);
  const [state, setState] = useState<LoadState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isMonthPending, startMonthTransition] = useTransition();

  const monthOptions = useMemo(
    () => mergeMonthOptions(listRecentMonthKeys(18, currentMonth, "desc"), availableMonths),
    [availableMonths, currentMonth]
  );
  const trendMonths = useMemo(() => listRecentMonthKeys(6, monthKey, "asc"), [monthKey]);

  useEffect(() => {
    if (state !== "ready") return;

    let cancelled = false;
    let timeoutId = 0;

    async function loadMonthAvailability() {
      try {
        const months = await listAvailableMonthKeys();
        if (cancelled) return;

        setAvailableMonths(months);
        if (!months.length) return;
        if (!months.includes(currentMonth) && monthKey === currentMonth) {
          setMonthKey(months[0]);
        }
      } catch {
        if (!cancelled) {
          setAvailableMonths([]);
        }
      }
    }

    timeoutId = window.setTimeout(() => {
      void loadMonthAvailability();
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [reloadToken, currentMonth, monthKey, state]);

  useEffect(() => {
    let cancelled = false;
    let chartTimer = 0;

    async function loadDashboard() {
      setState("loading");
      setErrorMessage("");
      setTrend([]);
      setIsTrendLoading(true);
      setShowCharts(false);

      try {
        const monthEntries = await listMonthEntries(monthKey, { ensureFixedRealizations: false });
        if (cancelled) return;

        setEntries(monthEntries);
        setState("ready");
        chartTimer = window.setTimeout(() => {
          if (!cancelled) setShowCharts(true);
        }, 0);
      } catch (error: any) {
        if (cancelled) return;

        setEntries([]);
        setTrend([]);
        setIsTrendLoading(false);
        setShowCharts(false);
        setState("error");
        setErrorMessage(error?.message || "לא הצלחנו לטעון את הסקירה החודשית.");
        return;
      }

      void (async () => {
        try {
          const createdCount = await ensureFixedRealizationsForMonth(monthKey);
          if (cancelled || createdCount === 0) return;

          const refreshedEntries = await listMonthEntries(monthKey, { ensureFixedRealizations: false });
          if (!cancelled) setEntries(refreshedEntries);
        } catch {
          // The core screen is already visible, so background hydration stays silent.
        }
      })();

      try {
        const variableTrend = await listVariableExpenseTrend(trendMonths);
        if (!cancelled) setTrend(variableTrend);
      } catch {
        if (!cancelled) setTrend([]);
      } finally {
        if (!cancelled) setIsTrendLoading(false);
      }
    }

    void loadDashboard();

    return () => {
      cancelled = true;
      window.clearTimeout(chartTimer);
    };
  }, [monthKey, reloadToken, trendMonths]);

  const summary = useMemo(() => summarizeMonthlyEntries(entries, monthKey), [entries, monthKey]);
  const variableByCategory = useMemo(() => groupVariableExpensesByCategory(entries).slice(0, 5), [entries]);
  const recentActivity = useMemo(() => summary.recentActivity.slice(0, 4), [summary.recentActivity]);
  const insights = useMemo(() => buildInsightCards(summary), [summary]);

  const savingsPercent = toPercent(summary.savingsRate);
  const incomeAccent = Math.max(
    summary.totals.income > 0 || summary.totals.expenses > 0
      ? Math.round((summary.totals.income / Math.max(summary.totals.income, summary.totals.expenses, 1)) * 100)
      : 0,
    18
  );
  const expenseAccent = Math.max(
    summary.totals.income > 0 || summary.totals.expenses > 0
      ? Math.round((summary.totals.expenses / Math.max(summary.totals.income, summary.totals.expenses, 1)) * 100)
      : 0,
    18
  );

  const currentMonthLabel = formatMonthKey(monthKey);
  const trendMessage = trendChangeText(trend);

  return (
    <AppLayout
      title="סקירה פיננסית"
      subtitle="שכבת בקרה חודשית עם תמונת מאקרו, הוצאות משתנות, התחייבויות קבועות ופעילות אחרונה."
    >
      <div className="page-stack">
        <div className="dashboard-actions">
          <div className="toolbar-actions">
            <Link className="btn" to="/add">
              הוספת תנועה
            </Link>
            <button className="btn secondary" type="button" onClick={() => setIsImportOpen(true)} disabled={state === "loading" || isMonthPending}>
              ייבוא קובץ
            </button>
            <Link className="btn secondary" to="/transactions">
              לכל התנועות
            </Link>
          </div>

          <div className="month-picker">
            <span className="muted text-small">חודש</span>
            <select
              className="input"
              value={monthKey}
              disabled={state === "loading" || isMonthPending}
              onChange={(event) => startMonthTransition(() => setMonthKey(event.target.value))}
            >
              {monthOptions.map((optionMonthKey) => (
                <option key={optionMonthKey} value={optionMonthKey}>
                  {formatMonthKey(optionMonthKey)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {availableMonths.length > 0 && !availableMonths.includes(currentMonth) ? (
          <div className="note-banner">לחודש הנוכחי אין עדיין תנועות, ולכן מוצג אוטומטית החודש האחרון עם נתונים.</div>
        ) : null}
        {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}

        <section className="dashboard-hero">
          <div className="page-stack">
            <article className="hero-balance-panel">
              <div className="hero-balance-label">יתרה כוללת</div>
              <div className="hero-balance-value" style={summary.totals.balance < 0 ? { color: "var(--danger)" } : undefined}>
                <span className="hero-balance-currency">₪ </span>
                {summary.totals.balance.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
              <div className="hero-change-pill">{trendMessage}</div>
              <p className="hero-balance-copy">
                {currentMonthLabel} כולל {summary.counts.all} תנועות. המאזן מחושב ישירות מהכנסות פחות הוצאות קבועות ומשתנות שכבר נרשמו.
              </p>
            </article>

            <div className="hero-kpis">
              <article className="editorial-stat-card">
                <div className="metric-icon expense">↑</div>
                <div>
                  <div className="metric-title">הוצאה חודשית</div>
                  <div className="metric-value">{formatILS(summary.totals.expenses)}</div>
                </div>
                <div className="metric-accent expense">
                  <span style={{ width: `${expenseAccent}%` }} />
                </div>
              </article>

              <article className="editorial-stat-card">
                <div className="metric-icon income">↓</div>
                <div>
                  <div className="metric-title">הכנסה חודשית</div>
                  <div className="metric-value">{formatILS(summary.totals.income)}</div>
                </div>
                <div className="metric-accent income">
                  <span style={{ width: `${incomeAccent}%` }} />
                </div>
              </article>
            </div>
          </div>

          <article className="hero-focus-card">
            <div className="hero-focus-head">
              <div>
                <div className="hero-focus-kicker">מדד חיסכון</div>
                <div className="hero-focus-title">איזון חודשי</div>
              </div>
              <div className="hero-focus-kicker">{currentMonthLabel}</div>
            </div>

            <div className="hero-focus-value">{summary.savingsRate === null ? "אין בסיס" : `${savingsPercent}%`}</div>
            <div>{summary.savingsRate === null ? "המערכת מחכה לפחות להכנסה אחת כדי לחשב יחס חיסכון." : `${formatILS(summary.totals.balance)} נותרו אחרי כל ההוצאות.`}</div>

            <div>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span>התקדמות חודש</span>
                <strong>{toPercent(summary.progress.progress)}%</strong>
              </div>
              <div className="progress-track" style={{ marginTop: 10 }}>
                <div className="progress-fill" style={{ width: `${toPercent(summary.progress.progress)}%` }} />
              </div>
            </div>
          </article>
        </section>

        <section className="summary-grid compact-grid">
          {insights.map((insight) => (
            <article key={insight.title} className={`summary-card ${insight.tone}`}>
              <div className="summary-label">{insight.title}</div>
              <div className="summary-value small">{insight.value}</div>
              <div className="summary-hint">{insight.detail}</div>
            </article>
          ))}
        </section>

        <section className="dashboard-main-grid">
          <article className="card trend-card">
            <div className="section-header compact">
              <div>
                <div className="section-title">מגמות פיננסיות</div>
                <div className="section-subtitle">תצוגת הוצאות משתנות לששת החודשים האחרונים, עם דגש על החודש הנבחר.</div>
              </div>
              <div className="header-chip subtle">{currentMonthLabel}</div>
            </div>

            <div className="trend-stage">
              {isTrendLoading ? (
                <div className="muted">טוען מגמה...</div>
              ) : !showCharts ? (
                <div className="muted">מכין את הגרף...</div>
              ) : trend.length === 0 ? (
                <div className="empty-panel">אין מספיק נתונים להצגת מגמה.</div>
              ) : (
                <Bar
                  data={{
                    labels: trend.map((point) => formatTrendLabel(point.month)),
                    datasets: [
                      {
                        data: trend.map((point) => point.value),
                        backgroundColor: trend.map((point) =>
                          point.month === monthKey ? "rgba(45, 63, 226, 0.92)" : "rgba(223, 228, 255, 0.95)"
                        ),
                        borderRadius: 18,
                        borderSkipped: false,
                        maxBarThickness: 52,
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: false },
                      tooltip: {
                        callbacks: {
                          label: (context) => formatILS(context.raw as number),
                        },
                      },
                    },
                    scales: {
                      x: {
                        grid: { display: false },
                        border: { display: false },
                        ticks: {
                          color: "#7b8095",
                          font: { weight: 700 },
                        },
                      },
                      y: {
                        display: false,
                        grid: { display: false },
                        border: { display: false },
                      },
                    },
                  }}
                />
              )}
            </div>

            <div className="trend-meta-list">
              <div className="section-subtitle">קטגוריות מובילות בהוצאה משתנה</div>
              {variableByCategory.length === 0 ? (
                <div className="muted">אין כרגע קטגוריות להצגה.</div>
              ) : (
                <div className="category-bars">
                  {variableByCategory.map((item) => {
                    const width = Math.max(
                      16,
                      Math.round((item.value / Math.max(variableByCategory[0]?.value || 1, 1)) * 100)
                    );

                    return (
                      <div key={item.category} className="category-row">
                        <div className="category-meta">
                          <span>{item.category}</span>
                          <strong>{formatILS(item.value)}</strong>
                        </div>
                        <div className="category-track">
                          <div className="category-fill" style={{ width: `${width}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </article>

          <aside className="dashboard-side-rail">
            <article className="card">
              <div className="section-header compact">
                <div>
                  <div className="section-title">פעילות אחרונה</div>
                  <div className="section-subtitle">ארבע התנועות האחרונות שנקלטו במסך החודשי.</div>
                </div>
                <Link className="btn secondary" to="/transactions">
                  הכל
                </Link>
              </div>

              <div className="activity-feed">
                {state === "loading" || isMonthPending ? <div className="muted">טוען פעילות...</div> : null}
                {state !== "loading" && recentActivity.length === 0 ? <div className="empty-panel">עדיין אין תנועות בחודש שנבחר.</div> : null}

                {recentActivity.map((entry) => {
                  const tone = getEntryTone(entry);
                  const installmentLabel = getInstallmentLabel(entry);
                  const lifecycle = getEntryLifecycle(entry, todayISO());
                  const amountTone = entry.type === "income" ? "income" : "expense";

                  return (
                    <div key={entry.id} className="activity-item">
                      <div className="activity-item-main">
                        <div className={`activity-icon${entry.type === "income" ? " income" : ""}`}>{entryGlyph(entry)}</div>
                        <div>
                          <div className="activity-title">{entry.category || "ללא קטגוריה"}</div>
                          <div className="activity-time">
                            {entry.description || getEntryTypeLabel(entry)}
                            {entry.date ? ` | ${formatShortDate(String(entry.date))}` : ""}
                          </div>
                          <div className="badge-row" style={{ marginTop: 8 }}>
                            <span className={`status-pill ${tone}`}>{getEntryTypeLabel(entry)}</span>
                            {lifecycle === "scheduled" ? <span className="status-pill warn">מתוזמן</span> : null}
                            {installmentLabel ? <span className="status-pill neutral">תשלום {installmentLabel}</span> : null}
                          </div>
                        </div>
                      </div>

                      <div className={`activity-amount ${amountTone}`}>
                        {entry.type === "income" ? "+" : "-"}
                        {formatILS(Number(entry.amount || 0))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>

            <article className="insight-panel">
              <div className="insight-panel-title">תובנה שבועית</div>
              <div>
                {summary.topVariableCategory
                  ? `הקטגוריה "${summary.topVariableCategory.category}" מובילה את ההוצאה המשתנה החודשית. אם תרצה לצמצם חריגה, זו הנקודה הראשונה לבדיקה.`
                  : "לא נרשמו עדיין הוצאות משתנות החודש, ולכן מסך הבקרה נשאר נקי ומבוקר."}
              </div>
            </article>
          </aside>
        </section>
      </div>

      <ImportEntriesModal
        open={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        monthKey={monthKey}
        defaultDateISO={todayISO()}
        onSaved={(savedMonthKey) => {
          if (savedMonthKey && savedMonthKey !== monthKey) {
            setMonthKey(savedMonthKey);
          }
          setReloadToken((value) => value + 1);
        }}
      />
    </AppLayout>
  );
}
