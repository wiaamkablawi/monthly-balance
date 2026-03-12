import React, { useMemo, useState } from "react";
import { collection, doc, writeBatch } from "firebase/firestore";
import AppLayout from "../app/layout/AppLayout";
import ImportEntriesModal from "../components/entry/ImportEntriesModal";
import {
  ADD_ENTRY_EXPENSE_CATEGORIES,
  ADD_ENTRY_INCOME_CATEGORIES,
  DASHBOARD_FIXED_EXPENSE_CATEGORIES,
} from "../domain/categories";
import { householdIdFromEmail, userKeyFromEmail } from "../services/authService";
import { auth } from "../services/firebase";
import { db } from "../services/firebaseDb";
import { saveFixedTemplate } from "../services/recordsService";
import type { EntryDoc, EntrySubType, EntryType } from "../types/models";
import { monthKeyFromISO, todayISO } from "../utils/dates";

type EntryKind = "expense_variable" | "expense_fixed" | "income";

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addMonthsKeepingDay(baseMonthFirstDay: Date, addMonths: number, day: number): Date {
  const target = new Date(baseMonthFirstDay.getFullYear(), baseMonthFirstDay.getMonth() + addMonths, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(Math.max(day, 1), lastDay));
}

function splitAmountToInstallments(total: number, n: number): number[] {
  const totalCents = Math.round(total * 100);
  const base = Math.floor(totalCents / n);
  const remainder = totalCents - base * n;

  return Array.from({ length: n }, (_, index) => (base + (index === 0 ? remainder : 0)) / 100);
}

