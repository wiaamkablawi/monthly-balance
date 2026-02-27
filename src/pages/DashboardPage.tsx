import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { userKeyFromEmail } from "../services/authService";
import AppLayout from "../app/layout/AppLayout";
import { currentMonthKey, monthKeyFromISO } from "../utils/dates";
import { formatILS } from "../utils/money";
import { auth, db } from "../services/firebase";
import type { EntryDoc } from "../types/models";

import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
} from "chart.js";
import { Doughnut, Bar } from "react-chartjs-2";

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  query,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

function toMillis(v: any): number {
  if (!v) return 0;
  if (typeof v === "number") return v;
  if (typeof v?.toMillis === "function") return v.toMillis();
  if (typeof v?.seconds === "number") return v.seconds * 1000;
  return 0;
}

type LoadState = "idle" | "loading" | "ready" | "error";

function typeLabel(e: EntryDoc): string {
  if (e.type === "income") return "הכנסה";
  return "הוצאה";
}

function isFixedExpense(e: any): boolean {
  return e?.type === "expense" && (e?.subType === "fixed" || e?.subType === "fixed_realization");
}

function isVariableExpense(e: any): boolean {
  return e?.type === "expense" && (e?.subType === "variable" || !e?.subType);
}

type AddKind = "income" | "expense_variable" | "expense_fixed";

