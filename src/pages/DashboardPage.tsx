import React, { useEffect, useMemo, useState, useTransition } from "react";
import { ArcElement, BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Tooltip } from "chart.js";
import { Bar, Doughnut } from "react-chartjs-2";
import { Link } from "react-router-dom";
import AppLayout from "../app/layout/AppLayout";
import ImportEntriesModal from "../components/entry/ImportEntriesModal";
import { buildDashboardInsights, groupVariableExpensesByCategory, summarizeMonthlyEntries } from "../domain/analytics";
import { getEntryLifecycle, getEntryTone, getEntryTypeLabel, getInstallmentLabel } from "../domain/entries";
import { ensureFixedRealizationsForMonth, listAvailableMonthKeys, listMonthEntries, listVariableExpenseTrend } from "../services/recordsService";
import type { EntryDoc } from "../types/models";
import { currentMonthKey, formatMonthKey, listRecentMonthKeys, todayISO } from "../utils/dates";
import { formatILS } from "../utils/money";

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

const chartPalette = ["#c9a84c", "#f87171", "#4ade80", "#60a5fa", "#a78bfa", "#fb7185", "#34d399", "#fbbf24"];

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
          if (!cancelled) {
            setShowCharts(true);
          }
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
          if (cancelled) return;

          setEntries(refreshedEntries);
        } catch {
          // The main month data is already visible, so background hydration should not interrupt the screen.
        }
      })();

      try {
        const variableTrend = await listVariableExpenseTrend(trendMonths);
        if (cancelled) return;
        setTrend(variableTrend);
      } catch {
        if (cancelled) return;
        setTrend([]);
      } finally {
        if (!cancelled) {
          setIsTrendLoading(false);
        }
      }
    }

    loadDashboard();
    return () => {
      cancelled = true;
      window.clearTimeout(chartTimer);
    };
  }, [monthKey, reloadToken, trendMonths]);

  const summary = useMemo(() => summarizeMonthlyEntries(entries, monthKey), [entries, monthKey]);
  const insights = useMemo(() => buildDashboardInsights(summary), [summary]);
  const variableByCategory = useMemo(() => groupVariableExpensesByCategory(entries).slice(0, 6), [entries]);
  const recentActivity = useMemo(() => summary.recentActivity.slice(0, 6), [summary.recentActivity]);

  const balanceBorder =
    summary.totals.balance > 0
      ? "6px solid var(--success)"
      : summary.totals.balance < 0
        ? "6px solid var(--danger)"
        : undefined;

  return (
    <AppLayout title="דשבורד">
      <div className="page-stack">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div className="row" style={{ gap: 10, alignItems: "center" }}>
            <Link className="btn" to="/add">
              הוספת תנועה
            </Link>
            <button className="btn secondary" type="button" onClick={() => setIsImportOpen(true)} disabled={state === "loading" || isMonthPending}>
              הוספת קובץ
            </button>
            <Link className="btn secondary" to="/transactions">
              לכל התנועות
            </Link>
          </div>

          <div className="row" style={{ gap: 10, alignItems: "center" }}>
            <div className="muted" style={{ fontSize: 12 }}>
              חודש
            </div>
            <select
              className="input"
              style={{ width: 180 }}
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
          <div className="note-banner">החודש הנוכחי ללא נתונים, ולכן מוצג אוטומטית החודש האחרון עם תנועות.</div>
        ) : null}
        {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}

        <div style={{ maxWidth: 1100, margin: "0 auto", width: "100%" }}>
          <div style={{ marginBottom: 14 }}>
            <div className="card" style={{ borderLeft: balanceBorder }}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 900 }}>יתרה חודשית</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    הכנסות פחות הוצאות קבועות והוצאות משתנות
                  </div>
                </div>
                <div
                  style={{
                    fontSize: "clamp(1.7rem, 3vw, 2.5rem)",
                    fontWeight: 900,
                    color:
                      summary.totals.balance > 0
                        ? "rgba(34,197,94,0.95)"
                        : summary.totals.balance < 0
                          ? "rgba(239,68,68,0.95)"
                          : undefined,
                  }}
                >
                  {formatILS(summary.totals.balance)}
                </div>
              </div>
            </div>
          </div>

          <div className="kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
            <div className="card">
              <div style={{ fontWeight: 900 }}>הכנסות</div>
              <div style={{ fontSize: "1.8rem", fontWeight: 900, marginTop: 10, color: "var(--success)" }}>{formatILS(summary.totals.income)}</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>השלב הראשון בחישוב היתרה החודשית</div>
            </div>
            <div className="card">
              <div style={{ fontWeight: 900 }}>הוצאות קבועות</div>
              <div style={{ fontSize: "1.8rem", fontWeight: 900, marginTop: 10, color: "var(--primary)" }}>{formatILS(summary.totals.fixed)}</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>תשלומים חוזרים והתחייבויות קבועות</div>
            </div>
            <div className="card">
              <div style={{ fontWeight: 900 }}>הוצאות משתנות</div>
              <div style={{ fontSize: "1.8rem", fontWeight: 900, marginTop: 10, color: "var(--danger)" }}>{formatILS(summary.totals.variable)}</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>קניות, דלק, בילויים והוצאות שוטפות</div>
            </div>
          </div>
        </div>

        <section className="summary-grid compact-grid">
          {insights.map((insight) => (
            <article key={insight.title} className={`summary-card ${insight.tone === "good" ? "positive" : insight.tone === "warn" ? "negative" : "neutral"}`}>
              <div className="summary-label">{insight.title}</div>
              <div className="summary-value small">{insight.value}</div>
              <div className="summary-hint">{insight.detail}</div>
            </article>
          ))}
        </section>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
            gap: 24,
            marginTop: 2,
            marginBottom: 2,
          }}
        >
          <div className="card">
            <h3 style={{ marginBottom: 12 }}>הוצאות משתנות לפי קטגוריות</h3>

            {variableByCategory.length === 0 ? (
              <div className="muted">אין נתונים להצגה</div>
            ) : !showCharts ? (
              <div className="muted">Loading chart...</div>
            ) : (
              <div style={{ filter: "drop-shadow(0px 6px 10px rgba(0,0,0,0.25))" }}>
                <div style={{ filter: "drop-shadow(0 18px 28px rgba(0,0,0,0.28))" }}>
                  <Doughnut
                    data={{
                      labels: variableByCategory.map((item) => item.category),
                      datasets: [
                        {
                          data: variableByCategory.map((item) => item.value),
                          backgroundColor: chartPalette,
                          borderWidth: 0,
                          hoverOffset: 18,
                        },
                      ],
                    }}
                    options={{
                      cutout: "48%",
                      rotation: -40,
                      animation: {
                        animateRotate: true,
                        duration: 900,
                      },
                      plugins: {
                        legend: {
                          position: "bottom",
                          labels: {
                            padding: 18,
                            color: "#d4c9b0",
                          },
                        },
                        tooltip: {
                          callbacks: {
                            label: (context) => `${context.label}: ${formatILS(context.raw as number)}`,
                          },
                        },
                      },
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <h3 style={{ marginBottom: 12 }}>הוצאות משתנות - השוואה חודשית</h3>

            {isTrendLoading ? (
              <div className="muted">טוען נתוני מגמה...</div>
            ) : !showCharts ? (
              <div className="muted">Loading chart...</div>
            ) : trend.length === 0 ? (
              <div className="muted">אין נתונים להצגה</div>
            ) : (
              <Bar
                data={{
                  labels: trend.map((point) => point.month),
                  datasets: [
                    {
                      data: trend.map((point) => point.value),
                      backgroundColor: "rgba(201,168,76,0.8)",
                      borderRadius: 14,
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
                  elements: {
                    bar: { borderWidth: 0 },
                  },
                  scales: {
                    x: {
                      ticks: {
                        autoSkip: false,
                        maxRotation: 0,
                        minRotation: 0,
                        color: "#6b6258",
                      },
                      grid: { color: "rgba(255,255,255,0.05)" },
                    },
                    y: {
                      ticks: {
                        color: "#6b6258",
                        callback: (value) => formatILS(Number(value)),
                      },
                      grid: { color: "rgba(255,255,255,0.05)" },
                    },
                  },
                }}
              />
            )}
          </div>
        </div>

        <div className="card">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontWeight: 900 }}>פעילות אחרונה</div>
            <Link className="btn secondary" to="/transactions">
              יומן מלא
            </Link>
          </div>

          <div style={{ height: 10 }} />

          {state === "loading" || isMonthPending ? <div className="muted">טוען...</div> : null}
          {state !== "loading" && recentActivity.length === 0 ? <div className="muted">אין נתונים לחודש הזה.</div> : null}

          <div style={{ display: "grid", gap: 10 }}>
            {recentActivity.map((entry) => {
              const tone = getEntryTone(entry);
              const installmentLabel = getInstallmentLabel(entry);
              const lifecycle = getEntryLifecycle(entry, todayISO());

              return (
                <div
                  key={entry.id}
                  style={{
                    borderLeft:
                      entry.type === "income"
                        ? "4px solid var(--success)"
                        : tone === "fixed"
                          ? "4px solid var(--primary)"
                          : "4px solid var(--danger)",
                    borderRadius: 18,
                    border: "1px solid var(--line)",
                    borderLeftWidth: 4,
                    background: "rgba(255,255,255,0.03)",
                    padding: 14,
                  }}
                >
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 900 }}>{entry.category || "ללא קטגוריה"}</div>
                      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                        {entry.description || getEntryTypeLabel(entry)}
                      </div>
                    </div>

                    <div
                      style={{
                        fontWeight: 900,
                        color:
                          entry.type === "income"
                            ? "var(--success)"
                            : tone === "fixed"
                              ? "var(--primary)"
                              : "var(--danger)",
                      }}
                    >
                      {entry.type === "income" ? "+" : "-"}
                      {formatILS(Number(entry.amount || 0))}
                    </div>
                  </div>

                  <div className="row" style={{ justifyContent: "space-between", marginTop: 8, gap: 12 }}>
                    <div className="muted" style={{ fontSize: 12 }}>{entry.date}</div>
                    <div className="badge-row">
                      <span className={`status-pill ${tone}`}>{getEntryTypeLabel(entry)}</span>
                      {lifecycle === "scheduled" ? <span className="status-pill warn">מתוזמן</span> : null}
                      {installmentLabel ? <span className="status-pill neutral">תשלום {installmentLabel}</span> : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
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
