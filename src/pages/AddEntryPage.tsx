import React, { useMemo, useState } from "react";
import AppLayout from "../app/layout/AppLayout";
import { monthKeyFromISO, todayISO } from "../utils/dates";
import { auth, db } from "../services/firebase";
import { userKeyFromEmail } from "../services/authService";
import type { EntryDoc, EntrySubType, EntryType } from "../types/models";
import { collection, doc, writeBatch } from "firebase/firestore";

type EntryKind = "expense_variable" | "income";

const EXPENSE_CATEGORIES = [
  "דיור",
  "מזון",
  "רכב",
  "בריאות",
  "חינוך",
  "חשבונות",
  "תקשורת",
  "בילויים",
  "אחר",
];

const INCOME_CATEGORIES = ["משכורת", "החזר", "מתנה", "אחר"];

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addMonthsKeepingDay(baseMonthFirstDay: Date, addMonths: number, day: number): Date {
  const y = baseMonthFirstDay.getFullYear();
  const m = baseMonthFirstDay.getMonth();
  const target = new Date(y, m + addMonths, 1);

  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  const safeDay = Math.min(Math.max(day, 1), lastDay);

  return new Date(target.getFullYear(), target.getMonth(), safeDay);
}

function splitAmountToInstallments(total: number, n: number): number[] {
  const totalCents = Math.round(total * 100);
  const base = Math.floor(totalCents / n);
  const remainder = totalCents - base * n;

  const out: number[] = [];
  for (let i = 1; i <= n; i++) {
    const cents = base + (i === 1 ? remainder : 0);
    out.push(cents / 100);
  }
  return out;
}

