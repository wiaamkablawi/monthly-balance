import React, { useEffect, useMemo, useState, useTransition } from "react";
import { Link, useSearchParams } from "react-router-dom";
import BottomNav from "../components/BottomNav";
import ImportEntriesModal from "../components/entry/ImportEntriesModal";
import { groupVariableExpensesByCategory, summarizeMonthlyEntries } from "../domain/analytics";
import { getEntryLifecycle, isFixedExpense, sortEntriesByDisplayDate } from "../domain/entries";
import {
  listAvailableMonthKeys,
  listMonthEntries,
  listVariableExpenseTrend,
  subscribeRecordsState,
} from "../services/recordsService";
import { displayNameFromEmail } from "../services/authService";
import { auth } from "../services/firebase";
import type { EntryDoc } from "../types/models";
import { currentMonthKey, formatMonthKey, listRecentMonthKeys, todayISO } from "../utils/dates";

type LoadState = "idle" | "loading" | "ready" | "error";

const HEBREW_MONTHS_SHORT = ["ינו׳", "פבר׳", "מרץ", "אפר׳", "מאי", "יוני", "יולי", "אוג׳", "ספט׳", "אוק׳", "נוב׳", "דצמ׳"];

const CATEGORY_VISUAL: Record<string, { emoji: string; bg: string; donut: string; bar: string }> = {
  "סופר ומזון": { emoji: "🛒", bg: "#D1FAE5", donut: "#FF7043", bar: "#A78BFA" },
  "מסעדות ובתי קפה": { emoji: "🍽️", bg: "#FEE2E2", donut: "#FF3D8B", bar: "#FB7185" },
  "תחבורה ודלק": { emoji: "⛽", bg: "#E0F2FE", donut: "#FF8C5A", bar: "#60A5FA" },
  "רכב וחניה": { emoji: "🚗", bg: "#E0F2FE", donut: "#FF8C5A", bar: "#60A5FA" },
  "בריאות ופארם": { emoji: "💊", bg: "#FCE7F3", donut: "#FF3D8B", bar: "#F472B6" },
  "ילדים וחינוך": { emoji: "🎒", bg: "#FEF3C7", donut: "#FFB347", bar: "#FBBF24" },
  "בילויים ופנאי": { emoji: "🎬", bg: "#FEE2E2", donut: "#FFB347", bar: "#FB923C" },
  "קניות לבית": { emoji: "🏠", bg: "#FFF0E8", donut: "#FF7043", bar: "#FB923C" },
  "ביגוד והנעלה": { emoji: "👕", bg: "#EDE9FE", donut: "#FF3D8B", bar: "#A78BFA" },
  "נסיעות וחופשות": { emoji: "✈️", bg: "#DBEAFE", donut: "#FF8C5A", bar: "#60A5FA" },
  "מתנות ותרומות": { emoji: "🎁", bg: "#FCE7F3", donut: "#FF3D8B", bar: "#F472B6" },
  "שירותים דיגיטליים": { emoji: "💻", bg: "#E0F2FE", donut: "#FF7043", bar: "#60A5FA" },
  "דיור (שכירות/משכנתא)": { emoji: "🏘️", bg: "#FFF0E8", donut: "#FF7043", bar: "#FB923C" },
  "חשבונות בית": { emoji: "⚡", bg: "#FEF3C7", donut: "#FFB347", bar: "#34D399" },
  "תקשורת ואינטרנט": { emoji: "📡", bg: "#E0F2FE", donut: "#FF8C5A", bar: "#60A5FA" },
  "ביטוחים": { emoji: "🛡️", bg: "#EDE9FE", donut: "#FF3D8B", bar: "#A78BFA" },
  "הלוואות והחזרים": { emoji: "🏦", bg: "#FEE2E2", donut: "#FF3D8B", bar: "#FB7185" },
  "עמלות בנקאיות": { emoji: "💳", bg: "#E0F2FE", donut: "#FF8C5A", bar: "#60A5FA" },
  "משכורת": { emoji: "💼", bg: "#EDE9FE", donut: "#10B981", bar: "#34D399" },
  "החזר": { emoji: "↩️", bg: "#D1FAE5", donut: "#10B981", bar: "#34D399" },
  "מתנה": { emoji: "🎁", bg: "#FCE7F3", donut: "#10B981", bar: "#34D399" },
  "הכנסה נוספת": { emoji: "💰", bg: "#D1FAE5", donut: "#10B981", bar: "#34D399" },
  "אחר": { emoji: "📌", bg: "#FFF0E8", donut: "#FF7043", bar: "#FB923C" },
};

