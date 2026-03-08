import React, { useMemo, useState } from "react";
import AppLayout from "../app/layout/AppLayout";
import { monthKeyFromISO, todayISO } from "../utils/dates";
import { auth } from "../services/firebase";
import { db } from "../services/firebaseDb";
import { householdIdFromEmail, userKeyFromEmail } from "../services/authService";
import { ADD_ENTRY_EXPENSE_CATEGORIES, ADD_ENTRY_INCOME_CATEGORIES } from "../domain/categories";
import type { EntryDoc, EntrySubType, EntryType } from "../types/models";
import { collection, doc, getDoc, getDocs, query, setDoc, where, writeBatch } from "firebase/firestore";

type EntryKind = "expense_variable" | "income";

type ParsedExpense = {
  date: string;
  amount: number;
  category: string;
  description: string;
};

const OCR_PARSE_ENDPOINT = String(
  import.meta.env.VITE_OCR_PARSE_ENDPOINT ||
    (import.meta.env.PROD
      ? "/api/ocr/parse"
      : "https://us-central1-monthly-balance-548d1.cloudfunctions.net/ocrParse")
).trim();

const CATEGORY_KEYWORDS: Array<{ category: string; keywords: string[] }> = [
  { category: "מזון", keywords: ["סופר", "מזון", "מסעד", "קפה", "מכולת", "market", "food"] },
  { category: "רכב", keywords: ["דלק", "פז", "סונול", "רכב", "חניה", "כביש", "fuel", "parking"] },
  { category: "חשבונות", keywords: ["חשמל", "מים", "ארנונה", "גז", "חשבון", "bill"] },
  { category: "תקשורת", keywords: ["סלולר", "אינטרנט", "טלפון", "פרטנר", "סלקום", "פלאפון"] },
  { category: "בריאות", keywords: ["בית מרקחת", "קופת", "רופא", "pharm", "clinic"] },
  { category: "בילויים", keywords: ["קולנוע", "בילוי", "netflix", "spotify", "game"] },
  { category: "דיור", keywords: ["שכירות", "משכנת", "ועד בית", "home", "rent"] },
];

function detectCategory(text: string): string {
  const normalized = text.toLowerCase();
  for (const entry of CATEGORY_KEYWORDS) {
    if (entry.keywords.some((keyword) => normalized.includes(keyword))) return entry.category;
  }
  return "אחר";
}

function normalizeAmount(raw: string): number | null {
  const cleaned = raw.replace(/[^\d,.-]/g, "").replace(/,/g, "");
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return Math.abs(value);
}

function parseDateFromLine(rawLine: string): string | null {
  const dateMatch = rawLine.match(/(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2,4}))?/);
  if (!dateMatch) return null;

  const day = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  let year = Number(dateMatch[3]);

  if (!year) {
    year = new Date().getFullYear();
  } else if (year < 100) {
    year += 2000;
  }

  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseExpensesFromOCRText(text: string): ParsedExpense[] {
  const out: ParsedExpense[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const date = parseDateFromLine(line);
    if (!date) continue;

    const amountMatches = line.match(/-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})|-?\d+(?:[.,]\d{2})/g);
    if (!amountMatches || amountMatches.length === 0) continue;

    const amountRaw = amountMatches[amountMatches.length - 1];
    const amount = normalizeAmount(amountRaw);
    if (!amount || amount <= 0) continue;

    const description = line.slice(0, Math.max(0, line.lastIndexOf(amountRaw))).trim() || "עסקה מכרטיס אשראי";

    out.push({
      date,
      amount,
      category: detectCategory(description),
      description,
    });
  }

  return out;
}

function buildExpenseFingerprint(date: string, amount: number, category: string): string {
  return `${date}|${amount.toFixed(2)}|${category.trim().toLowerCase()}`;
}

async function fileSha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const bytes = Array.from(new Uint8Array(digest));
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function imageImportDocId(householdId: string, hash: string): string {
  return `${householdId}_${hash}`;
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("שגיאה בקריאת קובץ התמונה."));
    reader.readAsDataURL(file);
  });
}

