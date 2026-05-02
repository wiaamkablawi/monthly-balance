import React, { useEffect, useMemo, useState, useTransition } from "react";
import { BarElement, CategoryScale, Chart as ChartJS, LinearScale, Tooltip } from "chart.js";
import { Bar } from "react-chartjs-2";
import { Link, useSearchParams } from "react-router-dom";
import AppLayout from "../app/layout/AppLayout";
import BottomNav from "../components/BottomNav";
import ImportEntriesModal from "../components/entry/ImportEntriesModal";
import { groupVariableExpensesByCategory, summarizeMonthlyEntries } from "../domain/analytics";
import { getEntryLifecycle, getEntryTone, getEntryTypeLabel, getInstallmentLabel, isFixedExpense, sortEntriesByDisplayDate } from "../domain/entries";
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
import { formatILS } from "../utils/money";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

type LoadState = "idle" | "loading" | "ready" | "error";

const HEBREW_MONTHS_SHORT = ["ינו׳", "פבר׳", "מרץ", "אפר׳", "מאי", "יוני", "יולי", "אוג׳", "ספט׳", "אוק׳", "נוב׳", "דצמ׳"];

const CATEGORY_VISUAL: Record<string, { emoji: string; bg: string; donut: string; bar: string }> = {
  "סופר ומזון":              { emoji: "🛒", bg: "#D1FAE5", donut: "#FF7043", bar: "#A78BFA" },
  "מסעדות ובתי קפה":         { emoji: "🍽️", bg: "#FEE2E2", donut: "#FF3D8B", bar: "#FB7185" },
  "תחבורה ודלק":             { emoji: "⛽", bg: "#E0F2FE", donut: "#FF8C5A", bar: "#60A5FA" },
  "רכב וחניה":               { emoji: "🚗", bg: "#E0F2FE", donut: "#FF8C5A", bar: "#60A5FA" },
  "בריאות ופארם":            { emoji: "💊", bg: "#FCE7F3", donut: "#FF3D8B", bar: "#F472B6" },
  "ילדים וחינוך":            { emoji: "🎒", bg: "#FEF3C7", donut: "#FFB347", bar: "#FBBF24" },
  "בילויים ופנאי":           { emoji: "🎬", bg: "#FEE2E2", donut: "#FFB347", bar: "#FB923C" },
  "קניות לבית":              { emoji: "🏠", bg: "#FFF0E8", donut: "#FF7043", bar: "#FB923C" },
  "ביגוד והנעלה":            { emoji: "👕", bg: "#EDE9FE", donut: "#FF3D8B", bar: "#A78BFA" },
  "נסיעות וחופשות":          { emoji: "✈️", bg: "#DBEAFE", donut: "#FF8C5A", bar: "#60A5FA" },
  "מתנות ותרומות":           { emoji: "🎁", bg: "#FCE7F3", donut: "#FF3D8B", bar: "#F472B6" },
  "שירותים דיגיטליים":       { emoji: "💻", bg: "#E0F2FE", donut: "#FF7043", bar: "#60A5FA" },
  "מנויים דיגיטליים":        { emoji: "📱", bg: "#EDE9FE", donut: "#FF3D8B", bar: "#A78BFA" },
  "דיור (שכירות/משכנתא)":   { emoji: "🏘️", bg: "#FFF0E8", donut: "#FF7043", bar: "#FB923C" },
  "הלוואות ודיור":           { emoji: "🏦", bg: "#FEF3C7", donut: "#FF7043", bar: "#FB923C" },
  "חשבונות בית":             { emoji: "⚡", bg: "#FEF3C7", donut: "#FFB347", bar: "#34D399" },
  "ביטוחים ובריאות":         { emoji: "🛡️", bg: "#EDE9FE", donut: "#FF3D8B", bar: "#A78BFA" },
  "ביטוחים":                 { emoji: "🛡️", bg: "#EDE9FE", donut: "#FF3D8B", bar: "#A78BFA" },
  "תקשורת ואינטרנט":         { emoji: "📡", bg: "#E0F2FE", donut: "#FF8C5A", bar: "#60A5FA" },
  "תשתיות ותחבורה":          { emoji: "🔧", bg: "#FEF3C7", donut: "#FFB347", bar: "#34D399" },
  "הלוואות והחזרים":         { emoji: "🏦", bg: "#FEE2E2", donut: "#FF3D8B", bar: "#FB7185" },
  "עמלות בנקאיות":           { emoji: "💳", bg: "#E0F2FE", donut: "#FF8C5A", bar: "#60A5FA" },
  "משכורת":                  { emoji: "💼", bg: "#EDE9FE", donut: "#10B981", bar: "#34D399" },
  "החזר":                    { emoji: "↩️", bg: "#D1FAE5", donut: "#10B981", bar: "#34D399" },
  "מתנה":                    { emoji: "🎁", bg: "#FCE7F3", donut: "#10B981", bar: "#34D399" },
  "הכנסה נוספת":             { emoji: "💰", bg: "#D1FAE5", donut: "#10B981", bar: "#34D399" },
  "אחר":                     { emoji: "📌", bg: "#FFF0E8", donut: "#FF7043", bar: "#FB923C" },
};
const DEFAULT_VISUAL = { emoji: "📌", bg: "#FFF0E8", donut: "#FF7043", bar: "#FB923C" };

