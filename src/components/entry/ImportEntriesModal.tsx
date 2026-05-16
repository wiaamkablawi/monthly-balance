import React, { useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs, query, setDoc, where, writeBatch } from "firebase/firestore";
import { ADD_ENTRY_EXPENSE_CATEGORIES, ADD_ENTRY_INCOME_CATEGORIES } from "../../domain/categories";
import type { EntryDoc } from "../../types/models";
import { householdIdFromEmail, userKeyFromEmail } from "../../services/authService";
import { auth } from "../../services/firebase";
import { db } from "../../services/firebaseDb";
import { parseImageFileToExpenses } from "../../services/imageOcrService";
import { invalidateRecordsState } from "../../services/recordsService";
import { monthKeyFromISO } from "../../utils/dates";

type ParsedImportRow = {
  id: string;
  type: EntryDoc["type"];
  date: string;
  category: string;
  description: string;
  amount: string;
  selected: boolean;
  importSource?: string;
  importHash?: string;
  isDuplicate?: boolean;
};

type ImportFingerprintInput = {
  type: EntryDoc["type"];
  date: string;
  category: string;
  description: string;
  amount: number;
};

type ImportSession = {
  kind: "file" | "image";
  sourceName: string;
  imageHash?: string;
  parsedRows: number;
};

type ParsedFileResult = {
  rows: ParsedImportRow[];
  note?: string;
  importSession: ImportSession;
};

function toISODateString(value: unknown, fallbackISO: string): string {
  if (!value) return fallbackISO;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const match = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (!match) return fallbackISO;

  const day = match[1].padStart(2, "0");
  const month = match[2].padStart(2, "0");
  const year = (match[3].length === 2 ? `20${match[3]}` : match[3]).padStart(4, "0");
  return `${year}-${month}-${day}`;
}

function detectTypeFromRaw(typeRaw: string, amount: number): EntryDoc["type"] {
  const normalized = typeRaw.trim().toLowerCase();
  if (normalized.includes("income") || normalized.includes("credit") || normalized.includes("זיכוי") || normalized.includes("הכנסה")) {
    return "income";
  }
  if (normalized.includes("expense") || normalized.includes("debit") || normalized.includes("הוצאה") || normalized.includes("חובה")) {
    return "expense";
  }
  return amount >= 0 ? "income" : "expense";
}

function parseImportedAmount(value: unknown): number {
  const numericAmount = Number(String(value || "").replace(/[^\d,.-]/g, "").replace(/,/g, "").trim());
  return Number.isFinite(numericAmount) ? Math.abs(numericAmount) : 0;
}

