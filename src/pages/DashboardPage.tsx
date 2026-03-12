import React, { useEffect, useMemo, useState, useTransition } from "react";
import { ArcElement, BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Tooltip } from "chart.js";
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

const chartPalette = ["#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#0891b2", "#2563eb", "#7c3aed", "#be185d"];

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

  const cardStyle = {
    background: "linear-gradient(180deg, #ffffff, #f8fafc)",
    borderRadius: 20,
    boxShadow: "0 30px 60px rgba(0,0,0,0.18)",
  };

  const balanceBorder =
    summary.totals.balance > 0
      ? "6px solid rgba(34,197,94,0.95)"
      : summary.totals.balance < 0
        ? "6px solid rgba(239,68,68,0.95)"
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

        <div className="muted" style={{ fontSize: 12 }}>
          תצוגה חודשית. הכרטיסיות והגרפים מתעדכנים אוטומטית לפי החודש שנבחר.
        </div>

        <div
          className="card"
          style={{
            ...cardStyle,
            padding: 10,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 10,
          }}
        >
          <button className="btn" type="button" onClick={() => setIsImportOpen(true)} disabled={state === "loading" || isMonthPending}>
            פתיחת ייבוא קובץ
          </button>
          <Link className="btn secondary" to="/transactions">
            מעבר ליומן מלא
          </Link>
          <div className="muted" style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700 }}>
            {state === "loading" || isMonthPending ? "טוען נתוני חודש..." : `סקירה עבור ${formatMonthKey(monthKey)}`}
          </div>
        </div>

        {availableMonths.length > 0 && !availableMonths.includes(currentMonth) ? (
          <div className="note-banner">החודש הנוכחי ללא נתונים, ולכן מוצג אוטומטית החודש האחרון עם תנועות.</div>
        ) : null}
        {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}

        <div style={{ maxWidth: 1100, margin: "0 auto", width: "100%" }}>
          <div style={{ marginBottom: 14 }}>
            <div className="card" style={{ ...cardStyle, borderLeft: balanceBorder }}>
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
            <div className="card" style={cardStyle}>
              <div style={{ fontWeight: 900 }}>הכנסות</div>
              <div style={{ fontSize: "1.8rem", fontWeight: 900, marginTop: 10 }}>{formatILS(summary.totals.income)}</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>השלב הראשון בחישוב היתרה החודשית</div>
            </div>
            <div className="card" style={cardStyle}>
              <div style={{ fontWeight: 900 }}>הוצאות קבועות</div>
              <div style={{ fontSize: "1.8rem", fontWeight: 900, marginTop: 10 }}>{formatILS(summary.totals.fixed)}</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>תשלומים חוזרים והתחייבויות קבועות</div>
            </div>
            <div className="card" style={cardStyle}>
              <div style={{ fontWeight: 900 }}>הוצאות משתנות</div>
              <div style={{ fontSize: "1.8rem", fontWeight: 900, marginTop: 10 }}>{formatILS(summary.totals.variable)}</div>
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
          <div className="card" style={cardStyle}>
            <h3 style={{ marginBottom: 12 }}>הוצאות משתנות לפי קטגוריות</h3>

            {variableByCategory.length === 0 ? (
              <div className="muted">אין נתונים להצגה</div>
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

          <div className="card" style={cardStyle}>
            <h3 style={{ marginBottom: 12 }}>הוצאות משתנות - השוואה חודשית</h3>

            {trend.length === 0 ? (
              <div className="muted">אין נתונים להצגה</div>
            ) : (
              <Bar
                data={{
                  labels: trend.map((point) => point.month),
                  datasets: [
                    {
                      data: trend.map((point) => point.value),
                      backgroundColor: "rgba(239,68,68,0.85)",
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
                      },
                    },
                    y: {
                      ticks: {
                        callback: (value) => formatILS(Number(value)),
                      },
                    },
                  },
                }}
              />
            )}
          </div>
        </div>

        <div className="card" style={cardStyle}>
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
                        ? "4px solid rgba(34,197,94,0.95)"
                        : tone === "fixed"
                          ? "4px solid rgba(168,85,247,0.95)"
                          : "4px solid rgba(239,68,68,0.95)",
                    borderRadius: 18,
                    borderTop: "1px solid rgba(15,23,42,0.08)",
                    borderRight: "1px solid rgba(15,23,42,0.08)",
                    borderBottom: "1px solid rgba(15,23,42,0.08)",
                    background: "rgba(255,255,255,0.94)",
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
                            ? "rgba(34,197,94,0.95)"
                            : tone === "fixed"
                              ? "rgba(168,85,247,0.95)"
                              : "rgba(239,68,68,0.95)",
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
