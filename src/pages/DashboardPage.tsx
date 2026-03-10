import React, { useEffect, useMemo, useState, useTransition } from "react";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
} from "chart.js";
import { Bar, Doughnut } from "react-chartjs-2";
import { Link } from "react-router-dom";
import AppLayout from "../app/layout/AppLayout";
import ImportEntriesModal from "../components/entry/ImportEntriesModal";
import { buildDashboardInsights, groupVariableExpensesByCategory, summarizeMonthlyEntries } from "../domain/analytics";
import { getEntryLifecycle, getEntryTone, getEntryTypeLabel, getInstallmentLabel } from "../domain/entries";
import { listAvailableMonthKeys, listMonthEntries, listVariableExpenseTrend } from "../services/recordsService";
import type { EntryDoc } from "../types/models";
import { currentMonthKey, formatMonthKey, listRecentMonthKeys, todayISO } from "../utils/dates";
import { formatILS } from "../utils/money";

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

const chartPalette = ["#0f766e", "#0891b2", "#2563eb", "#059669", "#ca8a04", "#ea580c"];

type LoadState = "idle" | "loading" | "ready" | "error";

function mergeMonthOptions(primary: string[], secondary: string[]): string[] {
  return Array.from(new Set([...primary, ...secondary])).sort((left, right) => right.localeCompare(left));
}