function normalizeFingerprintText(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function buildImportFingerprints(input: ImportFingerprintInput): string[] {
  const normalizedType = input.type === "income" ? "income" : "expense";
  const normalizedDate = String(input.date || "").trim();
  const normalizedAmount = Math.abs(Number(input.amount || 0));
  const normalizedCategory = normalizeFingerprintText(input.category);
  const normalizedDescription = normalizeFingerprintText(input.description);
  const base = `${normalizedType}|${normalizedDate}|${normalizedAmount.toFixed(2)}`;
  const fingerprints = [
    normalizedDescription ? `${base}|d|${normalizedDescription}` : "",
    `${base}|c|${normalizedCategory}`,
  ].filter(Boolean);

  return Array.from(new Set(fingerprints));
}

function imageImportDocId(householdId: string, hash: string): string {
  return `${householdId}_${hash}`;
}

function categoryOptionsForRow(type: EntryDoc["type"], currentCategory: string): string[] {
  const baseOptions: string[] = type === "income" ? [...ADD_ENTRY_INCOME_CATEGORIES] : [...ADD_ENTRY_EXPENSE_CATEGORIES];
  const normalizedCurrentCategory = String(currentCategory || "").trim();
  if (!normalizedCurrentCategory || baseOptions.includes(normalizedCurrentCategory)) {
    return [...baseOptions];
  }
  return [normalizedCurrentCategory, ...baseOptions];
}

async function markDuplicatesAgainstFirestore(rows: ParsedImportRow[], householdId: string): Promise<ParsedImportRow[]> {
  const monthKeysToScan = Array.from(
    new Set(
      rows.map((row) => monthKeyFromISO(String(row.date || "").trim()) || "")
        .filter(Boolean)
    )
  );

  const existingFingerprints = new Set<string>();

  for (const currentMonthKey of monthKeysToScan) {
    const snapshot = await getDocs(
      query(
        collection(db, "records"),
        where("householdId", "==", householdId),
        where("monthKey", "==", currentMonthKey)
      )
    );

    snapshot.forEach((entryDoc) => {
      const entry = entryDoc.data() as Partial<EntryDoc>;
      const type = entry.type === "income" ? "income" : "expense";
      const date = String(entry.date || "").trim();
      const category = String(entry.category || "").trim();
      const description = String(entry.description || "").trim();
      const amount = Number(entry.amount || 0);
      if (!date || !Number.isFinite(amount) || amount <= 0) return;

      if (entry.importFingerprint) {
        existingFingerprints.add(String(entry.importFingerprint));
      }
      buildImportFingerprints({ type, date, category, description, amount })
        .forEach((fp) => existingFingerprints.add(fp));
    });
  }

  return rows.map((row) => {
    const amount = parseImportedAmount(row.amount);
    if (!Number.isFinite(amount) || amount <= 0) return row;
    const fingerprints = buildImportFingerprints({
      type: row.type,
      date: row.date,
      category: row.category,
      description: row.description,
      amount,
    });
    const isDuplicate = fingerprints.some((fp) => existingFingerprints.has(fp));
    return { ...row, isDuplicate, selected: isDuplicate ? false : row.selected };
  });
}

async function parseFileToRows(file: File, fallbackISO: string): Promise<ParsedFileResult> {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "xlsx" || extension === "xls" || extension === "csv") {
    const buffer = await file.arrayBuffer();
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "" });
    const parsedRows = rows
      .map((row, index): ParsedImportRow | null => {
        const debitAmount = parseImportedAmount(row["חובה"] ?? row.debit ?? row.Debit);
        const creditAmount = parseImportedAmount(row["זיכוי"] ?? row.credit ?? row.Credit);
        const amountRaw =
          row.amount ||
          row.Amount ||
          row.sum ||
          row.Total ||
          row["חובה"] ||
          row["סכום"] ||
          row["זיכוי"];

        const numericAmount = debitAmount || creditAmount || parseImportedAmount(amountRaw);
        if (!Number.isFinite(numericAmount) || numericAmount === 0) return null;

        const dateRaw = row.date || row.Date || row["תאריך"];
        const descriptionRaw = row.description || row.Description || row.details || row["תיאור"] || "";
        const categoryRaw = row.category || row.Category || row["קטגוריה"] || "אחר";
        const typeRaw = row.type || row.Type || row["סוג"] || "";
        const resolvedTypeRaw =
          debitAmount && !creditAmount ? "חובה" : creditAmount && !debitAmount ? "זיכוי" : String(typeRaw || "");
        const typeAmount = debitAmount && !creditAmount ? -numericAmount : numericAmount;

        return {
          id: `${file.name}-${index}-${Math.random().toString(16).slice(2)}`,
          type: detectTypeFromRaw(resolvedTypeRaw, typeAmount),
          date: toISODateString(dateRaw, fallbackISO),
          category: String(categoryRaw || "אחר").trim(),
          description: String(descriptionRaw || "").trim() || "תיאור כללי",
          amount: String(numericAmount),
          selected: true,
          importSource: `file:${file.name}`,
        };
      })
      .filter((row): row is ParsedImportRow => Boolean(row));

    return {
      rows: parsedRows,
      importSession: {
        kind: "file",
        sourceName: file.name,
        parsedRows: parsedRows.length,
      },
    };
  }

  if (["png", "jpg", "jpeg", "webp"].includes(String(extension || ""))) {
    const parsed = await parseImageFileToExpenses(file);
    const rows = parsed.expenses.map((expense, index) => ({
      id: `${file.name}-${index}-${Math.random().toString(16).slice(2)}`,
      type: detectTypeFromRaw(expense.rawType, expense.rawType === "income" ? expense.amount : -expense.amount),
      date: expense.date,
      category: expense.category,
      description: expense.description,
      amount: String(expense.amount),
      selected: true,
      importSource: `image:${file.name}`,
      importHash: parsed.hash,
    }));

    return {
      rows,
      note: `זוהו ${rows.length} עסקאות מהתמונה. אפשר לעבור שורה-שורה לפני השמירה.`,
      importSession: {
        kind: "image",
        sourceName: file.name,
        imageHash: parsed.hash,
        parsedRows: rows.length,
      },
    };
  }

  if (["pdf"].includes(String(extension || ""))) {
    return {
      rows: [
        {
          id: `${file.name}-manual-1`,
          type: "expense",
          date: fallbackISO,
          category: "אחר",
          description: `טיוטה מתוך ${file.name} - יש להשלים סכום ופרטים לפני שמירה`,
          amount: "0",
          selected: true,
          importSource: `file:${file.name}`,
        },
      ],
      note: "בקובצי PDF נוצרת כרגע טיוטה ידנית. לתמונות מסך נתמך OCR עם פירוק לשורות.",
      importSession: {
        kind: "file",
        sourceName: file.name,
        parsedRows: 1,
      },
    };
  }

  return {
    rows: [],
    importSession: {
      kind: "file",
      sourceName: file.name,
      parsedRows: 0,
    },
  };
}

