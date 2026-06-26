import React, { useMemo, useState } from "react";
import { collection, doc, writeBatch } from "firebase/firestore";
import { useNavigate, useSearchParams } from "react-router-dom";
import AppLayout from "../app/layout/AppLayout";
import ImportEntriesModal from "../components/entry/ImportEntriesModal";
import { useToast } from "../components/Toast";
import {
  ADD_ENTRY_EXPENSE_CATEGORIES,
  ADD_ENTRY_INCOME_CATEGORIES,
  DASHBOARD_FIXED_EXPENSE_CATEGORIES,
} from "../domain/categories";
import { householdIdFromEmail, userKeyFromEmail } from "../services/authService";
import { auth } from "../services/firebase";
import { db } from "../services/firebaseDb";
import { findSimilarEntry, invalidateRecordsState, saveFixedTemplate } from "../services/recordsService";
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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const toast = useToast();

  const initialKind = ((): EntryKind => {
    const t = searchParams.get("type");
    if (t === "income") return "income";
    if (t === "fixed") return "expense_fixed";
    return "expense_variable";
  })();

  const [kind, setKind] = useState<EntryKind>(initialKind);
  const [date, setDate] = useState<string>(todayISO());
  const [category, setCategory] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [installments, setInstallments] = useState<number>(1);
  const [chargeDay, setChargeDay] = useState<number>(1);
  const [err, setErr] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);
  const [isImportOpen, setIsImportOpen] = useState<boolean>(false);
  const [dupCandidate, setDupCandidate] = useState<EntryDoc | null>(null);
  const [dupResolve, setDupResolve] = useState<((v: boolean) => void) | null>(null);

  const categories = useMemo(() => {
    if (kind === "income") return ADD_ENTRY_INCOME_CATEGORIES;
    if (kind === "expense_fixed") return DASHBOARD_FIXED_EXPENSE_CATEGORIES;
    return ADD_ENTRY_EXPENSE_CATEGORIES;
  }, [kind]);

  const showInstallments = kind === "expense_variable";
  const showChargeDay = kind === "expense_fixed";

  function resetForm() {
    setKind("expense_variable");
    setDate(todayISO());
    setCategory("");
    setDescription("");
    setAmount("");
    setInstallments(1);
    setChargeDay(1);
    setErr("");
  }

  function navigateToUpdatedSummary(targetMonthKey: string) {
    navigate(`/?month=${encodeURIComponent(targetMonthKey)}`, { replace: true });
  }

  function showDuplicateWarning(entry: EntryDoc): Promise<boolean> {
    return new Promise((resolve) => {
      setDupCandidate(entry);
      setDupResolve(() => resolve);
    });
  }

  function dismissDuplicateWarning(confirmed: boolean) {
    dupResolve?.(confirmed);
    setDupCandidate(null);
    setDupResolve(null);
  }

  function validate(): { amountNumber: number; installmentsNumber: number; chargeDayNumber: number } | null {
    setErr("");

    if (!date) { setErr("יש לבחור תאריך."); return null; }
    if (!category) { setErr("יש לבחור קטגוריה."); return null; }

    const normalizedAmount = amount.replace(/,/g, "").trim();
    const amountNumber = Number(normalizedAmount);

    if (!normalizedAmount || !Number.isFinite(amountNumber)) { setErr("יש להזין סכום תקין."); return null; }
    if (amountNumber <= 0) { setErr("הסכום חייב להיות גדול מאפס."); return null; }

    const installmentsNumber = showInstallments ? clampInt(Number(installments), 1, 60) : 1;
    const chargeDayNumber = showInstallments || showChargeDay ? clampInt(Number(chargeDay), 1, 28) : 1;

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
    setErr("");

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
        toast.show(`הוצאה קבועה נשמרה — ${category}`, "success");
        navigateToUpdatedSummary(monthKeyFromISO(date));
        return;
      }

      const type: EntryType = kind === "income" ? "income" : "expense";
      const subType: EntrySubType = "variable";
      const createdAtBase = Date.now();
      const installmentGroupId = `${createdAtBase}-${Math.random().toString(16).slice(2)}`;

      const similar = await findSimilarEntry({
        householdId,
        date,
        amount: validated.amountNumber,
        category,
        type,
      });

      if (similar) {
        const confirmed = await showDuplicateWarning(similar);
        if (!confirmed) { setSaving(false); return; }
      }

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
        };

        const batch = writeBatch(db);
        batch.set(doc(collection(db, "records")), payload);
        await batch.commit();
        invalidateRecordsState();
        toast.show(
          kind === "income"
            ? `הכנסה נשמרה — ₪${validated.amountNumber.toLocaleString("he-IL")}`
            : `הוצאה נשמרה — ${category} ₪${validated.amountNumber.toLocaleString("he-IL")}`,
          "success"
        );
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

          batch.set(doc(collection(db, "records")), payload);
        }

        await batch.commit();
        invalidateRecordsState();
        toast.show(
          `${category} — ${validated.installmentsNumber} תשלומים נשמרו`,
          "success"
        );
      }

      navigateToUpdatedSummary(monthKeyFromISO(date));
    } catch (error: any) {
      const msg = error?.message || "אירעה שגיאה בשמירת התנועה.";
      setErr(msg);
      toast.show(msg, "error");
    } finally {
      setSaving(false);
    }
  }

  const kindLabel: Record<EntryKind, string> = {
    expense_variable: "הוצאה משתנה",
    expense_fixed: "הוצאה קבועה",
    income: "הכנסה",
  };

  return (
    <AppLayout
      title="קליטת תנועה"
      subtitle="הזנה ידנית, הוצאה קבועה, תשלומים, או ייבוא קובץ — הכל ממסך אחד."
    >
      <div className="page-stack">
        {/* Import card */}
        <section className="card coral-card">
          <div className="section-header compact">
            <div>
              <div className="section-title">ייבוא קובץ או צילום מסך</div>
              <div className="section-subtitle">המערכת מפרקת קובץ לשורות לעריכה — שמירה רק אחרי אישורך.</div>
            </div>
            <button
              className="btn coral-btn"
              type="button"
              onClick={() => { setErr(""); setIsImportOpen(true); }}
              disabled={saving}
            >
              📋 פתח ייבוא
            </button>
          </div>
          <div className="muted text-small" style={{ marginTop: 4 }}>
            נתמכים CSV, Excel, PDF ותמונות. צילומי מסך מנותחים עם OCR ומוצגים לעריכה לפני שמירה.
          </div>
        </section>

        {/* Manual entry card */}
        <section className="card coral-card">
          <div className="section-header compact" style={{ marginBottom: 16 }}>
            <div>
              <div className="section-title">הזנה ידנית</div>
              <div className="section-subtitle">תנועה בודדת, הוצאה קבועה, או רכישה בתשלומים.</div>
            </div>
            <div
              style={{
                padding: "6px 14px",
                borderRadius: 999,
                background: "rgba(255,92,53,0.1)",
                color: "var(--coral-primary, #FF5C35)",
                fontWeight: 700,
                fontSize: "0.82rem",
              }}
            >
              {kindLabel[kind]}
            </div>
          </div>

          <form id="add-entry-form" onSubmit={onSubmit} className="grid">
            <div className="form-grid">
              <div className="grid">
                <label>סוג תנועה</label>
                <select
                  className="input"
                  value={kind}
                  onChange={(e) => {
                    setKind(e.target.value as EntryKind);
                    setCategory("");
                    setInstallments(1);
                    setChargeDay(1);
                    setErr("");
                  }}
                  disabled={saving}
                >
                  <option value="expense_variable">הוצאה משתנה</option>
                  <option value="expense_fixed">הוצאה קבועה</option>
                  <option value="income">הכנסה</option>
                </select>
              </div>

              <div className="grid">
                <label>{kind === "expense_fixed" ? "תאריך התחלה" : "תאריך"}</label>
                <input
                  className="input"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  disabled={saving}
                />
              </div>
            </div>

            <div className="form-grid">
              <div className="grid">
                <label>קטגוריה</label>
                <select
                  className="input"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  disabled={saving}
                >
                  <option value="">— בחר קטגוריה —</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="grid">
                <label>סכום (₪)</label>
                <div className="amount-field-wrap">
                  <span className="amount-currency-prefix">₪</span>
                  <input
                    className="input"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    disabled={saving}
                    style={{ paddingLeft: 36 }}
                  />
                </div>
              </div>
            </div>

            {showInstallments && (
              <div className="form-grid">
                <div className="grid">
                  <label>מספר תשלומים</label>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={60}
                    value={installments}
                    onChange={(e) => setInstallments(clampInt(Number(e.target.value), 1, 60))}
                    disabled={saving}
                  />
                </div>
                <div className="grid">
                  <label>יום חיוב (תשלום 2+)</label>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={28}
                    value={chargeDay}
                    onChange={(e) => setChargeDay(clampInt(Number(e.target.value), 1, 28))}
                    disabled={saving}
                  />
                </div>
              </div>
            )}

            {showChargeDay && !showInstallments && (
              <div className="grid">
                <label>יום חיוב חודשי</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={28}
                  value={chargeDay}
                  onChange={(e) => setChargeDay(clampInt(Number(e.target.value), 1, 28))}
                  disabled={saving}
                />
              </div>
            )}

            {kind === "expense_variable" && installments > 1 && (
              <div className="note-banner">
                תשלום 1 מתוך {installments} יישמר בתאריך שנבחר. יתר התשלומים ייוצרו אוטומטית לפי יום החיוב.
              </div>
            )}

            {kind === "expense_fixed" && (
              <div className="note-banner">
                הוצאה קבועה נשמרת כתבנית חודשית. מהחודש שנבחר והלאה תוצג בדשבורד ובדו״חות.
              </div>
            )}

            <div className="grid">
              <label>תיאור (אופציונלי)</label>
              <input
                className="input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="לדוגמה: ועד בית, מנוי Netflix"
                disabled={saving}
              />
            </div>

            {err && <div className="error-banner">{err}</div>}

            <div className="form-submit-bar">
              <button className="btn" type="submit" disabled={saving} style={{ minWidth: 160 }}>
                {saving ? (
                  <>שומר...<span className="saving-spinner" /></>
                ) : kind === "expense_fixed" ? "שמור הוצאה קבועה" : "שמור תנועה"}
              </button>
              <button className="btn secondary" type="button" disabled={saving} onClick={resetForm}>
                נקה טופס
              </button>
            </div>
          </form>
        </section>
      </div>

      <ImportEntriesModal
        open={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        monthKey={monthKeyFromISO(date)}
        defaultDateISO={date || todayISO()}
        onSaved={(savedMonthKey) => {
          toast.show("הייבוא הושלם בהצלחה", "success");
          navigateToUpdatedSummary(savedMonthKey);
        }}
      />

      {dupCandidate && (
        <div className="dup-warning-overlay">
          <div className="dup-warning-box">
            <div className="dup-warning-title">⚠️ נמצאה הוצאה דומה</div>
            <div className="dup-warning-details">
              <span>{dupCandidate.date}</span>
              <span>{dupCandidate.category}</span>
              <span>₪{dupCandidate.amount.toLocaleString("he-IL")}</span>
            </div>
            {dupCandidate.description && (
              <div className="dup-warning-desc">{dupCandidate.description}</div>
            )}
            <div className="dup-warning-actions">
              <button className="btn secondary" type="button" onClick={() => dismissDuplicateWarning(false)}>
                ביטול
              </button>
              <button className="btn" type="button" onClick={() => dismissDuplicateWarning(true)}>
                הוסף בכל זאת
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
