import React, { useEffect, useMemo, useState, useTransition } from "react";
import {
  DASHBOARD_FIXED_EXPENSE_CATEGORIES,
  DASHBOARD_INCOME_CATEGORIES,
  DASHBOARD_VARIABLE_EXPENSE_CATEGORIES,
} from "../domain/categories";
import AppLayout from "../app/layout/AppLayout";
import { currentMonthKey, monthKeyFromISO } from "../utils/dates";
import { formatILS } from "../utils/money";
import { auth } from "../services/firebase";
import { db } from "../services/firebaseDb";
import type { EntryDoc } from "../types/models";

import {
  Chart as ChartJS,
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

          <div style={{ gridColumn: "1 / -1" }}>
            <label>תיאור</label>
            <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} disabled={saving} />
          </div>

          {isExpense && kind === "expense_variable" ? (
            <>
              <div>
                <label>מספר תשלומים</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={120}
                  value={installments}
                  onChange={(e) => setInstallments(Number(e.target.value))}
                  disabled={saving}
                />
              </div>
              <div>
                <label>יום חיוב לתשלומים הבאים</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={31}
                  value={chargeDay}
                  onChange={(e) => setChargeDay(Number(e.target.value))}
                  disabled={saving || installments <= 1}
                />
              </div>
            </>
          ) : null}

          {kind === "expense_fixed" ? (
            <div>
              <label>יום חיוב חודשי</label>
              <input
                className="input"
                type="number"
                min={1}
                max={28}
                value={chargeDay}
                onChange={(e) => setChargeDay(Number(e.target.value))}
                disabled={saving}
              />
            </div>
          ) : null}
        </div>

        {err ? (
          <div className="error" style={{ marginTop: 10 }}>
            {err}
          </div>
        ) : null}

        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 16 }}>
          <button className="btn secondary" type="button" onClick={onClose} disabled={saving}>
            ביטול
          </button>
          <button className="btn" type="button" onClick={onSave} disabled={saving}>
            {saving ? "שומר..." : "שמור"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [monthKey, setMonthKey] = useState<string>(currentMonthKey());
  const [state, setState] = useState<LoadState>("idle");
  const [err, setErr] = useState<string>("");
  const [items, setItems] = useState<EntryDoc[]>([]);
  const [deletingId, setDeletingId] = useState<string>("");

  const [reloadKey, setReloadKey] = useState<number>(0);
  const [isAddOpen, setIsAddOpen] = useState<boolean>(false);
  const [isImportOpen, setIsImportOpen] = useState<boolean>(false);

  const [editingId, setEditingId] = useState<string>("");
  const [editDate, setEditDate] = useState<string>("");
  const [editCategory, setEditCategory] = useState<string>("");
  const [editDesc, setEditDesc] = useState<string>("");
  const [editAmount, setEditAmount] = useState<string>("");
  const [savingEditId, setSavingEditId] = useState<string>("");
  const [editErr, setEditErr] = useState<string>("");

  const [variableExpensesTrend, setVariableExpensesTrend] = useState<{ month: string; value: number }[]>([]);

  const months = useMemo(() => {
    const out: string[] = [];
    const now = new Date();
    for (let i = 0; i < 18; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      out.push(`${y}-${m}`);
    }
    return out;
  }, []);

  async function ensureFixedRealizationsForMonth(targetMonthKey: string) {
    const user = auth.currentUser;
    if (!user?.email) return;

    const householdId = householdIdFromEmail(user.email);
    const uk = userKeyFromEmail(user.email);
    if (uk !== "W") return;

    const tmplSnap = await getDocs(query(collection(db, "fixed_templates"), where("householdId", "==", householdId)));
    if (tmplSnap.empty) return;

    const batch = writeBatch(db);
    let writes = 0;
    const createdAtBase = Date.now();

    for (const t of tmplSnap.docs) {
      const data: any = t.data();
      if (data?.isActive === false) continue;

      const chargeDayRaw = Number(data.chargeDay || 1);
      const chargeDay = Math.max(1, Math.min(28, chargeDayRaw));

      const dd = String(chargeDay).padStart(2, "0");
      const dateISO = `${targetMonthKey}-${dd}`;

      const docId = `fx__${targetMonthKey}__${uk}__${t.id}`;
      const ref = doc(collection(db, "records"), docId);
      const existing = await getDoc(ref);
      if (existing.exists()) continue;

      batch.set(ref, {
        type: "expense",
        subType: "fixed_realization",
        monthKey: targetMonthKey,
        date: dateISO,

        category: String(data.category || "אחר"),
        description: String(data.description || "").trim(),
        amount: Number(data.amount || 0),

        chargeDay,
        templateId: t.id,
        source: "fixed_template",

        createdBy: user.email,
        ownerUid: user.uid,
        householdId,
        userKey: uk,
        createdAt: createdAtBase + writes,
      });

      writes += 1;
    }

    if (writes > 0) {
      await batch.commit();
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState("loading");
      setErr("");
      setDeletingId("");
      setEditingId("");
      setEditErr("");
      setSavingEditId("");

      try {
        await ensureFixedRealizationsForMonth(monthKey);

        const user = auth.currentUser;
        if (!user?.email) {
          setItems([]);
          setState("ready");
          return;
        }
        const householdId = householdIdFromEmail(user.email);
        const qByMonthKey = query(
          collection(db, "records"),
          where("householdId", "==", householdId),
          where("monthKey", "==", monthKey)
        );

        const snapKey = await getDocs(qByMonthKey);
        if (cancelled) return;

        const arr: EntryDoc[] = snapKey.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<EntryDoc, "id">),
        }));


        const today = new Date();

        const filtered = arr.filter((it: any) => {
          if (!isFixedExpense(it)) return true;

          const chargeDay = Number(it.chargeDay || 1);
          const mk2 = it.monthKey || monthKey;

          const [y, m] = String(mk2).split("-").map(Number);
          const chargeDate = new Date(y, (m || 1) - 1, chargeDay);

          return today >= chargeDate;
        });

        const normalizeDate = (v: any): string => {
          if (!v) return "";
          if (typeof v === "string") return v.trim().slice(0, 10);
          if (typeof v?.toDate === "function") {
            try {
              return v.toDate().toISOString().slice(0, 10);
            } catch {
              return "";
            }
          }
          if (v instanceof Date) return v.toISOString().slice(0, 10);
          return "";
        };

        filtered.sort((a: any, b: any) => {
          const ad = normalizeDate(a?.date);
          const bd = normalizeDate(b?.date);

          if (ad !== bd) return bd.localeCompare(ad);

          const aT = toMillis(a?.updatedAt) || toMillis(a?.createdAt);
          const bT = toMillis(b?.updatedAt) || toMillis(b?.createdAt);
          return bT - aT;
        });

        setItems(filtered);
        setState("ready");
      } catch (e: any) {
        if (cancelled) return;
        setErr(e?.message || "שגיאה בטעינת נתונים.");
        setState("error");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [monthKey, reloadKey]);

  // מגמת הוצאות משתנות ל-6 חודשים אחרונים
  useEffect(() => {
    let cancelled = false;

    async function loadVariableExpensesTrend() {
      try {
        const now = new Date();
        const last6Months: string[] = [];

        for (let i = 5; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          last6Months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
        }

        // איחוד תוצאות משתי שאילתות: month וגם monthKey (כדי לתפוס רשומות ישנות)
        const user = auth.currentUser;
        if (!user?.email) {
          setVariableExpensesTrend([]);
          return;
        }
        const householdId = householdIdFromEmail(user.email);
        const qByMonthKey = query(
          collection(db, "records"),
          where("householdId", "==", householdId),
          where("type", "==", "expense"),
          where("monthKey", "in", last6Months)
        );

        const snap = await getDocs(qByMonthKey);
        if (cancelled) return;

        const docs: Array<Record<string, any>> = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Record<string, any>),
        }));

        const map = new Map<string, number>();
        last6Months.forEach((m) => map.set(m, 0));

        docs.forEach((data) => {
          if (isFixedExpense(data)) return;

          const mk = String(data.monthKey || "").trim();
          if (!mk) return;
          if (!map.has(mk)) return;

          map.set(mk, (map.get(mk) || 0) + Number(data.amount || 0));
        });

        setVariableExpensesTrend(
          last6Months.map((m) => ({
            month: m,
            value: map.get(m) || 0,
          }))
        );
      } catch {
        setVariableExpensesTrend([]);
      }
    }

    loadVariableExpensesTrend();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);


  const totals = useMemo(() => {
    let income = 0;
    let variable = 0;
    let fixed = 0;

    for (const it of items) {
      if (it.type === "income") income += Number(it.amount || 0);
      if (isVariableExpense(it)) variable += Number(it.amount || 0);
      if (isFixedExpense(it)) fixed += Number(it.amount || 0);
    }

    const balance = income - (variable + fixed);
    return { income, variable, fixed, balance };
  }, [items]);

  const variableExpensesByCategory = useMemo(() => {
    const m = new Map<string, number>();

    items.forEach((it) => {
      if (it.type === "expense" && !isFixedExpense(it)) {
        const cat = it.category || "ללא קטגוריה";
        const prev = m.get(cat) || 0;
        m.set(cat, prev + Number(it.amount || 0));
      }
    });

    return Array.from(m.entries()).map(([category, value]) => ({
      category,
      value,
    }));
  }, [items]);

  async function onDelete(id: string) {
    if (!id) return;
    setDeletingId(id);
    setErr("");

    try {
      await deleteDoc(doc(db, "records", id));
      setItems((prev) => prev.filter((x) => x.id !== id));
    } catch (e: any) {
      setErr(e?.message || "שגיאה במחיקה.");
    } finally {
      setDeletingId("");
    }
  }

  function startEdit(it: EntryDoc) {
    setEditingId(it.id || "");
    setEditDate(it.date || "");
    setEditCategory(it.category || "");
    setEditDesc(it.description || "");
    setEditAmount(String(it.amount ?? ""));
    setEditErr("");
  }

  function cancelEdit() {
    setEditingId("");
    setEditErr("");
    setSavingEditId("");
  }

  async function saveEdit(it: EntryDoc) {
    if (!it.id) return;

    const n = parseAmountInput(editAmount);
    if (!n) {
      setEditErr("נא להזין סכום תקין.");
      return;
    }
    if (!editCategory) {
      setEditErr("נא לבחור קטגוריה.");
      return;
    }
    if (!editDate) {
      setEditErr("נא לבחור תאריך.");
      return;
    }

    setSavingEditId(it.id);
    setEditErr("");

    const mk = monthKeyFromISO(editDate);

    try {
      const ref = doc(db, "records", it.id);
      await updateDoc(ref, {
        date: editDate,
        monthKey: mk,
        category: editCategory,
        description: editDesc,
        amount: n,
      });

      setItems((prev) =>
        prev.map((x) =>
          x.id === it.id
            ? {
                ...x,
        date: editDate,
                monthKey: mk,
        category: editCategory,
                description: editDesc,
                amount: n,
              }
            : x
        )
      );

      cancelEdit();
    } catch (e: any) {
      setEditErr(e?.message || "שגיאה בשמירה.");
    } finally {
      setSavingEditId("");
    }
  }

  return (
    <AppLayout title="דשבורד">
      <button
        className="btn"
        type="button"
        onClick={() => setIsImportOpen(true)}
        disabled={state === "loading"}
        style={{
          position: "fixed",
          right: 14,
          bottom: 96,
          zIndex: 90,
          boxShadow: "0 14px 34px rgba(2,6,23,0.28)",
          background: "linear-gradient(135deg, rgba(168,85,247,0.98), rgba(37,99,235,0.95))",
        }}
      >
        📁 הוספת קובץ
      </button>

      <div className="container">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div className="row" style={{ gap: 10, alignItems: "center" }}>
            <button className="btn" onClick={() => setIsAddOpen(true)} disabled={state === "loading"}>
              הוספת תנועה
            </button>
            <button
              className="btn"
              onClick={() => setIsImportOpen(true)}
              disabled={state === "loading"}
              style={{ background: "linear-gradient(135deg, rgba(168,85,247,0.95), rgba(37,99,235,0.92))" }}
            >
              📁 הוספת קובץ
            </button>
          </div>

          <div className="row" style={{ gap: 10, alignItems: "center" }}>
            <div className="muted" style={{ fontSize: 12 }}>
              חודש
            </div>
            <select className="input" style={{ width: 160 }} value={monthKey} onChange={(e) => setMonthKey(e.target.value)}>
              {months.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
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

        <div style={{ height: 14 }} />

        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ marginBottom: 14 }}>
            <div
              className="kpi-card kpi-balance"
              style={{
                borderLeft:
                  totals.balance > 0
                    ? "6px solid rgba(34,197,94,0.95)"
                    : totals.balance < 0
                    ? "6px solid rgba(239,68,68,0.95)"
                    : undefined,
              }}
            >
              <div className="kpi-top">
                <div className="kpi-title">יתרה חודשית</div>
                <div className="kpi-icon">✓</div>
              </div>

              <div
                className="kpi-value"
                style={{
                  color:
                    totals.balance > 0
                      ? "rgba(34,197,94,0.95)"
                      : totals.balance < 0
                      ? "rgba(239,68,68,0.95)"
                      : undefined,
                }}
              >
                {formatILS(totals.balance)}
              </div>

              <div className="kpi-sub muted">הכנסות פחות הוצאות</div>
            </div>
          </div>

          <div className="kpi-grid">
            <div className="kpi-card kpi-variable">
              <div className="kpi-top">
                <div className="kpi-title">הוצאות משתנות</div>
                <div className="kpi-icon">≈</div>
              </div>
              <div className="kpi-value">{formatILS(totals.variable)}</div>
              <div className="kpi-sub muted">קניות, דלק, בילויים</div>
            </div>

            <div className="kpi-card kpi-fixed">
              <div className="kpi-top">
                <div className="kpi-title">הוצאות קבועות</div>
                <div className="kpi-icon">○</div>
              </div>
              <div className="kpi-value">{formatILS(totals.fixed)}</div>
              <div className="kpi-sub muted">תשלומים חוזרים וקבועים</div>
            </div>

            <div className="kpi-card kpi-income">
              <div className="kpi-top">
                <div className="kpi-title">הכנסות</div>
                <div className="kpi-icon">+</div>
              </div>
              <div className="kpi-value">{formatILS(totals.income)}</div>
              <div className="kpi-sub muted">סך כל ההכנסות בחודש</div>
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
            gap: 24,
            marginTop: 24,
            marginBottom: 24,
          }}
        >
          <div
            className="card"
            style={{
              background: "linear-gradient(180deg, #ffffff, #f8fafc)",
              borderRadius: 20,
              boxShadow: "0 30px 60px rgba(0,0,0,0.18)",
            }}
          >
            <h3 style={{ marginBottom: 12 }}>הוצאות משתנות לפי קטגוריות</h3>

            {variableExpensesByCategory.length === 0 ? (
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