export default function ImportEntriesModal(props: {
  open: boolean;
  onClose: () => void;
  monthKey: string;
  defaultDateISO: string;
  onSaved: (savedMonthKey: string) => void;
}) {
  const { open, onClose, monthKey, defaultDateISO, onSaved } = props;
  const [rows, setRows] = useState<ParsedImportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [note, setNote] = useState("");
  const [importSession, setImportSession] = useState<ImportSession | null>(null);
  const selectedCount = rows.filter((row) => row.selected).length;

  useEffect(() => {
    if (!open) return;
    setRows([]);
    setErrorMessage("");
    setNote("");
    setImportSession(null);
  }, [open]);

  async function handleUpload(file?: File) {
    if (!file || loading) return;

    setLoading(true);
    setErrorMessage("");
    setNote("");

    try {
      const parsedResult = await parseFileToRows(file, defaultDateISO);
      if (!parsedResult.rows.length) {
        setErrorMessage("לא זוהו שורות תקינות בקובץ. אפשר לנסות קובץ אחר או לעדכן ידנית.");
        return;
      }

      if (parsedResult.importSession.kind === "image") {
        const user = auth.currentUser;
        if (!user?.email || !parsedResult.importSession.imageHash) {
          setErrorMessage("יש להתחבר מחדש כדי לייבא תמונה.");
          return;
        }

        const householdId = householdIdFromEmail(user.email);
        const importMarkerRef = doc(collection(db, "imageImports"), imageImportDocId(householdId, parsedResult.importSession.imageHash));
        const importMarker = await getDoc(importMarkerRef);

        if (importMarker.exists()) {
          setErrorMessage("התמונה הזו כבר נותחה בעבר, ולכן לא נטענה שוב לעריכה.");
          return;
        }
      }

      const user = auth.currentUser;
      let markedRows = parsedResult.rows;
      if (user?.email) {
        const householdId = householdIdFromEmail(user.email);
        markedRows = await markDuplicatesAgainstFirestore(parsedResult.rows, householdId);
      }
      const dupCount = markedRows.filter((row) => row.isDuplicate).length;

      setRows(markedRows);
      setImportSession(parsedResult.importSession);
      if (parsedResult.note) {
        setNote(parsedResult.note + (dupCount ? ` זוהו ${dupCount} כפילויות שכבר קיימות במערכת.` : ""));
      } else if (dupCount) {
        setNote(`זוהו ${dupCount} עסקאות שכבר קיימות במערכת — הן מסומנות באדום ולא ייבחרו לשמירה.`);
      } else if (file.name.match(/\.(pdf|png|jpg|jpeg|webp)$/i)) {
        setNote("אפשר לעבור שורה-שורה לפני אישור השמירה.");
      }
    } catch (error: any) {
      setErrorMessage(error?.message || "אירעה שגיאה בפענוח הקובץ.");
    } finally {
      setLoading(false);
    }
  }

  function updateRow(id: string, patch: Partial<ParsedImportRow>) {
    setRows((currentRows) => currentRows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function selectAll(nextSelected: boolean) {
    setRows((currentRows) => currentRows.map((row) => ({ ...row, selected: nextSelected })));
  }

  async function saveSelected() {
    if (saving) return;

    const selectedRows = rows.filter((row) => row.selected);
    if (!selectedRows.length) {
      setErrorMessage("אין שורות מסומנות לשמירה.");
      return;
    }

    const user = auth.currentUser;
    if (!user?.email) {
      setErrorMessage("יש להתחבר מחדש כדי לשמור את הנתונים.");
      return;
    }

    const householdId = householdIdFromEmail(user.email);
    setSaving(true);
    setErrorMessage("");
    setNote("");

    try {
      let importMarkerRef: ReturnType<typeof doc> | null = null;
      if (importSession?.kind === "image" && importSession.imageHash) {
        importMarkerRef = doc(collection(db, "imageImports"), imageImportDocId(householdId, importSession.imageHash));
        const existingImport = await getDoc(importMarkerRef);
        if (existingImport.exists()) {
          setErrorMessage("התמונה הזו כבר נותחה בעבר, ולכן לא נוספו רשומות חדשות.");
          return;
        }
      }

      const preparedRows = selectedRows.flatMap((row) => {
        const amount = Number(row.amount);
        if (!Number.isFinite(amount) || amount <= 0) return [];

        const dateISO = String(row.date || defaultDateISO).trim() || defaultDateISO;
        const category = String(row.category || "אחר").trim() || "אחר";
        const description = String(row.description || "").trim() || "ייבוא קובץ";
        const normalizedAmount = Math.abs(amount);
        const resolvedMonthKey = monthKeyFromISO(dateISO) || monthKey;
        const fingerprints = buildImportFingerprints({
          type: row.type,
          date: dateISO,
          category,
          description,
          amount: normalizedAmount,
        });

        return [
          {
            type: row.type,
            dateISO,
            monthKey: resolvedMonthKey,
            category,
            description,
            amount: normalizedAmount,
            fingerprints,
            importSource:
              row.importSource ||
              (importSession?.kind === "image" ? `image:${importSession.sourceName}` : `file:${importSession?.sourceName || "upload"}`),
            importHash: row.importHash || importSession?.imageHash,
          },
        ];
      });

      if (!preparedRows.length) {
        setErrorMessage("אין שורות תקינות לשמירה. צריך להזין סכום חיובי בכל שורה.");
        return;
      }

      const uniqueRowsMap = new Map<string, (typeof preparedRows)[number]>();
      preparedRows.forEach((row) => {
        const primaryFingerprint = row.fingerprints[0];
        if (!primaryFingerprint) return;
        if (!uniqueRowsMap.has(primaryFingerprint)) uniqueRowsMap.set(primaryFingerprint, row);
      });
      const uniqueRows = Array.from(uniqueRowsMap.values());
      const duplicatesInsideFile = preparedRows.length - uniqueRows.length;

      const monthKeysToScan = Array.from(new Set(uniqueRows.map((row) => row.monthKey)));
      const existingFingerprints = new Set<string>();

      for (const currentMonthKey of monthKeysToScan) {
        const snapshot = await getDocs(
          query(
            collection(db, "records"),
            where("householdId", "==", householdId),
            where("monthKey", "==", currentMonthKey)
          )
        );

        snapshot.forEach((entryDoc) => {
          const entry = entryDoc.data() as Partial<EntryDoc>;
          const type = entry.type === "income" ? "income" : "expense";
          const date = String(entry.date || "").trim();
          const category = String(entry.category || "").trim();
          const description = String(entry.description || "").trim();
          const amount = Number(entry.amount || 0);
          if (!date || !Number.isFinite(amount) || amount <= 0) return;

          if (entry.importFingerprint) {
            existingFingerprints.add(String(entry.importFingerprint));
          }

          buildImportFingerprints({
            type,
            date,
            category,
            description,
            amount,
          }).forEach((fingerprint) => existingFingerprints.add(fingerprint));
        });
      }

      const rowsToSave = uniqueRows.filter((row) => !row.fingerprints.some((fingerprint) => existingFingerprints.has(fingerprint)));
      const duplicatesInSystem = uniqueRows.length - rowsToSave.length;

      if (!rowsToSave.length) {
        setErrorMessage("לא נוספו שורות: כל הרשומות שסומנו כבר קיימות במערכת.");
        if (duplicatesInsideFile > 0 || duplicatesInSystem > 0) {
          setNote(`כפילויות שזוהו: ${duplicatesInsideFile} בתוך הקובץ, ${duplicatesInSystem} שכבר קיימות במערכת.`);
        }
        return;
      }

      const batch = writeBatch(db);
      const createdAtBase = Date.now();

      rowsToSave.forEach((row, index) => {
        const reference = doc(collection(db, "records"));
        batch.set(reference, {
          type: row.type,
          ...(row.type === "expense" ? { subType: "variable" } : {}),
          date: row.dateISO,
          monthKey: row.monthKey,
          category: row.category,
          description: row.description,
          amount: row.amount,
          createdBy: user.email,
          ownerUid: user.uid,
          householdId,
          userKey: userKeyFromEmail(user.email),
          importSource: row.importSource,
          importFingerprint: row.fingerprints[0],
          ...(row.importHash ? { importHash: row.importHash } : {}),
          createdAt: createdAtBase + index,
        });
      });

      await batch.commit();
      invalidateRecordsState();

      if (importMarkerRef && importSession?.imageHash) {
        await setDoc(importMarkerRef, {
          hash: importSession.imageHash,
          householdId,
          ownerUid: user.uid,
          createdBy: user.email,
          sourceName: importSession.sourceName,
          rowsParsed: importSession.parsedRows,
          rowsAdded: rowsToSave.length,
          rowsSkippedDuplicates: duplicatesInsideFile + duplicatesInSystem,
          createdAt: Date.now(),
        });
      }

      onSaved(rowsToSave[0]?.monthKey || monthKey);
      onClose();
    } catch (error: any) {
      setErrorMessage(error?.message || "אירעה שגיאה בשמירת הרשומות.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="modal-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-card modal-wide">
        <div className="modal-head">
          <div>
            <div className="section-title">ייבוא קובץ והצלבת כפילויות</div>
            <div className="section-subtitle">תומך עכשיו גם בצילומי מסך של טבלאות עסקאות, עם אישור שורות לפני שמירה.</div>
          </div>
          <button className="btn secondary" type="button" onClick={onClose} disabled={loading || saving}>
            סגור
          </button>
        </div>

        <div className="stack-sm">
          <input
            className="input"
            type="file"
            accept=".xlsx,.xls,.csv,.pdf,image/*"
            onChange={(event) => handleUpload(event.target.files?.[0])}
            disabled={loading || saving}
          />
          <div className="muted text-small">תומך באקסל, CSV, PDF ותמונות. צילומי מסך של טבלאות מנותחים אוטומטית לשורות עסקה.</div>
          {note ? <div className="note-banner">{note}</div> : null}
          {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}
        </div>

        {rows.length ? (
          <>
            <div className="note-banner" style={{ marginTop: 16 }}>
              כל העסקאות מסומנות כברירת מחדל. אפשר להסיר סימון מעסקאות שלא רוצים לשמור.
              <br />
              מסומנות כרגע {selectedCount} מתוך {rows.length} עסקאות.
            </div>

            <div className="toolbar-actions" style={{ marginTop: 16 }}>
              <button className="btn secondary" type="button" onClick={() => selectAll(true)} disabled={loading || saving}>
                בחר הכל
              </button>
              <button className="btn secondary" type="button" onClick={() => selectAll(false)} disabled={loading || saving}>
                בטל הכל
              </button>
            </div>

            <div className="import-grid">
              {rows.map((row) => (
                <div key={row.id} className={`import-row ${row.selected ? "selected" : "unselected"} ${row.isDuplicate ? "duplicate" : ""}`}>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={row.selected}
                      onChange={(event) => updateRow(row.id, { selected: event.target.checked })}
                    />
                    <span>{row.isDuplicate ? "כפילות — קיים במערכת" : "שמור עסקה זו"}</span>
                  </label>

                  <div className="import-row-grid">
                    <select
                      className="input"
                      value={row.type}
                      onChange={(event) => {
                        const nextType = event.target.value as EntryDoc["type"];
                        const nextCategoryOptions = categoryOptionsForRow(nextType, row.category);
                        updateRow(row.id, {
                          type: nextType,
                          category: nextCategoryOptions.includes(row.category) ? row.category : "אחר",
                        });
                      }}
                    >
                      <option value="expense">הוצאה</option>
                      <option value="income">הכנסה</option>
                    </select>
                    <input className="input" type="date" value={row.date} onChange={(event) => updateRow(row.id, { date: event.target.value })} />
                    <input className="input" value={row.amount} onChange={(event) => updateRow(row.id, { amount: event.target.value })} placeholder="סכום" />
                    <select className="input" value={row.category} onChange={(event) => updateRow(row.id, { category: event.target.value })}>
                      {categoryOptionsForRow(row.type, row.category).map((option) => (
                        <option key={`${row.id}-${option}`} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    <input
                      className="input import-description"
                      value={row.description}
                      onChange={(event) => updateRow(row.id, { description: event.target.value })}
                      placeholder="תיאור"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="toolbar-actions" style={{ marginTop: 20, justifyContent: "space-between" }}>
              <div className="muted text-small">נשמרות רק שורות מסומנות עם סכום חיובי.</div>
              <button className="btn" type="button" onClick={saveSelected} disabled={loading || saving}>
                {saving ? "שומר..." : "שמור שורות מאושרות"}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