async function extractTextFromImage(file: File): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("אין משתמש מחובר.");
  }

  const idToken = await user.getIdToken();
  const imageBase64 = await fileToDataUrl(file);

  const res = await fetch(OCR_PARSE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      imageBase64,
      language: "heb",
      isOverlayRequired: false,
    }),
  });

  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  if (!res.ok) {
    const errCode = String(json?.error || "");
    if (errCode === "UNAUTHORIZED") throw new Error("נדרש להתחבר מחדש כדי לנתח תמונה.");
    if (errCode === "FORBIDDEN") throw new Error("החשבון הנוכחי אינו מורשה לניתוח OCR.");
    if (errCode === "NO_TEXT_DETECTED") throw new Error("לא הצלחנו לזהות טקסט בתמונה.");
    throw new Error("שירות ה-OCR לא זמין כרגע.");
  }

  const parsedText = String(json?.parsedText || "").trim();
  if (!parsedText) {
    throw new Error("לא הצלחנו לזהות טקסט בתמונה.");
  }
  return parsedText;
}
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
  const [uploadingImage, setUploadingImage] = useState<boolean>(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);

  const categories = useMemo(() => {
    return kind === "income" ? ADD_ENTRY_INCOME_CATEGORIES : ADD_ENTRY_EXPENSE_CATEGORIES;
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

    const householdId = householdIdFromEmail(user.email);
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
          ownerUid: user.uid,
          householdId,

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
            ownerUid: user.uid,
            householdId,

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

  async function onImportImage() {
    if (!selectedImage) {
      setErr("נא לבחור תמונה לפני ניתוח.");
      return;
    }

    const user = auth.currentUser;
    if (!user || !user.email) {
      setErr("אין משתמש מחובר. אנא התחבר מחדש.");
      return;
    }

    setUploadingImage(true);
    resetMessages();

    try {
      const hash = await fileSha256(selectedImage);
      const householdId = householdIdFromEmail(user.email);
      const importMarkerRef = doc(collection(db, "imageImports"), imageImportDocId(householdId, hash));
      const importMarker = await getDoc(importMarkerRef);

      if (importMarker.exists()) {
        setErr("התמונה הזו כבר הועלתה בעבר, לא נוספו שורות חדשות.");
        return;
      }

      const text = await extractTextFromImage(selectedImage);
      const parsedExpenses = parseExpensesFromOCRText(text);

      if (!parsedExpenses.length) {
        setErr("לא נמצאו שורות הוצאה תקינות בתמונה.");
        return;
      }

      const uniqueParsed = parsedExpenses.filter((expense, index, arr) => {
        const fp = buildExpenseFingerprint(expense.date, expense.amount, expense.category);
        return arr.findIndex((item) => buildExpenseFingerprint(item.date, item.amount, item.category) === fp) === index;
      });

      if (!uniqueParsed.length) {
        setErr("כל הרשומות בתמונה נראו כפולות ולא נוספו.");
        return;
      }

      const monthsToScan = Array.from(new Set(uniqueParsed.map((expense) => monthKeyFromISO(expense.date))));
      const existingFingerprints = new Set<string>();

      for (const mk of monthsToScan) {
        const q = query(
          collection(db, "records"),
          where("householdId", "==", householdId),
          where("type", "==", "expense"),
          where("monthKey", "==", mk)
        );
        const snap = await getDocs(q);

        snap.forEach((docSnap) => {
          const data = docSnap.data() as Partial<EntryDoc>;
          if (data.subType && data.subType !== "variable") return;

          const date = String(data.date || "").trim();
          const category = String(data.category || "").trim();
          const amount = Number(data.amount || 0);

          if (!date || !category || !Number.isFinite(amount)) return;
          existingFingerprints.add(buildExpenseFingerprint(date, amount, category));
        });
      }

      const newExpenses = uniqueParsed.filter(
        (expense) => !existingFingerprints.has(buildExpenseFingerprint(expense.date, expense.amount, expense.category))
      );

      if (!newExpenses.length) {
        setErr("לא נוספו הוצאות: כל הרשומות כבר קיימות במערכת.");
        return;
      }

      const batch = writeBatch(db);
      const createdAtBase = Date.now();

      newExpenses.forEach((expense, index) => {
        const fingerprint = buildExpenseFingerprint(expense.date, expense.amount, expense.category);
        const payload: Omit<EntryDoc, "id"> = {
          type: "expense",
          subType: "variable",
          date: expense.date,
          monthKey: monthKeyFromISO(expense.date),
          category: expense.category,
          description: expense.description,
          amount: expense.amount,
          userKey: userKeyFromEmail(user.email as string),
          ownerUid: user.uid,
          householdId,
          createdAt: createdAtBase + index,
          createdBy: user.email as string,
          importHash: hash,
          importSource: `image:${selectedImage.name}`,
          importFingerprint: fingerprint,
        } as any;

        const ref = doc(collection(db, "records"));
        batch.set(ref, payload as any);
      });

      await batch.commit();
      await setDoc(importMarkerRef, {
        hash,
        householdId,
        ownerUid: user.uid,
        createdBy: user.email,
        sourceName: selectedImage.name,
        rowsParsed: parsedExpenses.length,
        rowsAdded: newExpenses.length,
        rowsSkippedDuplicates: uniqueParsed.length - newExpenses.length,
        createdAt: Date.now(),
      });

      const skippedDuplicates = uniqueParsed.length - newExpenses.length;
      setOk(
        skippedDuplicates > 0
          ? `היבוא הושלם בהצלחה. נוספו ${newExpenses.length} הוצאות, ודולגו ${skippedDuplicates} כפילויות.`
          : `היבוא הושלם בהצלחה. נוספו ${newExpenses.length} הוצאות.`
      );
      setSelectedImage(null);
    } catch (ex: any) {
      setErr(ex?.message || "שגיאה בניתוח ושמירת נתוני התמונה.");
    } finally {
      setUploadingImage(false);
    }
  }

  return (
    <AppLayout title="הוספה">
      <div className="card">
        <h2>הוספת תנועה</h2>

        <div className="grid" style={{ gap: 8, marginBottom: 12 }}>
          <label>יבוא הוצאות מתמונה (למשל חיובי אשראי)</label>
          <input
            className="input"
            type="file"
            accept="image/*"
            onChange={(e) => {
              setSelectedImage(e.target.files?.[0] || null);
              resetMessages();
            }}
            disabled={saving || uploadingImage}
          />
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div className="muted" style={{ fontSize: 12 }}>
              המערכת תסרוק את הטקסט בתמונה ותוסיף שורות: תאריך, סכום וקטגוריה משוערת.
            </div>
            <button className="btn secondary" type="button" onClick={onImportImage} disabled={saving || uploadingImage}>
              {uploadingImage ? "מנתח תמונה..." : "נתח והוסף הוצאות"}
            </button>
          </div>
        </div>

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