function kindToDoc(kind: AddKind): { type: EntryDoc["type"]; subType?: EntryDoc["subType"] } {
  if (kind === "income") return { type: "income" };
  if (kind === "expense_fixed") return { type: "expense", subType: "fixed_realization" };
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

type ParsedImportRow = {
  id: string;
  type: EntryDoc["type"];
  date: string;
  category: string;
  description: string;
  amount: string;
  selected: boolean;
};

function toISODateString(v: any, fallbackISO: string): string {
  if (!v) return fallbackISO;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const yyyy = v.getFullYear();
    const mm = String(v.getMonth() + 1).padStart(2, "0");
    const dd = String(v.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (!m) return fallbackISO;
  const dd = m[1].padStart(2, "0");
  const mm = m[2].padStart(2, "0");
  const yyyy = (m[3].length === 2 ? `20${m[3]}` : m[3]).padStart(4, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function detectTypeFromRaw(typeRaw: string, amount: number): EntryDoc["type"] {
  const t = typeRaw.trim().toLowerCase();
  if (t.includes("income") || t.includes("הכנסה") || t.includes("credit") || t.includes("זיכוי")) return "income";
  if (t.includes("expense") || t.includes("הוצאה") || t.includes("debit") || t.includes("חיוב")) return "expense";
  return amount >= 0 ? "income" : "expense";
}

async function parseFileToRows(file: File, fallbackISO: string): Promise<ParsedImportRow[]> {
  const ext = file.name.split(".").pop()?.toLowerCase();

  if (ext === "xlsx" || ext === "xls" || ext === "csv") {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "array", cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });

    return rows
      .map((row, i): ParsedImportRow | null => {
        const amountRaw = row.amount || row.Amount || row.sum || row.Total || row["סכום"] || row["חיוב"] || row["זיכוי"];
        const numericAmount = Number(String(amountRaw || "").replace(/,/g, "").trim());
        if (!Number.isFinite(numericAmount) || numericAmount === 0) return null;

        const dateRaw = row.date || row.Date || row["תאריך"];
        const descRaw = row.description || row.Description || row.details || row["תיאור"] || "";
        const categoryRaw = row.category || row.Category || row["קטגוריה"] || "אחר";
        const typeRaw = row.type || row.Type || row["סוג"] || "";
        const type = detectTypeFromRaw(String(typeRaw || ""), numericAmount);

        return {
          id: `${file.name}-${i}-${Math.random().toString(16).slice(2)}`,
          type,
          date: toISODateString(dateRaw, fallbackISO),
          category: String(categoryRaw || "אחר").trim(),
          description: String(descRaw || "").trim() || "ייבוא קובץ",
          amount: String(Math.abs(numericAmount)),
          selected: true,
        };
      })
      .filter((x): x is ParsedImportRow => Boolean(x));
  }

  if (ext === "pdf" || ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "webp") {
    return [
      {
        id: `${file.name}-manual-1`,
        type: "expense",
        date: fallbackISO,
        category: "אחר",
        description: `טיוטה מקובץ ${file.name} (נדרש דיוק ידני)`,
        amount: "0",
        selected: true,
      },
    ];
  }

  return [];
}

function ImportEntriesModal(props: {
  open: boolean;
  onClose: () => void;
  monthKey: string;
  defaultDateISO: string;
  onSaved: () => void;
}) {
  const { open, onClose, monthKey, defaultDateISO, onSaved } = props;
  const [rows, setRows] = useState<ParsedImportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;
    setRows([]);
    setErr("");
    setNote("");
  }, [open]);

  async function onUploadFile(file?: File) {
    if (!file || loading) return;
    setLoading(true);
    setErr("");
    setNote("");

    try {
      const parsed = await parseFileToRows(file, defaultDateISO);
      if (!parsed.length) {
        setErr("לא הצלחנו לזהות שורות בקובץ. אפשר לערוך ידנית אחרי בחירת קובץ נתמך.");
        return;
      }

      if (file.name.match(/\.(pdf|png|jpg|jpeg|webp)$/i)) {
        setNote("בקובצי PDF/תמונה נפתחת טיוטה לעריכה ידנית לפני אישור.");
      }

      setRows(parsed);
    } catch (e: any) {
      setErr(e?.message || "שגיאה בניתוח הקובץ.");
    } finally {
      setLoading(false);
    }
  }

  function updateRow(id: string, patch: Partial<ParsedImportRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function selectAll(next: boolean) {
    setRows((prev) => prev.map((r) => ({ ...r, selected: next })));
  }

  async function saveSelected() {
    if (saving) return;
    const selectedRows = rows.filter((r) => r.selected);
    if (!selectedRows.length) {
      setErr("אין שורות מאושרות לשמירה.");
      return;
    }

    const user = auth.currentUser;
    if (!user?.email) {
      setErr("משתמש לא מחובר.");
      return;
    }

    setSaving(true);
    setErr("");
    try {
      const batch = writeBatch(db);
      selectedRows.forEach((r) => {
        const amountNum = Number(r.amount);
        if (!Number.isFinite(amountNum) || amountNum <= 0) return;
        const ref = doc(collection(db, "records"));
        const mk = monthKeyFromISO(r.date || defaultDateISO);
        batch.set(ref, {
          type: r.type,
          subType: r.type === "expense" ? "variable" : undefined,
          date: r.date || defaultDateISO,
          month: mk || monthKey,
          monthKey: mk || monthKey,
          category: r.category || "אחר",
          description: r.description || "ייבוא קובץ",
          amount: Math.abs(amountNum),
          userEmail: user.email,
          userKey: userKeyFromEmail(user.email),
          importSource: "file_upload",
          createdAt: Date.now(),
        });
      });

      await batch.commit();
      onSaved();
      onClose();
    } catch (e: any) {
      setErr(e?.message || "שגיאה בשמירת שורות.");
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
      <div style={{ width: "min(1080px, 96vw)", maxHeight: "85vh", overflow: "auto", borderRadius: 18, border: "1px solid rgba(15,23,42,0.10)", background: "#fff", boxShadow: "0 24px 70px rgba(2,6,23,0.20)", padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <div style={{ fontWeight: 900 }}>הוספת קובץ וניתוח תנועות</div>
          <button className="btn secondary" type="button" onClick={onClose} disabled={saving || loading}>
            סגור
          </button>
        </div>
        <div style={{ height: 12 }} />

        <input
          className="input"
          type="file"
          accept=".xlsx,.xls,.csv,.pdf,image/*"
          onChange={(e) => onUploadFile(e.target.files?.[0])}
          disabled={loading || saving}
        />

        <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
          המערכת תנתח את הקובץ ותציע פעולות. אפשר לאשר הכל, לדחות הכל או לערוך כל שורה בנפרד.
        </div>

        {note ? <div className="muted" style={{ marginTop: 8 }}>{note}</div> : null}
        {err ? <div className="error" style={{ marginTop: 8 }}>{err}</div> : null}

        {rows.length ? (
          <>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="btn secondary" type="button" onClick={() => selectAll(true)} disabled={saving || loading}>
                אשר הכל
              </button>
              <button className="btn secondary" type="button" onClick={() => selectAll(false)} disabled={saving || loading}>
                דחה הכל
              </button>
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
              {rows.map((r) => (
                <div key={r.id} className="card" style={{ display: "grid", gap: 8 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input type="checkbox" checked={r.selected} onChange={(e) => updateRow(r.id, { selected: e.target.checked })} />
                    לאשר שורה
                  </label>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                    <select className="input" value={r.type} onChange={(e) => updateRow(r.id, { type: e.target.value as EntryDoc["type"] })}>
                      <option value="expense">הוצאה</option>
                      <option value="income">הכנסה</option>
                    </select>
                    <input className="input" type="date" value={r.date} onChange={(e) => updateRow(r.id, { date: e.target.value })} />
                    <input className="input" value={r.amount} onChange={(e) => updateRow(r.id, { amount: e.target.value })} placeholder="סכום" />
                    <input className="input" value={r.category} onChange={(e) => updateRow(r.id, { category: e.target.value })} placeholder="קטגוריה" />
                    <input className="input" style={{ gridColumn: "1 / -1" }} value={r.description} onChange={(e) => updateRow(r.id, { description: e.target.value })} placeholder="תיאור" />
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
              <button className="btn" type="button" onClick={saveSelected} disabled={saving || loading}>
                {saving ? "שומר..." : "שמור שורות מאושרות"}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function AddEntryModal(props: {
  open: boolean;
  onClose: () => void;
  monthKey: string;
  defaultDateISO: string;
  onSaved: () => void;
}) {
  const { open, onClose, monthKey, defaultDateISO, onSaved } = props;

  const variableExpenseCategories = useMemo(
    () => [
      "מזון",
      "דלק",
      "בילוי עם הילדים",
      "בילוי ומסעדות",
      "מתנות",
      "קניות אונליין",
      "Maxstock",
      "ביגוד והנעלה",
      "בתי מרקחת וטיפוח",
      "רכב",
      "אלכוהול",
      "סיגריות ונרגילה",
      "תחזוקת הבית",
      "אחר",
    ],
    []
  );

  const fixedExpenseCategories = useMemo(
    () => [
      "הלוואות ודיור",
      "ביטוחים ובריאות",
      "תקשורת ואינטרנט",
      "תשתיות ותחבורה",
      "מנויים דיגיטליים",
      "בנקאות ואשראי",
      "אחר",
    ],
    []
  );

  const incomeCategories = useMemo(() => ["משכורת", "החזר", "הכנסה נוספת", "אחר"], []);

  const defaultCategoryForKind = (k: AddKind): string => {
    if (k === "income") return "משכורת";
    if (k === "expense_fixed") return "הלוואות ודיור";
    return "מזון";
  };

  const [kind, setKind] = useState<AddKind>("expense_variable");
  const [date, setDate] = useState<string>(defaultDateISO);
  const [category, setCategory] = useState<string>(defaultCategoryForKind("expense_variable"));
  const [description, setDescription] = useState<string>("");
  const [amount, setAmount] = useState<string>("");

  const [installments, setInstallments] = useState<number>(1);
  const [chargeDay, setChargeDay] = useState<number>(1);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string>("");

  const isIncome = kind === "income";
  const isExpense = kind !== "income";

  const categoryOptions = useMemo(() => {
    if (isIncome) return incomeCategories;
    if (kind === "expense_fixed") return fixedExpenseCategories;
    return variableExpenseCategories;
  }, [isIncome, kind, incomeCategories, fixedExpenseCategories, variableExpenseCategories]);

  // איפוס יסודי בכל פתיחה של המודאל
  useEffect(() => {
    if (!open) return;

    setErr("");
    setKind("expense_variable");
    setDate(defaultDateISO);
    setCategory("מזון");
    setDescription("");
    setAmount("");
    setInstallments(1);
    setChargeDay(1);
  }, [open, defaultDateISO]);

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
          date,
          month: monthKey,
          monthKey,
          category,
          description: description.trim(),
          amount: amountNumber,
          userEmail: user.email,
          userKey: userKeyFromEmail(user.email),
          createdAt: Date.now(),
        };

        if (kind === "expense_fixed") {
          payload.chargeDay = chargeDay;
        }

        if (subType) {
          payload.subType = subType;
        }

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
          month: monthKeyFromISO(chargeISO),
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
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={saving} />
          </div>

          <div>
            <label>סוג</label>
            <select
              className="input"
              value={kind}
              onChange={(e) => {
                const nextKind = e.target.value as AddKind;
                setKind(nextKind);
                setCategory(defaultCategoryForKind(nextKind));
                setDescription("");
                setAmount("");
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

          <div>
            <label>סכום</label>
            <input className="input" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={saving} />
          </div>

          <div>
            <label>קטגוריה</label>
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)} disabled={saving}>
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

    const uk = userKeyFromEmail(user.email);
    if (uk !== "W") return;

    const existingQ = query(
      collection(db, "records"),
      where("monthKey", "==", targetMonthKey),
      where("subType", "==", "fixed_realization"),
      limit(1)
    );
    const existingSnap = await getDocs(existingQ);
    if (!existingSnap.empty) return;

    const tmplSnap = await getDocs(query(collection(db, "fixed_templates")));
    if (tmplSnap.empty) return;

    const batch = writeBatch(db);

    tmplSnap.forEach((t) => {
      const data: any = t.data();

      const chargeDayRaw = Number(data.chargeDay || 1);
      const chargeDay = Math.max(1, Math.min(28, chargeDayRaw));

      const dd = String(chargeDay).padStart(2, "0");
      const dateISO = `${targetMonthKey}-${dd}`;

      const docId = `fx__${targetMonthKey}__${uk}__${t.id}`;
      const ref = doc(collection(db, "records"), docId);

      batch.set(ref, {
        type: "expense",
        subType: "fixed_realization",
        monthKey: targetMonthKey,
        month: targetMonthKey,
        date: dateISO,

        category: String(data.category || "אחר"),
        description: String(data.description || "").trim(),
        amount: Number(data.amount || 0),

        chargeDay,
        templateId: t.id,
        source: "fixed_template",

        userEmail: user.email,
        userKey: uk,
        createdAt: Date.now(),
      });
    });

    await batch.commit();
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

      // תופסים גם רשומות ישנות שיש להן month בלי monthKey
const qByMonthKey = query(collection(db, "records"), where("monthKey", "==", monthKey));
const qByMonth = query(collection(db, "records"), where("month", "==", monthKey));

const [snapKey, snapMonth] = await Promise.all([getDocs(qByMonthKey), getDocs(qByMonth)]);
if (cancelled) return;

const seen = new Set<string>();
const arr: EntryDoc[] = [];

const pushSnap = (snap: any) => {
  snap.forEach((d: any) => {
    if (seen.has(d.id)) return;
    seen.add(d.id);

    const data: any = d.data();
    const mk = data.monthKey || data.month || monthKey;
    arr.push({ id: d.id, ...data, monthKey: mk, month: data.month || mk });
  });
};

pushSnap(snapKey);
pushSnap(snapMonth);


        const today = new Date();

        const filtered = arr.filter((it: any) => {
          if (!isFixedExpense(it)) return true;

          const chargeDay = Number(it.chargeDay || 1);
          const mk2 = it.monthKey || it.month || monthKey;

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
        const qByMonth = query(
          collection(db, "records"),
          where("type", "==", "expense"),
          where("month", "in", last6Months)
        );

        const qByMonthKey = query(
          collection(db, "records"),
          where("type", "==", "expense"),
          where("monthKey", "in", last6Months)
        );

        const [snap1, snap2] = await Promise.all([getDocs(qByMonth), getDocs(qByMonthKey)]);
        if (cancelled) return;

        const seen = new Set<string>();
        const docs: any[] = [];

        snap1.forEach((d) => {
          if (seen.has(d.id)) return;
          seen.add(d.id);
          docs.push({ id: d.id, ...d.data() });
        });

        snap2.forEach((d) => {
          if (seen.has(d.id)) return;
          seen.add(d.id);
          docs.push({ id: d.id, ...d.data() });
        });

        const map = new Map<string, number>();
        last6Months.forEach((m) => map.set(m, 0));

        docs.forEach((data) => {
          if (isFixedExpense(data)) return;

          const mk = String(data.monthKey || data.month || "").trim();
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
        month: mk,
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
                month: mk,
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
        </div>

        <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
          תצוגה חודשית. הכרטיסיות והגרף מתעדכנים אוטומטית לפי החודש.
        </div>

        <div
          className="card"
          style={{
            marginTop: 12,
            padding: 10,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 10,
          }}
        >
          <button className="btn" onClick={() => setIsAddOpen(true)} disabled={state === "loading"}>
            ➕ הוספת תנועה ידנית
          </button>
          <button
            className="btn"
            onClick={() => setIsImportOpen(true)}
            disabled={state === "loading"}
            style={{ background: "linear-gradient(135deg, rgba(168,85,247,0.95), rgba(37,99,235,0.92))" }}
          >
            📁 הוספת קובץ וניתוחו
          </button>
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
                      labels: variableExpensesByCategory.map((d) => d.category),
                      datasets: [
                        {
                          data: variableExpensesByCategory.map((d) => d.value),
                          backgroundColor: [
                            "#dc2626",
                            "#ea580c",
                            "#ca8a04",
                            "#16a34a",
                            "#0891b2",
                            "#2563eb",
                            "#7c3aed",
                            "#be185d",
                          ],
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
                            label: (ctx) => {
                              const value = ctx.raw as number;
                              return `${ctx.label}: ${formatILS(value)}`;
                            },
                          },
                        },
                      },
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          <div
            className="card"
            style={{
              background: "linear-gradient(180deg, #ffffff, #f8fafc)",
              borderRadius: 20,
              boxShadow: "0 30px 60px rgba(0,0,0,0.18)",
            }}
          >
            <h3 style={{ marginBottom: 12 }}>הוצאות משתנות - השוואה חודשית</h3>

            {variableExpensesTrend.length === 0 ? (
              <div className="muted">אין נתונים להצגה</div>
            ) : (
              <Bar
                data={{
                  labels: variableExpensesTrend.map((d) => d.month),
                  datasets: [
                    {
                      data: variableExpensesTrend.map((d) => d.value),
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
                        label: (ctx) => formatILS(ctx.raw as number),
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
                        callback: (v) => formatILS(Number(v)),
                      },
                    },
                  },
                }}
              />
            )}
          </div>
        </div>

        <div style={{ height: 18 }} />

        <div
          className="card"
          style={{
            background: "linear-gradient(180deg, #ffffff, #f8fafc)",
            borderRadius: 20,
            boxShadow: "0 30px 60px rgba(0,0,0,0.18)",
          }}
        >
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontWeight: 900 }}>תנועות</div>
            {err ? <div className="error">{err}</div> : null}
          </div>

          <div style={{ height: 10 }} />

          {state === "loading" ? <div className="muted">טוען...</div> : null}

          {state !== "loading" && items.length === 0 ? <div className="muted">אין נתונים לחודש הזה.</div> : null}

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
                        : "4px solid rgba(239,68,68,0.95)",
                  }}
                >
                  {!isEditing ? (
                    <>
                      <div
                        className="row"
                        style={{
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          gap: 12,
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontWeight: 900,
                              color:
                                it.type === "income"
                                  ? "rgba(34,197,94,0.95)"
                                  : isFixedExpense(it)
                                  ? "rgba(168,85,247,0.95)"
                                  : "rgba(239,68,68,0.95)",
                            }}
                          >
                            {it.category || "ללא קטגוריה"} - {formatILS(Number(it.amount || 0))}
                          </div>

                          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                            {typeLabel(it)}
                            {isFixedExpense(it) ? " קבועה" : it.type === "expense" ? " משתנה" : ""}
                            {it.description ? ` · ${it.description}` : ""}
                          </div>
                        </div>

                        <div className="row" style={{ gap: 6 }}>
                          <button className="btn secondary" onClick={() => startEdit(it)}>
                            ערוך
                          </button>
                          <button className="btn danger" onClick={() => onDelete(it.id || "")} disabled={deletingId === it.id}>
                            {deletingId === it.id ? "מוחק..." : "מחיקה"}
                          </button>
                        </div>
                      </div>

                      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                        {it.date}
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div>
                          <label>תאריך</label>
                          <input className="input" type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
                        </div>

                        <div>
                          <label>קטגוריה</label>
                          <input className="input" value={editCategory} onChange={(e) => setEditCategory(e.target.value)} />
                        </div>

                        <div>
                          <label>סכום</label>
                          <input className="input" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} />
                        </div>

                        <div>
                          <label>תיאור</label>
                          <input className="input" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
                        </div>
                      </div>

                      {editErr ? (
                        <div className="error" style={{ marginTop: 8 }}>
                          {editErr}
                        </div>
                      ) : null}

                      <div className="row" style={{ gap: 8, marginTop: 10 }}>
                        <button className="btn" onClick={() => saveEdit(it)} disabled={savingEditId === it.id}>
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

      <ImportEntriesModal
        open={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        monthKey={monthKey}
        defaultDateISO={new Date().toISOString().slice(0, 10)}
        onSaved={() => setReloadKey((x) => x + 1)}
      />
    </AppLayout>
  );
}