export default function AddEntryPage() {
  const [kind, setKind] = useState<EntryKind>("expense_variable");
  const [date, setDate] = useState<string>(todayISO());
  const [category, setCategory] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [amount, setAmount] = useState<string>("");

  // תשלומים
  const [installments, setInstallments] = useState<number>(1);
  const [chargeDay, setChargeDay] = useState<number>(1);

  const [err, setErr] = useState<string>("");
  const [ok, setOk] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);

  const categories = useMemo(() => {
    return kind === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  }, [kind]);

  const showPayments = kind !== "income";

  function resetMessages() {
    setErr("");
    setOk("");
  }

  function validate(): { amountNumber: number; installmentsNumber: number; chargeDayNumber: number } | null {
    resetMessages();

    if (!date) {
      setErr("נא לבחור תאריך.");
      return null;
    }
    if (!category) {
      setErr("נא לבחור קטגוריה.");
      return null;
    }

    const normalized = amount.replace(/,/g, "").trim();
    const n = Number(normalized);

    if (!normalized || Number.isNaN(n) || !Number.isFinite(n)) {
      setErr("נא להזין סכום תקין.");
      return null;
    }
    if (n <= 0) {
      setErr("הסכום חייב להיות גדול מאפס.");
      return null;
    }

    const installmentsNumber = showPayments ? clampInt(Number(installments), 1, 60) : 1;
    const chargeDayNumber = showPayments ? clampInt(Number(chargeDay), 1, 28) : 1;

    if (showPayments && installmentsNumber < 1) {
      setErr("מספר התשלומים חייב להיות 1 או יותר.");
      return null;
    }
    if (showPayments && (chargeDayNumber < 1 || chargeDayNumber > 28)) {
      setErr("יום חיוב חייב להיות בין 1 ל-28.");
      return null;
    }

    return { amountNumber: n, installmentsNumber, chargeDayNumber };
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    const v = validate();
    if (!v) return;

    const user = auth.currentUser;
    if (!user || !user.email) {
      setErr("אין משתמש מחובר. אנא התחבר מחדש.");
      return;
    }

    setSaving(true);
    resetMessages();

    try {
      const type: EntryType = kind === "income" ? "income" : "expense";
      const subType: EntrySubType = "variable";

      const createdAtBase = Date.now();
      const installmentGroupId = `${createdAtBase}-${Math.random().toString(16).slice(2)}`;

      // אם אין תשלומים או זו הכנסה - נשמור מסמך אחד רגיל
      if (!showPayments || v.installmentsNumber === 1) {
        const payload: Omit<EntryDoc, "id"> = {
          type,
          subType,
          date,
          monthKey: monthKeyFromISO(date),
          category,
          description: description.trim(),
          amount: v.amountNumber,
          userKey: userKeyFromEmail(user.email),

          createdAt: createdAtBase,
          createdBy: user.email,

          ...(showPayments
            ? ({
                installmentsTotal: 1,
                installmentIndex: 1,
                installmentGroupId,
                chargeDay: v.chargeDayNumber,
              } as any)
            : {}),
        };

        const batch = writeBatch(db);
        const ref = doc(collection(db, "records"));
        batch.set(ref, payload as any);
        await batch.commit();

        setOk("נשמר בהצלחה.");
      } else {
        const nInst = v.installmentsNumber;
        const amounts = splitAmountToInstallments(v.amountNumber, nInst);

        const descBase = description.trim();

        const [yS, mS, dS] = date.split("-");
        const y = Number(yS);
        const m = Number(mS);
        const d = Number(dS);
        const txDateObj = new Date(y, m - 1, d);
        const baseMonthFirstDay = new Date(txDateObj.getFullYear(), txDateObj.getMonth(), 1);

        const batch = writeBatch(db);

        for (let i = 1; i <= nInst; i++) {
          let chargeISO: string;

          if (i === 1) {
            chargeISO = date;
          } else {
            const chargeDate = addMonthsKeepingDay(baseMonthFirstDay, i - 1, v.chargeDayNumber);
            chargeISO = toISODate(chargeDate);
          }

          // תיקון: אם אין תיאור - נשמור תיאור ריק, כדי שלא תהיה כפילות עם התג במסך תנועות
          const descFinal = descBase;

          const payload: Omit<EntryDoc, "id"> = {
            type,
            subType,
            date: chargeISO,
            monthKey: monthKeyFromISO(chargeISO),
            category,
            description: descFinal,
            amount: amounts[i - 1],
            userKey: userKeyFromEmail(user.email),

            createdAt: createdAtBase + i,
            createdBy: user.email,

            installmentsTotal: nInst,
            installmentIndex: i,
            installmentGroupId,
            chargeDay: v.chargeDayNumber,
          } as any;

          const ref = doc(collection(db, "records"));
          batch.set(ref, payload as any);
        }

        await batch.commit();
        setOk(`נשמר בהצלחה - נוצרו ${nInst} תשלומים.`);
      }

      setCategory("");
      setDescription("");
      setAmount("");
      setInstallments(1);
      setChargeDay(1);
    } catch (ex: any) {
      setErr(ex?.message || "שגיאה בשמירה. בדוק הרשאות Firestore.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppLayout title="הוספה">
      <div className="card">
        <h2>הוספת תנועה</h2>

        <form onSubmit={onSubmit} className="grid" style={{ gap: 12 }}>
          <div className="form-grid">
            <div className="grid" style={{ gap: 6 }}>
              <label>סוג</label>
              <select
                className="input"
                value={kind}
                onChange={(e) => {
                  const next = e.target.value as EntryKind;
                  setKind(next);
                  setCategory("");
                  resetMessages();

                  if (next === "income") {
                    setInstallments(1);
                    setChargeDay(1);
                  }
                }}
                disabled={saving}
              >
                <option value="expense_variable">הוצאה (משתנה)</option>
                <option value="income">הכנסה</option>
              </select>
            </div>

            <div className="grid" style={{ gap: 6 }}>
              <label>תאריך</label>
              <input
                className="input"
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  resetMessages();
                }}
                disabled={saving}
              />
            </div>
          </div>

          <div className="form-grid">
            <div className="grid" style={{ gap: 6 }}>
              <label>קטגוריה</label>
              <select
                className="input"
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  resetMessages();
                }}
                disabled={saving}
              >
                <option value="">בחר קטגוריה</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid" style={{ gap: 6 }}>
              <label>סכום</label>
              <input
                className="input"
                inputMode="decimal"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  resetMessages();
                }}
                placeholder="לדוגמה: 120"
                disabled={saving}
              />
            </div>
          </div>

          {showPayments ? (
            <div className="form-grid">
              <div className="grid" style={{ gap: 6 }}>
                <label>מספר תשלומים</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={60}
                  value={installments}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setInstallments(clampInt(n, 1, 60));
                    resetMessages();
                  }}
                  disabled={saving}
                />
              </div>

              <div className="grid" style={{ gap: 6 }}>
                <label>יום חיוב</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={28}
                  value={chargeDay}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setChargeDay(clampInt(n, 1, 28));
                    resetMessages();
                  }}
                  disabled={saving}
                />
              </div>
            </div>
          ) : null}

          {showPayments ? (
            <div className="muted" style={{ fontSize: 12 }}>
              תשלום ראשון לפי תאריך העסקה. תשלומים 2 ומעלה לפי יום החיוב בחודשים העוקבים. תג ״תשלום X/Y״ מוצג במסך ״תנועות״ בלבד.
            </div>
          ) : null}

          <div className="grid" style={{ gap: 6 }}>
            <label>תיאור</label>
            <input
              className="input"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                resetMessages();
              }}
              placeholder="לדוגמה: קניות בסופר"
              disabled={saving}
            />
          </div>

          {err ? <div style={{ color: "#fecdd3", fontSize: 12 }}>{err}</div> : null}
          {ok ? <div style={{ color: "#bbf7d0", fontSize: 12 }}>{ok}</div> : null}

          <div className="row" style={{ justifyContent: "space-between" }}>
            <button className="btn" type="submit" disabled={saving}>
              {saving ? "שומר..." : "שמור"}
            </button>

            <button
              className="btn secondary"
              type="button"
              disabled={saving}
              onClick={() => {
                setKind("expense_variable");
                setDate(todayISO());
                setCategory("");
                setDescription("");
                setAmount("");
                setInstallments(1);
                setChargeDay(1);
                resetMessages();
              }}
            >
              נקה
            </button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
