import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { userKeyFromEmail } from "../services/authService";
import AppLayout from "../app/layout/AppLayout";
import { currentMonthKey, monthKeyFromISO } from "../utils/dates";
import { formatILS } from "../utils/money";
import { auth, db } from "../services/firebase";
import type { EntryDoc } from "../types/models";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  where,
  type QueryConstraint,
  writeBatch,
} from "firebase/firestore";

type LoadState = "idle" | "loading" | "ready" | "error";

function typeLabel(e: EntryDoc): string {
  if (e.type === "income") return "הכנסה";
  return "הוצאה";
}

function isFixedExpense(e: any): boolean {
  return e?.type === "expense" && e?.subType === "fixed";
}

function isVariableExpense(e: any): boolean {
  return e?.type === "expense" && e?.subType !== "fixed";
}

type AddKind = "income" | "expense_variable" | "expense_fixed";

function kindToDoc(
  kind: AddKind
): { type: EntryDoc["type"]; subType?: EntryDoc["subType"] } {
  if (kind === "income") return { type: "income" };
 if (kind === "expense_fixed") 
  return { type: "expense", subType: "fixed_realization" };

  return { type: "expense", subType: "variable" };
}

function isValidPositiveNumber(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}

function parseAmountInput(v: string): number | null {
  const n = Number((v || "").replace(/,/g, "").trim());
  if (!isValidPositiveNumber(n)) return null;
  return n;
}