const DEFAULT_VISUAL = { emoji: "📌", bg: "#FFF0E8", donut: "#FF7043", bar: "#FB923C" };

function visualForCategory(category: string) {
  return CATEGORY_VISUAL[category] || DEFAULT_VISUAL;
}

function visualForEntry(entry: EntryDoc) {
  if (entry.type === "income") {
    return CATEGORY_VISUAL[entry.category] || CATEGORY_VISUAL["משכורת"];
  }
  return visualForCategory(entry.category || "אחר");
}

function formatShortHebrewDate(dateISO: string): string {
  if (!dateISO) return "";
  const [yearRaw, monthRaw, dayRaw] = dateISO.split("-").map(Number);
  if (!Number.isFinite(yearRaw) || !Number.isFinite(monthRaw) || !Number.isFinite(dayRaw)) return dateISO;
  const monthName = HEBREW_MONTHS_SHORT[monthRaw - 1] || "";
  return `${dayRaw} ${monthName}`;
}

function formatHeroAmount(amount: number): string {
  return amount.toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatCompactILS(amount: number): string {
  const rounded = Math.round(amount);
  return `₪${rounded.toLocaleString("he-IL")}`;
}

function formatTransactionAmount(amount: number): string {
  const abs = Math.abs(amount);
  return `₪${abs.toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function mergeMonthOptions(primary: string[], secondary: string[]): string[] {
  return Array.from(new Set([...primary, ...secondary])).sort((left, right) => right.localeCompare(left));
}

function shortMonthLabelFromKey(monthKey: string): string {
  const monthIndex = Number(monthKey.split("-")[1]) - 1;
  return HEBREW_MONTHS_SHORT[monthIndex] || monthKey;
}

function DonutChart(props: { data: Array<{ label: string; value: number; color: string }>; centerPct: number }) {
  const { data, centerPct } = props;
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const r = 36;
  const cx = 46;
  const cy = 46;
  const circ = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="mb-donut-wrap">
      <svg width="92" height="92" viewBox="0 0 92 92" aria-hidden="true">
        {total > 0 ? (
          data.map((item, index) => {
            const pct = item.value / total;
            const dash = circ * pct;
            const rotation = offset * 360 - 90;
            offset += pct;
            return (
              <circle
                key={`${item.label}-${index}`}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={item.color}
                strokeWidth={13}
                strokeDasharray={`${dash} ${circ - dash}`}
                transform={`rotate(${rotation} ${cx} ${cy})`}
                strokeLinecap="round"
              />
            );
          })
        ) : (
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#FFE0CC" strokeWidth={13} />
        )}
        <text x={cx} y={cy - 3} textAnchor="middle" fill="#2D1A0E" fontSize="12" fontWeight={700} fontFamily="Rubik">
          {`${centerPct}%`}
        </text>
        <text x={cx} y={cy + 11} textAnchor="middle" fill="#C4997A" fontSize="8" fontFamily="Rubik">
          מנוצל
        </text>
      </svg>
      <div className="mb-donut-legend">
        {data.length === 0 ? (
          <div className="mb-empty">אין הוצאות להצגה</div>
        ) : (
          data.map((item) => (
            <div className="mb-donut-row" key={item.label}>
              <div className="mb-donut-dot" style={{ background: item.color }} />
              <div className="mb-donut-lbl">{item.label}</div>
              <div className="mb-donut-pct">{total > 0 ? Math.round((item.value / total) * 100) : 0}%</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
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
  const [state, setState] = useState<LoadState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [chartView, setChartView] = useState<"donut" | "bars">("donut");
  const [, startMonthTransition] = useTransition();

  const userName = useMemo(() => {
    const user = auth.currentUser;
    if (!user) return "משתמש";
    return user.displayName?.trim() || displayNameFromEmail(user.email || "") || "משתמש";
  }, []);

  const monthOptions = useMemo(
    () => mergeMonthOptions(listRecentMonthKeys(18, currentMonth, "desc"), availableMonths),
    [availableMonths, currentMonth]
  );

  const trendMonths = useMemo(() => listRecentMonthKeys(5, monthKey, "asc"), [monthKey]);

  useEffect(() => {
    return subscribeRecordsState(() => {
      setReloadToken((value) => value + 1);
    });
  }, []);

  useEffect(() => {
    if (state !== "ready") return;
    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      try {
        const months = await listAvailableMonthKeys();
        if (cancelled) return;
        setAvailableMonths(months);
        if (!months.length) return;
        if (!months.includes(currentMonth) && monthKey === currentMonth) {
          setMonthKey(months[0]);
        }
      } catch {
        if (!cancelled) setAvailableMonths([]);
      }
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [reloadToken, currentMonth, monthKey, state]);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      setState("loading");
      setErrorMessage("");
      setTrend([]);

      try {
        const monthEntries = await listMonthEntries(monthKey);
        if (cancelled) return;
        setEntries(monthEntries);
        setState("ready");
      } catch (error: any) {
        if (cancelled) return;
        setEntries([]);
        setTrend([]);
        setState("error");
        setErrorMessage(error?.message || "לא הצלחנו לטעון את הסקירה החודשית.");
        return;
      }

      try {
        const variableTrend = await listVariableExpenseTrend(trendMonths);
        if (!cancelled) setTrend(variableTrend);
      } catch {
        if (!cancelled) setTrend([]);
      }
    }

    void loadDashboard();
    return () => {
      cancelled = true;
    };
  }, [monthKey, reloadToken, trendMonths]);

  const summary = useMemo(() => summarizeMonthlyEntries(entries, monthKey), [entries, monthKey]);
  const variableByCategory = useMemo(() => groupVariableExpensesByCategory(entries), [entries]);
  const recentTransactions = useMemo(() => summary.recentActivity.slice(0, 5), [summary.recentActivity]);

  const totalExpenses = summary.totals.expenses;
  const totalIncome = summary.totals.income;
  const balance = summary.totals.balance;
  const budgetUsedPct =
    totalIncome > 0
      ? Math.max(0, Math.min(100, Math.round((totalExpenses / totalIncome) * 100)))
      : totalExpenses > 0
      ? 100
      : 0;

  const donutData = useMemo(() => {
    if (variableByCategory.length === 0) return [];
    return variableByCategory.slice(0, 5).map((item) => ({
      label: item.category,
      value: item.value,
      color: visualForCategory(item.category).donut,
    }));
  }, [variableByCategory]);

  const barChartData = useMemo(() => {
    if (trend.length === 0) return [];
    const max = Math.max(...trend.map((point) => point.value), 1);
    return trend.map((point) => ({
      monthKey: point.month,
      label: shortMonthLabelFromKey(point.month),
      value: point.value,
      heightPct: (point.value / max) * 100,
    }));
  }, [trend]);

  const budgetItems = useMemo(() => {
    const top = variableByCategory.slice(0, 4);
    if (top.length === 0) return [];
    const reference = Math.max(top[0].value, 1) * 1.5;
    return top.map((item) => {
      const visual = visualForCategory(item.category);
      const budget = Math.max(Math.ceil((reference || item.value) / 100) * 100, 100);
      return {
        category: item.category,
        spent: item.value,
        total: budget,
        color: visual.bar,
      };
    });
  }, [variableByCategory]);

  const fixedExpenses = useMemo(() => {
    const todayIso = todayISO();
    return sortEntriesByDisplayDate(entries.filter((entry) => isFixedExpense(entry))).map((entry) => ({
      entry,
      lifecycle: getEntryLifecycle(entry, todayIso),
    }));
  }, [entries]);

  const heroSubtitle = balance >= 0 ? "עודף תקציב חודשי" : "גרעון בתקציב החודש";
  const monthLabel = formatMonthKey(monthKey);

  const monthSelectDisabled = state === "loading";

  return (
    <>
      <div className="mb-screen">
        <header className="mb-top-row">
          <div>
            <div className="mb-greeting">שלום, {userName} 👋</div>
            <div className="mb-name">מעקב תקציב</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select
              className="mb-month-pick"
              value={monthKey}
              disabled={monthSelectDisabled}
              onChange={(event) => startMonthTransition(() => setMonthKey(event.target.value))}
              aria-label="בחר חודש"
            >
              {monthOptions.map((optionKey) => (
                <option key={optionKey} value={optionKey}>
                  {formatMonthKey(optionKey)}
                </option>
              ))}
            </select>
            <button className="mb-bell" type="button" aria-label="התראות">
              🔔
            </button>
          </div>
        </header>

        {availableMonths.length > 0 && !availableMonths.includes(currentMonth) ? (
          <div className="mb-banner">לחודש הנוכחי אין עדיין תנועות, ולכן מוצג אוטומטית החודש האחרון עם נתונים.</div>
        ) : null}
        {errorMessage ? <div className="mb-banner error">{errorMessage}</div> : null}

        <section className="mb-hero">
          <div className="mb-hero-lbl">יתרה חודשית · {monthLabel}</div>
          <div className="mb-hero-amt">₪{formatHeroAmount(balance)}</div>
          <div className="mb-hero-sub">{heroSubtitle}</div>
          <div className="mb-hero-row">
            <div className="mb-hero-half">
              <div className="mb-hero-hlbl">הכנסות</div>
              <div className="mb-hero-hval">{formatCompactILS(totalIncome)}</div>
            </div>
            <div className="mb-hero-half">
              <div className="mb-hero-hlbl">הוצאות</div>
              <div className="mb-hero-hval">{formatCompactILS(totalExpenses)}</div>
            </div>
          </div>
        </section>

        <div className="mb-qa">
          <Link className="mb-qa-btn" to="/add?type=expense">
            <span className="mb-qa-ico">➕</span>
            <span className="mb-qa-lbl">הוסף הוצאה</span>
          </Link>
          <Link className="mb-qa-btn" to="/add?type=income">
            <span className="mb-qa-ico">💰</span>
            <span className="mb-qa-lbl">הוסף הכנסה</span>
          </Link>
          <button className="mb-qa-btn" type="button" onClick={() => setIsImportOpen(true)}>
            <span className="mb-qa-ico">📋</span>
            <span className="mb-qa-lbl">ייבוא קובץ</span>
          </button>
        </div>

        <section className="mb-section">
          <div className="mb-sec-hdr">
            <div className="mb-sec-ttl">פילוח הוצאות</div>
            <div className="mb-chart-toggle">
              <button
                type="button"
                className={`mb-chart-tbtn${chartView === "donut" ? " on" : ""}`}
                onClick={() => setChartView("donut")}
              >
                עוגה
              </button>
              <button
                type="button"
                className={`mb-chart-tbtn${chartView === "bars" ? " on" : ""}`}
                onClick={() => setChartView("bars")}
              >
                עמודות
              </button>
            </div>
          </div>

          {chartView === "donut" ? (
            <DonutChart data={donutData} centerPct={budgetUsedPct} />
          ) : barChartData.length === 0 ? (
            <div className="mb-empty">אין מספיק נתונים להצגת מגמה.</div>
          ) : (
            <div className="mb-bar-chart">
              {barChartData.map((bar) => {
                const isCurrent = bar.monthKey === monthKey;
                const heightPx = Math.max(6, Math.round((bar.heightPct / 100) * 62));
                return (
                  <div className="mb-bar-col" key={bar.monthKey}>
                    <div className={`mb-bar${isCurrent ? " on" : ""}`} style={{ height: `${heightPx}px` }} />
                    <div className={`mb-bar-lbl${isCurrent ? " on" : ""}`}>{bar.label}</div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="mb-section">
          <div className="mb-sec-hdr">
            <div className="mb-sec-ttl">עסקאות אחרונות</div>
            <Link className="mb-sec-btn" to="/transactions">
              הכל ›
            </Link>
          </div>
          {state === "loading" ? (
            <div className="mb-empty">טוען עסקאות…</div>
          ) : recentTransactions.length === 0 ? (
            <div className="mb-empty">עדיין אין תנועות בחודש שנבחר.</div>
          ) : (
            recentTransactions.map((entry) => {
              const visual = visualForEntry(entry);
              const isIncome = entry.type === "income";
              const sign = isIncome ? "+" : "-";
              return (
                <div className="mb-tx" key={entry.id}>
                  <div className="mb-tx-ico" style={{ background: visual.bg }}>
                    {visual.emoji}
                  </div>
                  <div className="mb-tx-body">
                    <div className="mb-tx-name">{entry.description || entry.category || "ללא קטגוריה"}</div>
                    <div className="mb-tx-cat">
                      {entry.category || "ללא קטגוריה"}
                      {entry.date ? ` · ${formatShortHebrewDate(String(entry.date))}` : ""}
                    </div>
                  </div>
                  <div className={`mb-tx-amt ${isIncome ? "inc" : "exp"}`}>
                    {sign}
                    {formatTransactionAmount(Number(entry.amount || 0))}
                  </div>
                </div>
              );
            })
          )}
        </section>

        <section className="mb-section">
          <div className="mb-sec-hdr">
            <div className="mb-sec-ttl">מעקב תקציב</div>
            <Link className="mb-sec-btn" to="/transactions">
              נהל ›
            </Link>
          </div>
          {budgetItems.length === 0 ? (
            <div className="mb-empty">אין כרגע נתוני הוצאה משתנה להצגה.</div>
          ) : (
            budgetItems.map((item) => {
              const ratio = Math.max(0, Math.min(1, item.spent / item.total));
              return (
                <div className="mb-prog-item" key={item.category}>
                  <div className="mb-prog-row">
                    <div className="mb-prog-cat">{item.category}</div>
                    <div className="mb-prog-nums">
                      ₪{Math.round(item.spent).toLocaleString("he-IL")} / ₪{item.total.toLocaleString("he-IL")}
                    </div>
                  </div>
                  <div className="mb-prog-track">
                    <div
                      className="mb-prog-fill"
                      style={{ width: `${ratio * 100}%`, background: item.color }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </section>

        <section className="mb-section">
          <div className="mb-sec-hdr">
            <div className="mb-sec-ttl">הוצאות קבועות</div>
            <div className="mb-fixed-summary">
              {formatCompactILS(summary.totals.fixed)}
              {summary.totals.scheduledFixed > 0 ? (
                <span className="mb-fixed-pending"> · {formatCompactILS(summary.totals.scheduledFixed)} מתוזמן</span>
              ) : null}
            </div>
          </div>
          {fixedExpenses.length === 0 ? (
            <div className="mb-empty">אין הוצאות קבועות בחודש הנבחר.</div>
          ) : (
            fixedExpenses.map(({ entry, lifecycle }) => {
              const visual = visualForEntry(entry);
              const isScheduled = lifecycle === "scheduled";
              return (
                <div className="mb-tx" key={entry.id}>
                  <div className="mb-tx-ico" style={{ background: visual.bg }}>
                    {visual.emoji}
                  </div>
                  <div className="mb-tx-body">
                    <div className="mb-tx-name">{entry.description || entry.category || "הוצאה קבועה"}</div>
                    <div className="mb-tx-cat">
                      {entry.category || "ללא קטגוריה"}
                      {entry.date ? ` · ${formatShortHebrewDate(String(entry.date))}` : ""}
                      {isScheduled ? " · מתוזמן" : " · ירדה"}
                    </div>
                  </div>
                  <div className={`mb-tx-amt exp${isScheduled ? " scheduled" : ""}`}>
                    -{formatTransactionAmount(Number(entry.amount || 0))}
                  </div>
                </div>
              );
            })
          )}
        </section>
      </div>

      <BottomNav variant="mobile" />

      <ImportEntriesModal
        open={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        monthKey={monthKey}
        defaultDateISO={todayISO()}
        onSaved={(savedMonthKey) => {
          if (savedMonthKey && savedMonthKey !== monthKey) {
            setMonthKey(savedMonthKey);
          }
        }}
      />
    </>
  );
}