export default function DashboardPage() {
  const currentMonth = currentMonthKey();
  const [monthKey, setMonthKey] = useState<string>(currentMonth);
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [entries, setEntries] = useState<EntryDoc[]>([]);
  const [trend, setTrend] = useState<Array<{ month: string; value: number }>>([]);
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
    let cancelled = false;

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

    loadMonthAvailability();
    return () => {
      cancelled = true;
    };
  }, [reloadToken, currentMonth, monthKey]);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      setState("loading");
      setErrorMessage("");

      try {
        const [monthEntries, variableTrend] = await Promise.all([
          listMonthEntries(monthKey),
          listVariableExpenseTrend(trendMonths),
        ]);

        if (cancelled) return;
        setEntries(monthEntries);
        setTrend(variableTrend);
        setState("ready");
      } catch (error: any) {
        if (cancelled) return;
        setEntries([]);
        setTrend([]);
        setState("error");
        setErrorMessage(error?.message || "לא הצלחנו לטעון את הסקירה החודשית.");
      }
    }

    loadDashboard();
    return () => {
      cancelled = true;
    };
  }, [monthKey, reloadToken, trendMonths]);

  const summary = useMemo(() => summarizeMonthlyEntries(entries, monthKey), [entries, monthKey]);
  const insights = useMemo(() => buildDashboardInsights(summary), [summary]);
  const variableByCategory = useMemo(() => groupVariableExpensesByCategory(entries).slice(0, 6), [entries]);
  const recentActivity = useMemo(() => summary.recentActivity.slice(0, 6), [summary.recentActivity]);

  const progressPercent = Math.round(summary.progress.progress * 100);
  const expenseLoadPercent = summary.expenseLoad === null ? null : Math.round(summary.expenseLoad * 100);
  const balanceTone = summary.totals.balance >= 0 ? "positive" : "negative";

  return (
    <AppLayout
      title="סקירה תפעולית"
      subtitle="מבנה עבודה של מרכז בקרה: חודש נבחר, תובנות, התחייבויות ותנועות אחרונות."
    >
      <div className="page-stack">
        <section className="hero-panel">
          <div className="hero-copy">
            <div className="eyebrow">Monthly cockpit</div>
            <h2 className="hero-title">{formatMonthKey(monthKey)}</h2>
            <p className="hero-text">
              תמונת מצב אחת שמרכזת איזון חודשי, קצב הוצאות, התחייבויות קבועות ופעולות מהירות להמשך עבודה.
            </p>

            <div className="toolbar-actions">
              <Link className="btn" to="/add">
                תנועה ידנית
              </Link>
              <button className="btn secondary" type="button" onClick={() => setIsImportOpen(true)}>
                ייבוא קובץ
              </button>
              <Link className="btn secondary" to="/transactions">
                לכל היומן
              </Link>
            </div>
          </div>

          <div className="hero-side card-shell">
            <div className="field-stack">
              <label>חודש ניתוח</label>
              <select
                className="input"
                value={monthKey}
                onChange={(event) => startMonthTransition(() => setMonthKey(event.target.value))}
              >
                {monthOptions.map((optionMonthKey: string) => (
                  <option key={optionMonthKey} value={optionMonthKey}>
                    {formatMonthKey(optionMonthKey)}
                  </option>
                ))}
              </select>
            </div>

            <div className={`hero-balance ${balanceTone}`}>
              <div className="hero-balance-label">יתרה חודשית</div>
              <div className="hero-balance-value">{formatILS(summary.totals.balance)}</div>
              <div className="hero-balance-sub">
                {summary.totals.balance >= 0
                  ? "היתרה מחושבת מתוך ההכנסות פחות ההוצאות הקבועות ופחות ההוצאות המשתנות שנשמרו ב-Firebase לחודש הזה."
                  : "היתרה מחושבת מתוך הנתונים השמורים ב-Firebase לחודש הזה, וכרגע ההוצאות גבוהות מההכנסות."}
              </div>
            </div>

            <div className="mini-metrics">
              <div className="mini-metric">
                <span className="mini-label">התקדמות חודש</span>
                <strong>{progressPercent}%</strong>
                <span className="mini-sub">{summary.progress.remainingDays} ימים נותרו</span>
              </div>
              <div className="mini-metric">
                <span className="mini-label">תנועות רשומות</span>
                <strong>{summary.counts.all}</strong>
                <span className="mini-sub">
                  {summary.counts.expense} הוצאות, {summary.counts.income} הכנסות
                </span>
              </div>
              <div className="mini-metric">
                <span className="mini-label">קצב הוצאה</span>
                <strong>{expenseLoadPercent === null ? "--" : `${expenseLoadPercent}%`}</strong>
                <span className="mini-sub">מול ההכנסות שכבר נרשמו</span>
              </div>
            </div>
          </div>
        </section>

        {availableMonths.length > 0 && !availableMonths.includes(currentMonth) ? (
          <div className="note-banner">החודש הנוכחי עדיין ללא תנועות. מוצג אוטומטית החודש האחרון שבו קיימים נתונים.</div>
        ) : null}
        {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}
        {state === "loading" || isMonthPending ? <div className="note-banner">טוען את מרכז הבקרה של החודש...</div> : null}

        <section className="summary-grid">
          <article className={`summary-card ${balanceTone}`}>
            <div className="summary-label">יתרה חודשית</div>
            <div className="summary-value">{formatILS(summary.totals.balance)}</div>
            <div className="summary-hint">הכנסות פחות הוצאות קבועות ופחות הוצאות משתנות</div>
          </article>

          <article className="summary-card neutral">
            <div className="summary-label">הוצאות משתנות</div>
            <div className="summary-value">{formatILS(summary.totals.variable)}</div>
            <div className="summary-hint">סך ההוצאות המשתנות שנרשמו בחודש הזה</div>
          </article>

          <article className="summary-card neutral">
            <div className="summary-label">קבועות לחודש</div>
            <div className="summary-value">{formatILS(summary.totals.fixed)}</div>
            <div className="summary-hint">מהן {formatILS(summary.totals.scheduledFixed)} עדיין מתוזמנות</div>
          </article>

          <article className="summary-card neutral">
            <div className="summary-label">הכנסות</div>
            <div className="summary-value">{formatILS(summary.totals.income)}</div>
            <div className="summary-hint">רק מה שכבר נרשם במערכת</div>
          </article>
        </section>

        <section className="section-block">
          <div className="section-header">
            <div>
              <div className="section-title">סיגנלים תפעוליים</div>
              <div className="section-subtitle">הנקודות שהכי חשוב לראות בתחילת העבודה על החודש.</div>
            </div>
          </div>

          <div className="insight-grid">
            {insights.map((insight) => (
              <article key={insight.title} className={`insight-card ${insight.tone}`}>
                <div className="summary-label">{insight.title}</div>
                <div className="summary-value small">{insight.value}</div>
                <div className="summary-hint">{insight.detail}</div>
              </article>
            ))}
          </div>
        </section>

        <section className="chart-grid">
          <article className="card chart-card">
            <div className="section-header compact">
              <div>
                <div className="section-title">פיזור הוצאות משתנות</div>
                <div className="section-subtitle">זיהוי מה מושך את רוב ההוצאה החופשית.</div>
              </div>
            </div>

            {variableByCategory.length ? (
              <>
                <div className="chart-box">
                  <Doughnut
                    data={{
                      labels: variableByCategory.map((item) => item.category),
                      datasets: [
                        {
                          data: variableByCategory.map((item) => item.value),
                          backgroundColor: chartPalette,
                          borderWidth: 0,
                          hoverOffset: 12,
                        },
                      ],
                    }}
                    options={{
                      cutout: "62%",
                      plugins: {
                        legend: { position: "bottom" },
                        tooltip: {
                          callbacks: {
                            label: (context) => `${context.label}: ${formatILS(context.raw as number)}`,
                          },
                        },
                      },
                    }}
                  />
                </div>

                <div className="category-bars">
                  {variableByCategory.slice(0, 4).map((item) => {
                    const width = summary.totals.variable > 0 ? (item.value / summary.totals.variable) * 100 : 0;
                    return (
                      <div key={item.category} className="category-row">
                        <div className="category-meta">
                          <span>{item.category}</span>
                          <strong>{formatILS(item.value)}</strong>
                        </div>
                        <div className="category-track">
                          <div className="category-fill" style={{ width: `${Math.max(width, 8)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="empty-panel">עדיין אין הוצאות משתנות לחודש הזה.</div>
            )}
          </article>

          <article className="card chart-card">
            <div className="section-header compact">
              <div>
                <div className="section-title">מגמת הוצאות משתנות</div>
                <div className="section-subtitle">תצוגת שישה חודשים כדי לראות אם הקצב יציב או מטפס.</div>
              </div>
            </div>

            {trend.length ? (
              <div className="chart-box tall">
                <Bar
                  data={{
                    labels: trend.map((point) => point.month),
                    datasets: [
                      {
                        data: trend.map((point) => point.value),
                        backgroundColor: "rgba(15,118,110,0.85)",
                        borderRadius: 16,
                        borderSkipped: false,
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    plugins: {
                      legend: { display: false },
                      tooltip: {
                        callbacks: {
                          label: (context) => formatILS(context.raw as number),
                        },
                      },
                    },
                    scales: {
                      y: {
                        ticks: {
                          callback: (value) => formatILS(Number(value)),
                        },
                      },
                    },
                  }}
                />
              </div>
            ) : (
              <div className="empty-panel">אין מספיק נתונים היסטוריים להצגת מגמה.</div>
            )}
          </article>
        </section>

        <section className="card">
          <div className="section-header">
            <div>
              <div className="section-title">פעילות אחרונה</div>
              <div className="section-subtitle">השורות האחרונות שנכנסו או עודכנו בחודש הנבחר.</div>
            </div>
            <Link className="btn secondary" to="/transactions">
              יומן מלא
            </Link>
          </div>

          {!recentActivity.length ? (
            <div className="empty-panel">אין עדיין תנועות לחודש הזה. אפשר להתחיל מקליטה ידנית או מייבוא קובץ.</div>
          ) : (
            <div className="activity-list">
              {recentActivity.map((entry) => {
                const tone = getEntryTone(entry);
                const installmentLabel = getInstallmentLabel(entry);
                const lifecycle = getEntryLifecycle(entry, todayISO());

                return (
                  <article key={entry.id} className={`activity-row ${tone}`}>
                    <div className="activity-main">
                      <div>
                        <div className="activity-title">{entry.category || "ללא קטגוריה"}</div>
                        <div className="activity-subtitle">{entry.description || getEntryTypeLabel(entry)}</div>
                      </div>

                      <div className={`activity-amount ${tone}`}>
                        {entry.type === "income" ? "+" : "-"}
                        {formatILS(Number(entry.amount || 0))}
                      </div>
                    </div>

                    <div className="activity-meta-row">
                      <div className="activity-date">{entry.date}</div>
                      <div className="badge-row">
                        <span className={`status-pill ${tone}`}>{getEntryTypeLabel(entry)}</span>
                        {lifecycle === "scheduled" ? <span className="status-pill warn">מתוזמן</span> : null}
                        {installmentLabel ? <span className="status-pill neutral">תשלום {installmentLabel}</span> : null}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <ImportEntriesModal
        open={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        monthKey={monthKey}
        defaultDateISO={todayISO()}
        onSaved={() => setReloadToken((value) => value + 1)}
      />
    </AppLayout>
  );
}