function AddEntryModal(props: {
  open: boolean;
  onClose: () => void;
  monthKey: string;
  defaultDateISO: string;
  onSaved: () => void;
}) {
  const { open, onClose, monthKey, defaultDateISO, onSaved } = props;

  const [kind, setKind] = useState<AddKind>("expense_variable");
  const [date, setDate] = useState<string>(defaultDateISO);
  const [category, setCategory] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [amount, setAmount] = useState<string>("");

  const [installments, setInstallments] = useState<number>(1);
  const [chargeDay, setChargeDay] = useState<number>(1);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string>("");

  const isIncome = kind === "income";
  const isExpense = kind !== "income";

// ====== בתוך AddEntryModal ======

const expenseCategories = useMemo(
  () => [
    "אלכוהול",
    "בילוי ומסעדות",
    "בילוי עם הילדים",
    "בתי מרקחת וטיפוח",
    "ביגוד והנעלה",
    "דלק",
    "מתנות",
    "Maxstock",
    "רכב",
    "סיגריות ונרגילה",
    "סופר",
    "תחזוקת הבית",
    "קניות אונליין",
    "אחר"
  ],
  []
);

const incomeCategories = useMemo(
  () => ["משכורת", "החזר", "הכנסה נוספת", "אחר"],
  []
);

const categoryOptions = useMemo(
  () => (isIncome ? incomeCategories : expenseCategories),
  [isIncome, incomeCategories, expenseCategories]
);

// ברירת מחדל: "סופר" להוצאה
useEffect(() => {
  if (!open) return;

  setErr("");

  if (!date) {
    setDate(defaultDateISO);
  }

  if (!isIncome && !category) {
    setCategory("סופר");
  }
}, [open, defaultDateISO, isIncome, category, date]);


  useEffect(() => {
    if (!open) return;
    setErr("");
    if (!date) setDate(defaultDateISO);
  }, [open, defaultDateISO, date]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!open) return;
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  function toISODate(d: Date) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function addMonthsKeepingDay(base: Date, monthsToAdd: number, day: number) {
    const y = base.getFullYear();
    const m = base.getMonth() + monthsToAdd;

    const d0 = new Date(y, m, 1);
    const lastDay = new Date(d0.getFullYear(), d0.getMonth() + 1, 0).getDate();
    const useDay = Math.min(Math.max(1, day), lastDay);

    return new Date(d0.getFullYear(), d0.getMonth(), useDay);
  }

  function splitAmountToInstallments(total: number, n: number) {
    const cents = Math.round(total * 100);
    const base = Math.floor(cents / n);
    const rem = cents - base * n;

    const arr = new Array(n).fill(base);
    for (let i = 0; i < rem; i++) arr[i] += 1;

    return arr.map((c: number) => c / 100);
  }

  async function onSave() {
    if (saving) return;

    const amountNumber = parseAmountInput(amount);
    if (!amountNumber) {
      setErr("נא להזין סכום תקין.");
      return;
    }
    if (!category) {
      setErr("נא לבחור קטגוריה.");
      return;
    }
    if (!date) {
      setErr("נא לבחור תאריך.");
      return;
    }

    const user = auth.currentUser;
    if (!user?.email) {
      setErr("משתמש לא מחובר.");
      return;
    }

    const { type, subType } = kindToDoc(kind);
    const installmentsNumber = Math.max(1, Math.min(120, Number(installments) || 1));
    const chargeDayNumber = Math.max(1, Math.min(31, Number(chargeDay) || 1));
    const shouldUseInstallments = isExpense && subType === "variable" && installmentsNumber > 1;

    setSaving(true);
    setErr("");

    try {
      const batch = writeBatch(db);

      if (!shouldUseInstallments) {
        const ref = doc(collection(db, "records"));
        const payload: any = {
          type,
          subType,
          date,
          monthKey,
          category,
          description: description.trim(),
          amount: amountNumber,
          userEmail: user.email,
          userKey: userKeyFromEmail(user.email),
          createdAt: Date.now(),
        };
        batch.set(ref, payload);
        await batch.commit();

        onSaved();
        onClose();
        return;
      }

      const nInst = installmentsNumber;
      const amountsArr = splitAmountToInstallments(amountNumber, nInst);
      const baseMonthFirstDay = new Date(date + "T00:00:00");
      const groupId = `${user.email}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

      for (let i = 1; i <= nInst; i++) {
        const amt = amountsArr[i - 1];

        let chargeISO: string;
        if (i === 1) {
          chargeISO = date;
        } else {
          const chargeDate = addMonthsKeepingDay(baseMonthFirstDay, i - 1, chargeDayNumber);
          chargeISO = toISODate(chargeDate);
        }

        const ref = doc(collection(db, "records"));
        const payload: any = {
          type,
          subType,
          date: chargeISO,
          monthKey: monthKeyFromISO(chargeISO),
          category,
          description: description.trim(),
          amount: amt,
          userEmail: user.email,
          userKey: userKeyFromEmail(user.email),
          createdAt: Date.now(),
          installmentsTotal: nInst,
          installmentIndex: i,
          installmentsGroupId: groupId,
        };
        batch.set(ref, payload);
      }

      await batch.commit();

      onSaved();
      onClose();
    } catch (ex: any) {
      setErr(ex?.message || "שגיאה בשמירה.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(15, 23, 42, 0.25)",
        backdropFilter: "blur(6px)",
        display: "grid",
        placeItems: "center",
        padding: 14,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "min(920px, 96vw)",
          borderRadius: 18,
          border: "1px solid rgba(15,23,42,0.10)",
          background: "linear-gradient(180deg, rgba(255,255,255,0.96), rgba(255,255,255,0.90))",
          boxShadow: "0 24px 70px rgba(2,6,23,0.20)",
          padding: 18,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ fontWeight: 900 }}>הוספת תנועה</div>
          <button className="btn secondary" type="button" onClick={onClose} disabled={saving}>
            סגור
          </button>
        </div>

        <div style={{ height: 14 }} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label>תאריך</label>
            <input
              className="input"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={saving}
            />
          </div>

          <div>
            <label>סוג</label>
            <select
              className="input"
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as AddKind);
                setCategory("");
                setErr("");
              }}
              disabled={saving}
            >
              <option value="expense_variable">הוצאה משתנה</option>
              <option value="expense_fixed">הוצאה קבועה</option>
              <option value="income">הכנסה</option>
            </select>
          </div>

          <div>
            <label>סכום</label>
            <input
              className="input"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={saving}
            />
          </div>

          <div>
            <label>קטגוריה</label>
            <select
              className="input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={saving}
            >
              <option value="">בחר</option>
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <label>תיאור</label>
            <input
              className="input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={saving}
            />
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
  const nav = useNavigate();

  const [monthKey, setMonthKey] = useState<string>(currentMonthKey());
  const [state, setState] = useState<LoadState>("idle");
  const [err, setErr] = useState<string>("");
  const [items, setItems] = useState<EntryDoc[]>([]);
  const [deletingId, setDeletingId] = useState<string>("");

  const [reloadKey, setReloadKey] = useState<number>(0);
  const [isAddOpen, setIsAddOpen] = useState<boolean>(false);

  // מצב עריכה (בדשבורד עצמו)
  const [editingId, setEditingId] = useState<string>("");
  const [editDate, setEditDate] = useState<string>("");
  const [editCategory, setEditCategory] = useState<string>("");
  const [editDesc, setEditDesc] = useState<string>("");
  const [editAmount, setEditAmount] = useState<string>("");
  const [savingEditId, setSavingEditId] = useState<string>("");
  const [editErr, setEditErr] = useState<string>("");

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
        const constraints: QueryConstraint[] = [
          where("monthKey", "==", monthKey),
          orderBy("createdAt", "desc"),
        ];

        const q = query(collection(db, "records"), ...constraints);
        const snap = await getDocs(q);

        if (cancelled) return;

        const arr: EntryDoc[] = [];
        snap.forEach((d) => arr.push({ id: d.id, ...(d.data() as any) }));
        setItems(arr);
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

    try {
      const ref = doc(db, "records", it.id);
      await updateDoc(ref, {
        date: editDate,
        monthKey: monthKeyFromISO(editDate),
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
                monthKey: monthKeyFromISO(editDate),
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
      <div className="container">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div className="row" style={{ gap: 10, alignItems: "center" }}>
            <button
              className="btn"
              onClick={() => setIsAddOpen(true)}
              disabled={state === "loading"}
            >
              הוספת תנועה
            </button>
          </div>

          <div className="row" style={{ gap: 10, alignItems: "center" }}>
            <div className="muted" style={{ fontSize: 12 }}>חודש</div>
            <select
              className="input"
              style={{ width: 160 }}
              value={monthKey}
              onChange={(e) => setMonthKey(e.target.value)}
            >
              {months.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
          תצוגה חודשית. הכרטיסיות והגרף מתעדכנים אוטומטית לפי החודש.
        </div>

        <div style={{ height: 14 }} />

        <div className="kpi-grid">
          <div className="kpi-card kpi-balance">
            <div className="kpi-top">
              <div className="kpi-title">יתרה חודשית</div>
              <div className="kpi-icon">✓</div>
            </div>
            <div className="kpi-value">{formatILS(totals.balance)}</div>
            <div className="kpi-sub muted">הכנסות פחות הוצאות</div>
          </div>

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

        <div style={{ height: 18 }} />

        <div className="card">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontWeight: 900 }}>תנועות</div>
            {err ? <div className="error">{err}</div> : null}
          </div>

          <div style={{ height: 10 }} />

          {state === "loading" ? (
            <div className="muted">טוען...</div>
          ) : null}

          {state !== "loading" && items.length === 0 ? (
            <div className="muted">אין נתונים לחודש הזה.</div>
          ) : null}

          <div style={{ display: "grid", gap: 10 }}>
            {items.map((it) => {
              const isEditing = editingId === it.id;

              return (
                <div
                  key={it.id}
                  className="txn-row"
                  style={{
                    borderLeft:
                      it.type === "income"
                        ? "4px solid rgba(34,197,94,0.95)"
                        : isFixedExpense(it)
                        ? "4px solid rgba(168,85,247,0.95)"
                        : "4px solid rgba(6,182,212,0.95)",
                  }}
                >
                  {!isEditing ? (
                    <>
                      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ fontWeight: 900 }}>
                          {typeLabel(it)} - {formatILS(Number(it.amount || 0))}
                        </div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {it.date}
                        </div>
                      </div>

                      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                        {it.category || "ללא קטגוריה"}
                        {it.description ? ` - ${it.description}` : ""}
                      </div>

                      <div className="row" style={{ gap: 8, marginTop: 10 }}>
                        <button className="btn secondary" onClick={() => startEdit(it)}>
                          ערוך
                        </button>
                        <button
                          className="btn danger"
                          onClick={() => onDelete(it.id || "")}
                          disabled={deletingId === it.id}
                        >
                          {deletingId === it.id ? "מוחק..." : "מחיקה"}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div>
                          <label>תאריך</label>
                          <input
                            className="input"
                            type="date"
                            value={editDate}
                            onChange={(e) => setEditDate(e.target.value)}
                          />
                        </div>

                        <div>
                          <label>קטגוריה</label>
                          <input
                            className="input"
                            value={editCategory}
                            onChange={(e) => setEditCategory(e.target.value)}
                          />
                        </div>

                        <div>
                          <label>סכום</label>
                          <input
                            className="input"
                            value={editAmount}
                            onChange={(e) => setEditAmount(e.target.value)}
                          />
                        </div>

                        <div>
                          <label>תיאור</label>
                          <input
                            className="input"
                            value={editDesc}
                            onChange={(e) => setEditDesc(e.target.value)}
                          />
                        </div>
                      </div>

                      {editErr ? <div className="error" style={{ marginTop: 8 }}>{editErr}</div> : null}

                      <div className="row" style={{ gap: 8, marginTop: 10 }}>
                        <button
                          className="btn"
                          onClick={() => saveEdit(it)}
                          disabled={savingEditId === it.id}
                        >
                          {savingEditId === it.id ? "שומר..." : "שמור"}
                        </button>
                        <button className="btn secondary" onClick={cancelEdit}>
                          ביטול
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            הערה: ״הוצאות קבועות״ מחושבות רק אם קיימות תנועות עם subType קבוע.
          </div>
        </div>
      </div>

      <AddEntryModal
        open={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        monthKey={monthKey}
        defaultDateISO={new Date().toISOString().slice(0, 10)}
        onSaved={() => setReloadKey((x) => x + 1)}
      />
    </AppLayout>
  );
}