function visualForCategory(category: string) {
  return CATEGORY_VISUAL[category] || DEFAULT_VISUAL;
}
function visualForEntry(entry: EntryDoc) {
  if (entry.type === "income") return CATEGORY_VISUAL[entry.category] || CATEGORY_VISUAL["משכורת"] || DEFAULT_VISUAL;
  return visualForCategory(entry.category || "אחר");
}
function formatShortHebrewDate(dateISO: string): string {
  if (!dateISO) return "";
  const [, monthRaw, dayRaw] = dateISO.split("-").map(Number);
  if (!Number.isFinite(monthRaw) || !Number.isFinite(dayRaw)) return dateISO;
  return `${dayRaw} ${HEBREW_MONTHS_SHORT[monthRaw - 1] || ""}`;
}
function formatHeroAmount(amount: number): string {
  return amount.toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatCompactILS(amount: number): string {
  return `₪${Math.round(amount).toLocaleString("he-IL")}`;
}
function formatTransactionAmount(amount: number): string {
  return `₪${Math.abs(amount).toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function mergeMonthOptions(primary: string[], secondary: string[]): string[] {
  return Array.from(new Set([...primary, ...secondary])).sort((a, b) => b.localeCompare(a));
}
function shortMonthLabelFromKey(monthKey: string): string {
  return HEBREW_MONTHS_SHORT[Number(monthKey.split("-")[1]) - 1] || monthKey;
}
function formatTrendLabel(monthKey: string): string {
  const labels = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  return labels[Number(monthKey.split("-")[1]) - 1] || monthKey;
}

// ─── Donut chart (mobile) ──────────────────────────────────────────────────────
function DonutChart(props: { data: Array<{ label: string; value: number; color: string }>; centerPct: number }) {
  const { data, centerPct } = props;
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = 36, cx = 46, cy = 46, circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="mb-donut-wrap">
      <svg width="92" height="92" viewBox="0 0 92 92" aria-hidden="true">
        {total > 0 ? data.map((d, i) => {
          const pct = d.value / total;
          const dash = circ * pct;
          const rot = offset * 360 - 90;
          offset += pct;
          return <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={d.color} strokeWidth={13}
            strokeDasharray={`${dash} ${circ - dash}`} transform={`rotate(${rot} ${cx} ${cy})`} strokeLinecap="round" />;
        }) : <circle cx={cx} cy={cy} r={r} fill="none" stroke="#FFE0CC" strokeWidth={13} />}
        <text x={cx} y={cy - 3} textAnchor="middle" fill="#2D1A0E" fontSize="12" fontWeight={700} fontFamily="Rubik">{centerPct}%</text>
        <text x={cx} y={cy + 11} textAnchor="middle" fill="#C4997A" fontSize="8" fontFamily="Rubik">מנוצל</text>
      </svg>
      <div className="mb-donut-legend">
        {data.length === 0
          ? <div className="mb-empty">אין הוצאות להצגה</div>
          : data.map(d => (
            <div className="mb-donut-row" key={d.label}>
              <div className="mb-donut-dot" style={{ background: d.color }} />
              <div className="mb-donut-lbl">{d.label}</div>
              <div className="mb-donut-pct">{total > 0 ? Math.round(d.value / total * 100) : 0}%</div>
            </div>
          ))}
      </div>
    </div>
  );
}

// ─── Desktop entry glyph ───────────────────────────────────────────────────────
function entryGlyph(entry: EntryDoc): string {
  if (entry.type === "income") return "+";
  const cat = String(entry.category || "").trim();
  return cat ? cat.charAt(0) : "₪";
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
  const [showCharts, setShowCharts] = useState(false);
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

  useEffect(() => subscribeRecordsState(() => setReloadToken(v => v + 1)), []);

  useEffect(() => {
    if (state !== "ready") return;
    let cancelled = false;
    const id = window.setTimeout(async () => {
      try {
        const months = await listAvailableMonthKeys();
        if (cancelled) return;
        setAvailableMonths(months);
        if (months.length && !months.includes(currentMonth) && monthKey === currentMonth) setMonthKey(months[0]);
      } catch { if (!cancelled) setAvailableMonths([]); }
    }, 350);
    return () => { cancelled = true; window.clearTimeout(id); };
  }, [reloadToken, currentMonth, monthKey, state]);

  useEffect(() => {
    let cancelled = false;
    let chartTimer = 0;
    async function load() {
      setState("loading"); setErrorMessage(""); setTrend([]); setShowCharts(false);
      try {
        const monthEntries = await listMonthEntries(monthKey);
        if (cancelled) return;
        setEntries(monthEntries); setState("ready");
        chartTimer = window.setTimeout(() => { if (!cancelled) setShowCharts(true); }, 0);
      } catch (err: any) {
        if (cancelled) return;
        setEntries([]); setTrend([]); setShowCharts(false); setState("error");
        setErrorMessage(err?.message || "לא הצלחנו לטעון את הסקירה החודשית.");
        return;
      }
      try {
        const t = await listVariableExpenseTrend(trendMonths);
        if (!cancelled) setTrend(t);
      } catch { if (!cancelled) setTrend([]); }
    }
    void load();
    return () => { cancelled = true; window.clearTimeout(chartTimer); };
  }, [monthKey, reloadToken, trendMonths]);

  const summary        = useMemo(() => summarizeMonthlyEntries(entries, monthKey), [entries, monthKey]);
  const variableByCategory = useMemo(() => groupVariableExpensesByCategory(entries), [entries]);
  const recentActivity = useMemo(() => summary.recentActivity.slice(0, 5), [summary.recentActivity]);

  const totalExpenses  = summary.totals.expenses;
  const totalIncome    = summary.totals.income;
  const balance        = summary.totals.balance;
  const budgetUsedPct  = totalIncome > 0
    ? Math.max(0, Math.min(100, Math.round(totalExpenses / totalIncome * 100)))
    : totalExpenses > 0 ? 100 : 0;

  const donutData = useMemo(() =>
    variableByCategory.slice(0, 5).map(item => ({
      label: item.category, value: item.value, color: visualForCategory(item.category).donut,
    })), [variableByCategory]);

  const barChartData = useMemo(() => {
    if (!trend.length) return [];
    const max = Math.max(...trend.map(p => p.value), 1);
    return trend.map(p => ({ monthKey: p.month, label: shortMonthLabelFromKey(p.month), value: p.value, heightPct: p.value / max * 100 }));
  }, [trend]);

  const budgetItems = useMemo(() => {
    const top = variableByCategory.slice(0, 4);
    if (!top.length) return [];
    const ref = Math.max(top[0].value, 1) * 1.5;
    return top.map(item => ({
      category: item.category, spent: item.value,
      total: Math.max(Math.ceil(ref / 100) * 100, 100),
      color: visualForCategory(item.category).bar,
    }));
  }, [variableByCategory]);

  const fixedExpenses = useMemo(() => {
    const today = todayISO();
    return sortEntriesByDisplayDate(entries.filter(isFixedExpense))
      .map(entry => ({ entry, lifecycle: getEntryLifecycle(entry, today) }));
  }, [entries]);

  // Desktop: category bars
  const desktopVariableByCategory = useMemo(() => variableByCategory.slice(0, 5), [variableByCategory]);

  const heroSubtitle = balance >= 0 ? "עודף תקציב חודשי" : "גרעון בתקציב החודש";
  const monthLabel   = formatMonthKey(monthKey);
  const isLoading    = state === "loading";

  const modal = (
    <ImportEntriesModal
      open={isImportOpen}
      onClose={() => setIsImportOpen(false)}
      monthKey={monthKey}
      defaultDateISO={todayISO()}
      onSaved={saved => { if (saved && saved !== monthKey) setMonthKey(saved); }}
    />
  );

  // ─── MOBILE layout (≤920px) ────────────────────────────────────────────────
  const mobileLayout = (
    <>
      <div className="mb-screen">
        <header className="mb-top-row">
          <div>
            <div className="mb-greeting">שלום, {userName} 👋</div>
            <div className="mb-name">מעקב תקציב</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select className="mb-month-pick" value={monthKey} disabled={isLoading}
              onChange={e => startMonthTransition(() => setMonthKey(e.target.value))} aria-label="בחר חודש">
              {monthOptions.map(k => <option key={k} value={k}>{formatMonthKey(k)}</option>)}
            </select>
            <button className="mb-bell" type="button" aria-label="התראות">🔔</button>
          </div>
        </header>

        {availableMonths.length > 0 && !availableMonths.includes(currentMonth)
          ? <div className="mb-banner">לחודש הנוכחי אין עדיין תנועות, מוצג החודש האחרון עם נתונים.</div>
          : null}
        {errorMessage ? <div className="mb-banner error">{errorMessage}</div> : null}

        <section className="mb-hero">
          <div className="mb-hero-lbl">יתרה חודשית · {monthLabel}</div>
          <div className="mb-hero-amt">₪{formatHeroAmount(balance)}</div>
          <div className="mb-hero-sub">{heroSubtitle}</div>
          <div className="mb-hero-row">
            <div className="mb-hero-third">
              <div className="mb-hero-hlbl">הכנסות</div>
              <div className="mb-hero-hval">{formatCompactILS(totalIncome)}</div>
            </div>
            <div className="mb-hero-third">
              <div className="mb-hero-hlbl">הוצ׳ קבועות</div>
              <div className="mb-hero-hval">{formatCompactILS(summary.totals.fixed)}</div>
            </div>
            <div className="mb-hero-third">
              <div className="mb-hero-hlbl">הוצ׳ משתנות</div>
              <div className="mb-hero-hval">{formatCompactILS(summary.totals.variable)}</div>
            </div>
          </div>
        </section>

        <div className="mb-qa">
          <Link className="mb-qa-btn" to="/add?type=expense"><span className="mb-qa-ico">➕</span><span className="mb-qa-lbl">הוסף הוצאה</span></Link>
          <Link className="mb-qa-btn" to="/add?type=income"><span className="mb-qa-ico">💰</span><span className="mb-qa-lbl">הוסף הכנסה</span></Link>
          <button className="mb-qa-btn" type="button" onClick={() => setIsImportOpen(true)}><span className="mb-qa-ico">📋</span><span className="mb-qa-lbl">ייבוא קובץ</span></button>
        </div>

        <section className="mb-section">
          <div className="mb-sec-hdr">
            <div className="mb-sec-ttl">פילוח הוצאות</div>
            <div className="mb-chart-toggle">
              <button type="button" className={`mb-chart-tbtn${chartView === "donut" ? " on" : ""}`} onClick={() => setChartView("donut")}>עוגה</button>
              <button type="button" className={`mb-chart-tbtn${chartView === "bars" ? " on" : ""}`} onClick={() => setChartView("bars")}>עמודות</button>
            </div>
          </div>
          {chartView === "donut"
            ? <DonutChart data={donutData} centerPct={budgetUsedPct} />
            : barChartData.length === 0
              ? <div className="mb-empty">אין מספיק נתונים.</div>
              : <div className="mb-bar-chart">
                  {barChartData.map(bar => {
                    const isCurrent = bar.monthKey === monthKey;
                    return (
                      <div className="mb-bar-col" key={bar.monthKey}>
                        <div className={`mb-bar${isCurrent ? " on" : ""}`} style={{ height: `${Math.max(6, Math.round(bar.heightPct / 100 * 62))}px` }} />
                        <div className={`mb-bar-lbl${isCurrent ? " on" : ""}`}>{bar.label}</div>
                      </div>
                    );
                  })}
                </div>}
        </section>

        <section className="mb-section">
          <div className="mb-sec-hdr">
            <div className="mb-sec-ttl">עסקאות אחרונות</div>
            <Link className="mb-sec-btn" to="/transactions">הכל ›</Link>
          </div>
          {isLoading
            ? <div className="mb-empty">טוען עסקאות…</div>
            : recentActivity.length === 0
              ? <div className="mb-empty">עדיין אין תנועות בחודש שנבחר.</div>
              : recentActivity.map(entry => {
                  const visual = visualForEntry(entry);
                  const isIncome = entry.type === "income";
                  return (
                    <div className="mb-tx" key={entry.id}>
                      <div className="mb-tx-ico" style={{ background: visual.bg }}>{visual.emoji}</div>
                      <div className="mb-tx-body">
                        <div className="mb-tx-name">{entry.description || entry.category || "ללא קטגוריה"}</div>
                        <div className="mb-tx-cat">{entry.category || "ללא קטגוריה"}{entry.date ? ` · ${formatShortHebrewDate(String(entry.date))}` : ""}</div>
                      </div>
                      <div className={`mb-tx-amt ${isIncome ? "inc" : "exp"}`}>{isIncome ? "+" : "-"}{formatTransactionAmount(Number(entry.amount || 0))}</div>
                    </div>
                  );
                })}
        </section>

        <section className="mb-section">
          <div className="mb-sec-hdr">
            <div className="mb-sec-ttl">מעקב תקציב</div>
            <Link className="mb-sec-btn" to="/transactions">נהל ›</Link>
          </div>
          {budgetItems.length === 0
            ? <div className="mb-empty">אין כרגע נתוני הוצאה משתנה.</div>
            : budgetItems.map(item => {
                const ratio = Math.max(0, Math.min(1, item.spent / item.total));
                return (
                  <div className="mb-prog-item" key={item.category}>
                    <div className="mb-prog-row">
                      <div className="mb-prog-cat">{item.category}</div>
                      <div className="mb-prog-nums">₪{Math.round(item.spent).toLocaleString("he-IL")} / ₪{item.total.toLocaleString("he-IL")}</div>
                    </div>
                    <div className="mb-prog-track">
                      <div className="mb-prog-fill" style={{ width: `${ratio * 100}%`, background: item.color }} />
                    </div>
                  </div>
                );
              })}
        </section>

        <section className="mb-section">
          <div className="mb-sec-hdr">
            <div className="mb-sec-ttl">הוצאות קבועות</div>
            <div className="mb-fixed-summary">
              {formatCompactILS(summary.totals.fixed)}
              {summary.totals.scheduledFixed > 0
                ? <span className="mb-fixed-pending"> · {formatCompactILS(summary.totals.scheduledFixed)} מתוזמן</span>
                : null}
            </div>
          </div>
          {fixedExpenses.length === 0
            ? <div className="mb-empty">אין הוצאות קבועות בחודש הנבחר.</div>
            : fixedExpenses.map(({ entry, lifecycle }) => {
                const visual = visualForEntry(entry);
                const isScheduled = lifecycle === "scheduled";
                return (
                  <div className="mb-tx" key={entry.id}>
                    <div className="mb-tx-ico" style={{ background: visual.bg }}>{visual.emoji}</div>
                    <div className="mb-tx-body">
                      <div className="mb-tx-name">{entry.description || entry.category || "הוצאה קבועה"}</div>
                      <div className="mb-tx-cat">{entry.category || "ללא קטגוריה"}{entry.date ? ` · ${formatShortHebrewDate(String(entry.date))}` : ""}{isScheduled ? " · מתוזמן" : " · ירדה"}</div>
                    </div>
                    <div className={`mb-tx-amt exp${isScheduled ? " scheduled" : ""}`}>-{formatTransactionAmount(Number(entry.amount || 0))}</div>
                  </div>
                );
              })}
        </section>
      </div>
      <BottomNav variant="mobile" />
      {modal}
    </>
  );

  // ─── DESKTOP layout (>920px) — AppLayout + coral palette ──────────────────
  const desktopLayout = (
    <AppLayout title="סקירה פיננסית" subtitle="מאזן חודשי, הוצאות קבועות ומשתנות, ותנועות אחרונות.">
      <div className="page-stack">

        {/* Toolbar */}
        <div className="dashboard-actions">
          <div className="toolbar-actions">
            <Link className="btn coral-btn" to="/add">הוספת תנועה</Link>
            <button className="btn coral-btn-secondary" type="button" onClick={() => setIsImportOpen(true)} disabled={isLoading}>ייבוא קובץ</button>
            <Link className="btn coral-btn-secondary" to="/transactions">כל התנועות</Link>
          </div>
          <div className="month-picker">
            <span className="muted text-small">חודש</span>
            <select className="input" value={monthKey} disabled={isLoading}
              onChange={e => startMonthTransition(() => setMonthKey(e.target.value))}>
              {monthOptions.map(k => <option key={k} value={k}>{formatMonthKey(k)}</option>)}
            </select>
          </div>
        </div>

        {availableMonths.length > 0 && !availableMonths.includes(currentMonth)
          ? <div className="note-banner">לחודש הנוכחי אין עדיין תנועות, ולכן מוצג אוטומטית החודש האחרון עם נתונים.</div>
          : null}
        {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}

        {/* Hero — Coral gradient */}
        <section className="coral-hero">
          <div className="coral-hero-main">
            <div className="coral-hero-label">יתרה חודשית · {monthLabel}</div>
            <div className="coral-hero-amount">₪{formatHeroAmount(balance)}</div>
            <div className="coral-hero-sub">{heroSubtitle}</div>
          </div>
          <div className="coral-hero-stats">
            <div className="coral-hero-stat">
              <div className="coral-hero-stat-lbl">הכנסות</div>
              <div className="coral-hero-stat-val income">{formatILS(totalIncome)}</div>
            </div>
            <div className="coral-hero-divider" />
            <div className="coral-hero-stat">
              <div className="coral-hero-stat-lbl">הוצאות קבועות</div>
              <div className="coral-hero-stat-val expense">{formatILS(summary.totals.fixed)}</div>
            </div>
            <div className="coral-hero-divider" />
            <div className="coral-hero-stat">
              <div className="coral-hero-stat-lbl">הוצאות משתנות</div>
              <div className="coral-hero-stat-val expense">{formatILS(summary.totals.variable)}</div>
            </div>
          </div>
        </section>

        {/* Main grid */}
        <section className="dashboard-main-grid">

          {/* Trend chart + category bars */}
          <article className="card coral-card trend-card">
            <div className="section-header compact">
              <div>
                <div className="section-title">מגמות הוצאות משתנות</div>
                <div className="section-subtitle">ששת החודשים האחרונים</div>
              </div>
              <div className="header-chip coral-chip">{monthLabel}</div>
            </div>
            <div className="trend-stage">
              {!showCharts
                ? <div className="muted">מכין גרף…</div>
                : trend.length === 0
                  ? <div className="empty-panel">אין מספיק נתונים.</div>
                  : <Bar
                      data={{
                        labels: trend.map(p => formatTrendLabel(p.month)),
                        datasets: [{
                          data: trend.map(p => p.value),
                          backgroundColor: trend.map(p => p.month === monthKey ? "#FF5C35" : "#FFE0CC"),
                          borderRadius: 18, borderSkipped: false, maxBarThickness: 52,
                        }],
                      }}
                      options={{
                        responsive: true, maintainAspectRatio: false,
                        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => formatILS(ctx.raw as number) } } },
                        scales: {
                          x: { grid: { display: false }, border: { display: false }, ticks: { color: "#C4997A", font: { weight: 700 } } },
                          y: { display: false, grid: { display: false }, border: { display: false } },
                        },
                      }}
                    />}
            </div>
            <div className="trend-meta-list">
              <div className="section-subtitle">קטגוריות מובילות</div>
              {desktopVariableByCategory.length === 0
                ? <div className="muted">אין קטגוריות להצגה.</div>
                : <div className="category-bars">
                    {desktopVariableByCategory.map(item => {
                      const width = Math.max(16, Math.round(item.value / Math.max(desktopVariableByCategory[0]?.value || 1, 1) * 100));
                      const color = visualForCategory(item.category).bar;
                      return (
                        <div key={item.category} className="category-row">
                          <div className="category-meta"><span>{item.category}</span><strong>{formatILS(item.value)}</strong></div>
                          <div className="category-track">
                            <div className="category-fill coral-category-fill" style={{ width: `${width}%`, background: color }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>}
            </div>
          </article>

          {/* Side rail: recent activity + fixed expenses */}
          <aside className="dashboard-side-rail">
            <article className="card coral-card">
              <div className="section-header compact">
                <div>
                  <div className="section-title">עסקאות אחרונות</div>
                  <div className="section-subtitle">חמש התנועות האחרונות</div>
                </div>
                <Link className="btn coral-btn-secondary" to="/transactions">הכל</Link>
              </div>
              <div className="activity-feed">
                {isLoading ? <div className="muted">טוען…</div>
                  : recentActivity.length === 0 ? <div className="empty-panel">עדיין אין תנועות.</div>
                  : recentActivity.map(entry => {
                      const tone = getEntryTone(entry);
                      const instLabel = getInstallmentLabel(entry);
                      const lifecycle = getEntryLifecycle(entry, todayISO());
                      const amountTone = entry.type === "income" ? "income" : "expense";
                      return (
                        <div key={entry.id} className="activity-item">
                          <div className="activity-item-main">
                            <div className={`activity-icon${entry.type === "income" ? " income" : ""}`}>{entryGlyph(entry)}</div>
                            <div>
                              <div className="activity-title">{entry.category || "ללא קטגוריה"}</div>
                              <div className="activity-time">{entry.description || getEntryTypeLabel(entry)}{entry.date ? ` | ${formatShortHebrewDate(String(entry.date))}` : ""}</div>
                              <div className="badge-row" style={{ marginTop: 8 }}>
                                <span className={`status-pill ${tone}`}>{getEntryTypeLabel(entry)}</span>
                                {lifecycle === "scheduled" ? <span className="status-pill warn">מתוזמן</span> : null}
                                {instLabel ? <span className="status-pill neutral">תשלום {instLabel}</span> : null}
                              </div>
                            </div>
                          </div>
                          <div className={`activity-amount ${amountTone}`}>{entry.type === "income" ? "+" : "-"}{formatILS(Number(entry.amount || 0))}</div>
                        </div>
                      );
                    })}
              </div>
            </article>

            <article className="card coral-card">
              <div className="section-header compact">
                <div>
                  <div className="section-title">הוצאות קבועות</div>
                  <div className="section-subtitle">{formatILS(summary.totals.fixed)}{summary.totals.scheduledFixed > 0 ? ` · ${formatILS(summary.totals.scheduledFixed)} מתוזמן` : ""}</div>
                </div>
              </div>
              <div className="activity-feed">
                {fixedExpenses.length === 0
                  ? <div className="empty-panel">אין הוצאות קבועות.</div>
                  : fixedExpenses.map(({ entry, lifecycle }) => {
                      const isScheduled = lifecycle === "scheduled";
                      const visual = visualForEntry(entry);
                      return (
                        <div key={entry.id} className="activity-item">
                          <div className="activity-item-main">
                            <div className="activity-icon" style={{ background: visual.bg, color: "#FF5C35" }}>{visual.emoji}</div>
                            <div>
                              <div className="activity-title">{entry.description || entry.category || "הוצאה קבועה"}</div>
                              <div className="activity-time">{entry.category}{entry.date ? ` | ${formatShortHebrewDate(String(entry.date))}` : ""}</div>
                              <div className="badge-row" style={{ marginTop: 8 }}>
                                <span className={`status-pill ${isScheduled ? "warn" : "variable"}`}>{isScheduled ? "מתוזמן" : "ירדה"}</span>
                              </div>
                            </div>
                          </div>
                          <div className="activity-amount expense">-{formatILS(Number(entry.amount || 0))}</div>
                        </div>
                      );
                    })}
              </div>
            </article>
          </aside>
        </section>
      </div>
      {modal}
    </AppLayout>
  );

  return (
    <>
      <div className="dash-desktop">{desktopLayout}</div>
      <div className="dash-mobile">{mobileLayout}</div>
    </>
  );
}