export default function AddEntryPage() {
  const [kind, setKind] = useState<EntryKind>("expense_variable");
  const [date, setDate] = useState<string>(todayISO());
  const [category, setCategory] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [installments, setInstallments] = useState<number>(1);
  const [chargeDay, setChargeDay] = useState<number>(1);
  const [err, setErr] = useState<string>("");
  const [ok, setOk] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);
  const [isImportOpen, setIsImportOpen] = useState<boolean>(false);

  const categories = useMemo(() => {
    if (kind === "income") return ADD_ENTRY_INCOME_CATEGORIES;
    if (kind === "expense_fixed") return DASHBOARD_FIXED_EXPENSE_CATEGORIES;
    return ADD_ENTRY_EXPENSE_CATEGORIES;
  }, [kind]);

  const showInstallments = kind === "expense_variable";
  const showChargeDay = kind !== "income";

  function resetMessages() {
    setErr("");
    setOk("");
  }

  function resetForm() {
    setKind("expense_variable");
    setDate(todayISO());
    setCategory("");
    setDescription("");
    setAmount("");
    setInstallments(1);
    setChargeDay(1);
    resetMessages();
  }

  function validate(): { amountNumber: number; installmentsNumber: number; chargeDayNumber: number } | null {
    resetMessages();

    if (!date) {
      setErr("יש לבחור תאריך.");
      return null;
    }
    if (!category) {
      setErr("יש לבחור קטגוריה.");
      return null;
    }

    const normalizedAmount = amount.replace(/,/g, "").trim();
    const amountNumber = Number(normalizedAmount);

    if (!normalizedAmount || Number.isNaN(amountNumber) || !Number.isFinite(amountNumber)) {
      setErr("יש להזין סכום תקין.");
      return null;
    }
    if (amountNumber <= 0) {
      setErr("הסכום חייב להיות גדול מאפס.");
      return null;
    }

    const installmentsNumber = showInstallments ? clampInt(Number(installments), 1, 60) : 1;
    const chargeDayNumber = showChargeDay ? clampInt(Number(chargeDay), 1, 28) : 1;

    if (showInstallments && installmentsNumber < 1) {
      setErr("מספר התשלומים חייב להיות 1 או יותר.");
      return null;
    }
    if (showChargeDay && (chargeDayNumber < 1 || chargeDayNumber > 28)) {
      setErr("יום החיוב חייב להיות בין 1 ל-28.");
      return null;
    }

    return { amountNumber, installmentsNumber, chargeDayNumber };
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();

    const validated = validate();
    if (!validated) return;

    const user = auth.currentUser;
    if (!user || !user.email) {
      setErr("יש להתחבר מחדש לפני שמירה.");
      return;
    }

    const householdId = householdIdFromEmail(user.email);
    setSaving(true);
    resetMessages();

    try {
      if (kind === "expense_fixed") {
        await saveFixedTemplate({
          category,
          description: description.trim(),
          amount: validated.amountNumber,
          chargeDay: validated.chargeDayNumber,
          startDate: date,
          isActive: true,
        });

        setOk("ההוצאה הקבועה נשמרה כתבנית חודשית ותופיע גם בחודשים הבאים.");
        setCategory("");
        setDescription("");
        setAmount("");
        setChargeDay(1);
        return;
      }

      const type: EntryType = kind === "income" ? "income" : "expense";
      const subType: EntrySubType = "variable";
      const createdAtBase = Date.now();
      const installmentGroupId = `${createdAtBase}-${Math.random().toString(16).slice(2)}`;

      if (!showInstallments || validated.installmentsNumber === 1) {
        const payload: Omit<EntryDoc, "id"> = {
          type,
          subType,
          date,
          monthKey: monthKeyFromISO(date),
          category,
          description: description.trim(),
          amount: validated.amountNumber,
          userKey: userKeyFromEmail(user.email),
          ownerUid: user.uid,
          householdId,
          createdAt: createdAtBase,
          createdBy: user.email,
          ...(showChargeDay
            ? {
                installmentsTotal: 1,
                installmentIndex: 1,
                installmentGroupId,
                chargeDay: validated.chargeDayNumber,
              }
            : {}),
        };

        const batch = writeBatch(db);
        batch.set(doc(collection(db, "records")), payload as any);
        await batch.commit();
        setOk("התנועה נשמרה בהצלחה.");
      } else {
        const installmentsAmounts = splitAmountToInstallments(validated.amountNumber, validated.installmentsNumber);
        const [year, month, day] = date.split("-").map(Number);
        const transactionDate = new Date(year, month - 1, day);
        const baseMonthFirstDay = new Date(transactionDate.getFullYear(), transactionDate.getMonth(), 1);
        const batch = writeBatch(db);

        for (let index = 1; index <= validated.installmentsNumber; index += 1) {
          const chargeISO =
            index === 1
              ? date
              : toISODate(addMonthsKeepingDay(baseMonthFirstDay, index - 1, validated.chargeDayNumber));

          const payload: Omit<EntryDoc, "id"> = {
            type,
            subType,
            date: chargeISO,
            monthKey: monthKeyFromISO(chargeISO),
            category,
            description: description.trim(),
            amount: installmentsAmounts[index - 1],
            userKey: userKeyFromEmail(user.email),
            ownerUid: user.uid,
            householdId,
            createdAt: createdAtBase + index,
            createdBy: user.email,
            installmentsTotal: validated.installmentsNumber,
            installmentIndex: index,
            installmentGroupId,
            chargeDay: validated.chargeDayNumber,
          };

          batch.set(doc(collection(db, "records")), payload as any);
        }

        await batch.commit();
        setOk(`התנועה נשמרה בהצלחה ונוצרו ${validated.installmentsNumber} תשלומים.`);
      }

      setCategory("");
      setDescription("");
      setAmount("");
      setInstallments(1);
      setChargeDay(1);
    } catch (error: any) {
      setErr(error?.message || "אירעה שגיאה בשמירת התנועה. בדוק הרשאות Firestore.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppLayout title="קליטה" subtitle="הזנה ידנית או ממצלמה, עם תמיכה בתשלומים ופיצול אוטומטי.">
      <div className="page-stack">
        <div className="card">
          <div className="section-header compact">
            <div>
              <div className="section-title">ייבוא קובץ או צילום מסך</div>
              <div className="section-subtitle">המערכת תפרק צילום מסך של טבלת עסקאות לשורות בודדות, תציג אותן לאישור, ורק אז תשמור.</div>
            </div>
          </div>

          <div className="grid" style={{ gap: 10 }}>
            <div className="muted text-small">תומך ב־CSV, Excel, PDF ותמונות. בצילומי מסך של עסקאות מתבצע OCR עם preview לפני שמירה.</div>
            <div className="toolbar-actions" style={{ justifyContent: "space-between" }}>
              <div className="muted text-small">הייבוא החדש לא מוסיף שורות ישר למסד, אלא עובר קודם למסך בדיקה.</div>
              <button
                className="btn secondary"
                type="button"
                onClick={() => {
                  resetMessages();
                  setIsImportOpen(true);
                }}
                disabled={saving}
              >
                פתח מסך ייבוא
              </button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="section-header compact">
            <div>
              <div className="section-title">הוספה ידנית</div>
              <div className="section-subtitle">תנועה בודדת, הוצאה קבועה חודשית או הוצאה בתשלומים.</div>
            </div>
          </div>

          <form onSubmit={onSubmit} className="grid" style={{ gap: 12 }}>
            <div className="form-grid">
              <div className="grid" style={{ gap: 6 }}>
                <label>סוג</label>
                <select
                  className="input"
                  value={kind}
                  onChange={(event) => {
                    const nextKind = event.target.value as EntryKind;
                    setKind(nextKind);
                    setCategory("");
                    setInstallments(1);
                    setChargeDay(1);
                    resetMessages();
                  }}
                  disabled={saving}
                >
                  <option value="expense_variable">הוצאה משתנה</option>
                  <option value="expense_fixed">הוצאה קבועה</option>
                  <option value="income">הכנסה</option>
                </select>
              </div>

              <div className="grid" style={{ gap: 6 }}>
                <label>{kind === "expense_fixed" ? "תאריך התחלה" : "תאריך"}</label>
                <input className="input" type="date" value={date} onChange={(event) => setDate(event.target.value)} disabled={saving} />
              </div>
            </div>

            <div className="form-grid">
              <div className="grid" style={{ gap: 6 }}>
                <label>קטגוריה</label>
                <select className="input" value={category} onChange={(event) => setCategory(event.target.value)} disabled={saving}>
                  <option value="">בחר קטגוריה</option>
                  {categories.map((item) => (
                    <option key={item} value={item}>
                      {item}
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
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="לדוגמה: 120"
                  disabled={saving}
                />
              </div>
            </div>

            {showInstallments ? (
              <div className="form-grid">
                <div className="grid" style={{ gap: 6 }}>
                  <label>מספר תשלומים</label>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={60}
                    value={installments}
                    onChange={(event) => setInstallments(clampInt(Number(event.target.value), 1, 60))}
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
                    onChange={(event) => setChargeDay(clampInt(Number(event.target.value), 1, 28))}
                    disabled={saving}
                  />
                </div>
              </div>
            ) : null}

            {!showInstallments && showChargeDay ? (
              <div className="grid" style={{ gap: 6 }}>
                <label>יום חיוב חודשי</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={28}
                  value={chargeDay}
                  onChange={(event) => setChargeDay(clampInt(Number(event.target.value), 1, 28))}
                  disabled={saving}
                />
              </div>
            ) : null}

            {kind === "expense_variable" ? (
              <div className="muted text-small">
                התשלום הראשון נרשם בתאריך שבחרת. תשלומים 2 ומעלה ייפרשו אוטומטית לפי יום החיוב בחודשים הבאים.
              </div>
            ) : null}

            {kind === "expense_fixed" ? (
              <div className="note-banner">
                הוצאה קבועה נשמרת כתבנית חודשית. מהחודש שנבחר והלאה המערכת תיצור את החיוב אוטומטית בדוחות וביומן.
              </div>
            ) : null}

            <div className="grid" style={{ gap: 6 }}>
              <label>תיאור</label>
              <input
                className="input"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="לדוגמה: ועד בית או מנוי אינטרנט"
                disabled={saving}
              />
            </div>

            {err ? <div className="error-banner">{err}</div> : null}
            {ok ? <div className="note-banner">{ok}</div> : null}

            <div className="toolbar-actions" style={{ justifyContent: "space-between" }}>
              <button className="btn" type="submit" disabled={saving}>
                {saving ? "שומר..." : kind === "expense_fixed" ? "שמור הוצאה קבועה" : "שמור"}
              </button>

              <button className="btn secondary" type="button" disabled={saving} onClick={resetForm}>
                נקה טופס
              </button>
            </div>
          </form>
        </div>
      </div>

      <ImportEntriesModal
        open={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        monthKey={monthKeyFromISO(date)}
        defaultDateISO={date || todayISO()}
        onSaved={() => {
          setErr("");
          setOk("הייבוא הושלם. אפשר לעבור ליומן התנועות כדי לבדוק את הרשומות החדשות.");
        }}
      />
    </AppLayout>
  );
}
