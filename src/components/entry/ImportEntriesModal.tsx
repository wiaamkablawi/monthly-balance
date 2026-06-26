import React, { useEffect, useRef, useState } from "react";
import { collection, doc, getDoc, getDocs, query, setDoc, where, writeBatch } from "firebase/firestore";
import { ADD_ENTRY_EXPENSE_CATEGORIES, ADD_ENTRY_INCOME_CATEGORIES } from "../../domain/categories";
import type { EntryDoc } from "../../types/models";
import { householdIdFromEmail, userKeyFromEmail } from "../../services/authService";
import { auth } from "../../services/firebase";
import { db } from "../../services/firebaseDb";
import { parseImageFileToExpenses } from "../../services/imageOcrService";
import { invalidateRecordsState } from "../../services/recordsService";
import { useToast } from "../Toast";
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
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
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
  const n = typeRaw.trim().toLowerCase();
  if (n.includes("income") || n.includes("credit") || n.includes("זיכוי") || n.includes("הכנסה")) return "income";
  if (n.includes("expense") || n.includes("debit") || n.includes("הוצאה") || n.includes("חובה")) return "expense";
  return "expense";
}

function parseImportedAmount(value: unknown): number {
  const n = Number(String(value || "").replace(/[^\d,.-]/g, "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? Math.abs(n) : 0;
}

function normalizeFingerprintText(raw: string): string {
  return String(raw || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function buildImportFingerprints(input: ImportFingerprintInput): string[] {
  const type = input.type === "income" ? "income" : "expense";
  const date = String(input.date || "").trim();
  const amount = Math.abs(Number(input.amount || 0));
  const cat = normalizeFingerprintText(input.category);
  const desc = normalizeFingerprintText(input.description);
  const base = `${type}|${date}|${amount.toFixed(2)}`;
  return Array.from(new Set([
    desc ? `${base}|d|${desc}` : "",
    `${base}|c|${cat}`,
  ].filter(Boolean)));
}

function imageImportDocId(householdId: string, hash: string): string {
  return `${householdId}_${hash}`;
}

function categoryOptionsForRow(type: EntryDoc["type"], currentCategory: string): string[] {
  const base: string[] = type === "income" ? [...ADD_ENTRY_INCOME_CATEGORIES] : [...ADD_ENTRY_EXPENSE_CATEGORIES];
  const norm = String(currentCategory || "").trim();
  if (!norm || base.includes(norm)) return base;
  return [norm, ...base];
}

async function markDuplicatesAgainstFirestore(rows: ParsedImportRow[], householdId: string): Promise<ParsedImportRow[]> {
  const monthKeys = Array.from(new Set(
    rows.map((r) => monthKeyFromISO(String(r.date || "").trim()) || "").filter(Boolean)
  ));
  const existingFps = new Set<string>();

  for (const mk of monthKeys) {
    const snap = await getDocs(query(
      collection(db, "records"),
      where("householdId", "==", householdId),
      where("monthKey", "==", mk)
    ));
    snap.forEach((d) => {
      const e = d.data() as Partial<EntryDoc>;
      if (e.importFingerprint) existingFps.add(String(e.importFingerprint));
      const a = Number(e.amount || 0);
      if (e.date && Number.isFinite(a) && a > 0) {
        buildImportFingerprints({
          type: e.type === "income" ? "income" : "expense",
          date: String(e.date || "").trim(),
          category: String(e.category || "").trim(),
          description: String(e.description || "").trim(),
          amount: a,
        }).forEach((fp) => existingFps.add(fp));
      }
    });
  }

  return rows.map((row) => {
    const a = parseImportedAmount(row.amount);
    if (!Number.isFinite(a) || a <= 0) return row;
    const fps = buildImportFingerprints({ type: row.type, date: row.date, category: row.category, description: row.description, amount: a });
    const isDuplicate = fps.some((fp) => existingFps.has(fp));
    return { ...row, isDuplicate, selected: isDuplicate ? false : row.selected };
  });
}

async function parseFileToRows(file: File, fallbackISO: string): Promise<ParsedFileResult> {
  const ext = file.name.split(".").pop()?.toLowerCase();

  if (ext === "xlsx" || ext === "xls" || ext === "csv") {
    const buffer = await file.arrayBuffer();
    const XLSX = await import("xlsx");
    const wb = XLSX.read(buffer, { type: "array", cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
    const parsedRows = rows.map((row, idx): ParsedImportRow | null => {
      const debit = parseImportedAmount(row["חובה"] ?? row.debit ?? row.Debit);
      const credit = parseImportedAmount(row["זיכוי"] ?? row.credit ?? row.Credit);
      const amountRaw = row.amount || row.Amount || row.sum || row.Total || row["חובה"] || row["סכום"] || row["זיכוי"];
      const num = debit || credit || parseImportedAmount(amountRaw);
      if (!Number.isFinite(num) || num === 0) return null;

      const dateRaw = row.date || row.Date || row["תאריך"];
      const descRaw = row.description || row.Description || row.details || row["תיאור"] || "";
      const catRaw = row.category || row.Category || row["קטגוריה"] || "אחר";
      const typeRaw = row.type || row.Type || row["סוג"] || "";
      const resolvedTypeRaw = debit && !credit ? "חובה" : credit && !debit ? "זיכוי" : String(typeRaw);
      const typeAmount = debit && !credit ? -num : num;

      return {
        id: `${file.name}-${idx}-${Math.random().toString(16).slice(2)}`,
        type: detectTypeFromRaw(resolvedTypeRaw, typeAmount),
        date: toISODateString(dateRaw, fallbackISO),
        category: String(catRaw || "אחר").trim(),
        description: String(descRaw || "").trim() || "תיאור כללי",
        amount: String(num),
        selected: true,
        importSource: `file:${file.name}`,
      };
    }).filter((r): r is ParsedImportRow => Boolean(r));

    return { rows: parsedRows, importSession: { kind: "file", sourceName: file.name, parsedRows: parsedRows.length } };
  }

  if (["png", "jpg", "jpeg", "webp"].includes(String(ext || ""))) {
    const parsed = await parseImageFileToExpenses(file);
    const rows = parsed.expenses.map((expense, idx) => ({
      id: `${file.name}-${idx}-${Math.random().toString(16).slice(2)}`,
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
      note: `זוהו ${rows.length} עסקאות בתמונה. בדקו לפני שמירה.`,
      importSession: { kind: "image", sourceName: file.name, imageHash: parsed.hash, parsedRows: rows.length },
    };
  }

  if (ext === "pdf") {
    return {
      rows: [{
        id: `${file.name}-manual-1`,
        type: "expense",
        date: fallbackISO,
        category: "אחר",
        description: `טיוטה מתוך ${file.name} — יש להשלים פרטים`,
        amount: "0",
        selected: true,
        importSource: `file:${file.name}`,
      }],
      note: "בקובצי PDF נוצרת טיוטה ידנית. לצילומי מסך נתמך OCR.",
      importSession: { kind: "file", sourceName: file.name, parsedRows: 1 },
    };
  }

  return { rows: [], importSession: { kind: "file", sourceName: file.name, parsedRows: 0 } };
}

export default function ImportEntriesModal(props: {
  open: boolean;
  onClose: () => void;
  monthKey: string;
  defaultDateISO: string;
  onSaved: (savedMonthKey: string) => void;
}) {
  const { open, onClose, monthKey, defaultDateISO, onSaved } = props;
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<ParsedImportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [note, setNote] = useState("");
  const [importSession, setImportSession] = useState<ImportSession | null>(null);

  const selectedCount = rows.filter((r) => r.selected).length;
  const dupCount = rows.filter((r) => r.isDuplicate).length;

  useEffect(() => {
    if (!open) return;
    setRows([]);
    setErrorMessage("");
    setNote("");
    setImportSession(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [open]);

  async function handleUpload(file?: File) {
    if (!file || loading) return;
    setLoading(true);
    setErrorMessage("");
    setNote("");

    try {
      const result = await parseFileToRows(file, defaultDateISO);
      if (!result.rows.length) {
        setErrorMessage("לא זוהו שורות תקינות בקובץ.");
        return;
      }

      if (result.importSession.kind === "image") {
        const user = auth.currentUser;
        if (!user?.email || !result.importSession.imageHash) {
          setErrorMessage("יש להתחבר מחדש כדי לייבא תמונה.");
          return;
        }
        const hid = householdIdFromEmail(user.email);
        const markerRef = doc(collection(db, "imageImports"), imageImportDocId(hid, result.importSession.imageHash));
        if ((await getDoc(markerRef)).exists()) {
          setErrorMessage("תמונה זו כבר יובאה בעבר.");
          return;
        }
      }

      const user = auth.currentUser;
      let markedRows = result.rows;
      if (user?.email) {
        markedRows = await markDuplicatesAgainstFirestore(result.rows, householdIdFromEmail(user.email));
      }
      const dups = markedRows.filter((r) => r.isDuplicate).length;

      setRows(markedRows);
      setImportSession(result.importSession);
      if (result.note) {
        setNote(result.note + (dups ? ` זוהו ${dups} כפילויות.` : ""));
      } else if (dups) {
        setNote(`זוהו ${dups} עסקאות שכבר קיימות במערכת — מסומנות ולא ייבחרו.`);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || "שגיאה בפענוח הקובץ.");
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
    const sel = rows.filter((r) => r.selected);
    if (!sel.length) { setErrorMessage("אין שורות מסומנות לשמירה."); return; }

    const user = auth.currentUser;
    if (!user?.email) { setErrorMessage("יש להתחבר מחדש."); return; }

    const householdId = householdIdFromEmail(user.email);
    setSaving(true);
    setErrorMessage("");
    setNote("");

    try {
      let importMarkerRef: ReturnType<typeof doc> | null = null;
      if (importSession?.kind === "image" && importSession.imageHash) {
        importMarkerRef = doc(collection(db, "imageImports"), imageImportDocId(householdId, importSession.imageHash));
        if ((await getDoc(importMarkerRef)).exists()) {
          setErrorMessage("תמונה זו כבר יובאה בעבר.");
          return;
        }
      }

      const prepared = sel.flatMap((row) => {
        const amount = Number(row.amount);
        if (!Number.isFinite(amount) || amount <= 0) return [];
        const dateISO = String(row.date || defaultDateISO).trim() || defaultDateISO;
        const category = String(row.category || "אחר").trim() || "אחר";
        const description = String(row.description || "").trim() || "ייבוא קובץ";
        const normAmount = Math.abs(amount);
        const fps = buildImportFingerprints({ type: row.type, date: dateISO, category, description, amount: normAmount });
        return [{ type: row.type, dateISO, monthKey: monthKeyFromISO(dateISO) || monthKey, category, description, amount: normAmount, fingerprints: fps,
          importSource: row.importSource || (importSession?.kind === "image" ? `image:${importSession.sourceName}` : `file:${importSession?.sourceName || "upload"}`),
          importHash: row.importHash || importSession?.imageHash }];
      });

      if (!prepared.length) { setErrorMessage("אין שורות תקינות. יש לוודא שכל שורה מסומנת מכילה סכום חיובי."); return; }

      // De-dup within file
      const uniq = new Map<string, (typeof prepared)[number]>();
      prepared.forEach((r) => { if (r.fingerprints[0] && !uniq.has(r.fingerprints[0])) uniq.set(r.fingerprints[0], r); });
      const uniqueRows = Array.from(uniq.values());

      // Check against DB
      const monthKeys = Array.from(new Set(uniqueRows.map((r) => r.monthKey)));
      const existingFps = new Set<string>();
      for (const mk of monthKeys) {
        const snap = await getDocs(query(collection(db, "records"), where("householdId", "==", householdId), where("monthKey", "==", mk)));
        snap.forEach((d) => {
          const e = d.data() as Partial<EntryDoc>;
          if (e.importFingerprint) existingFps.add(String(e.importFingerprint));
          const a = Number(e.amount || 0);
          if (e.date && Number.isFinite(a) && a > 0) {
            buildImportFingerprints({ type: e.type === "income" ? "income" : "expense", date: String(e.date || "").trim(), category: String(e.category || "").trim(), description: String(e.description || "").trim(), amount: a })
              .forEach((fp) => existingFps.add(fp));
          }
        });
      }

      const toSave = uniqueRows.filter((r) => !r.fingerprints.some((fp) => existingFps.has(fp)));
      if (!toSave.length) { setErrorMessage("כל הרשומות המסומנות כבר קיימות במערכת."); return; }

      const batch = writeBatch(db);
      const baseTime = Date.now();
      toSave.forEach((row, i) => {
        const ref = doc(collection(db, "records"));
        batch.set(ref, {
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
          createdAt: baseTime + i,
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
          rowsAdded: toSave.length,
          createdAt: Date.now(),
        });
      }

      toast.show(`${toSave.length} עסקאות יובאו בהצלחה ✓`, "success");
      onSaved(toSave[0]?.monthKey || monthKey);
      onClose();
    } catch (err: any) {
      const msg = err?.message || "שגיאה בשמירת הרשומות.";
      setErrorMessage(msg);
      toast.show(msg, "error");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card modal-wide">
        {/* Header */}
        <div className="modal-head">
          <div>
            <div className="section-title">ייבוא קובץ — בדיקה לפני שמירה</div>
            <div className="section-subtitle">תומך Excel, CSV, PDF ותמונות. כפילויות מסומנות אוטומטית.</div>
          </div>
          <button className="btn secondary" type="button" onClick={onClose} disabled={loading || saving}>סגור</button>
        </div>

        {/* File input */}
        <div className="stack-sm" style={{ marginTop: 16 }}>
          <input
            ref={fileInputRef}
            className="input"
            type="file"
            accept=".xlsx,.xls,.csv,.pdf,image/*"
            onChange={(e) => handleUpload(e.target.files?.[0])}
            disabled={loading || saving}
          />
          {loading && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0" }}>
              <span className="saving-spinner dark" />
              <span className="muted text-small">מנתח את הקובץ...</span>
            </div>
          )}
          {note && <div className="note-banner">{note}</div>}
          {errorMessage && <div className="error-banner">{errorMessage}</div>}
        </div>

        {/* Stats bar */}
        {rows.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div className="import-stats-row">
              <span className="import-stat-badge total">סה״כ: {rows.length}</span>
              <span className="import-stat-badge selected">נבחרו: {selectedCount}</span>
              {dupCount > 0 && <span className="import-stat-badge dup">כפילויות: {dupCount}</span>}
            </div>

            <div className="toolbar-actions" style={{ marginTop: 12 }}>
              <button className="btn secondary" type="button" onClick={() => selectAll(true)} disabled={loading || saving}>בחר הכל</button>
              <button className="btn secondary" type="button" onClick={() => selectAll(false)} disabled={loading || saving}>בטל הכל</button>
            </div>
          </div>
        )}

        {/* Row grid */}
        {rows.length > 0 && (
          <>
            <div className="import-grid" style={{ marginTop: 16, maxHeight: "44vh", overflowY: "auto" }}>
              {rows.map((row) => (
                <div key={row.id} className={`import-row ${row.selected ? "selected" : "unselected"} ${row.isDuplicate ? "duplicate" : ""}`}>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={row.selected}
                      onChange={(e) => updateRow(row.id, { selected: e.target.checked })}
                    />
                    <span style={{ color: row.isDuplicate ? "var(--danger)" : undefined }}>
                      {row.isDuplicate ? "⚠ כפילות" : "✓ שמור"}
                    </span>
                  </label>

                  <div className="import-row-grid">
                    <select className="input" value={row.type}
                      onChange={(e) => {
                        const t = e.target.value as EntryDoc["type"];
                        const opts = categoryOptionsForRow(t, row.category);
                        updateRow(row.id, { type: t, category: opts.includes(row.category) ? row.category : "אחר" });
                      }}>
                      <option value="expense">הוצאה</option>
                      <option value="income">הכנסה</option>
                    </select>
                    <input className="input" type="date" value={row.date} onChange={(e) => updateRow(row.id, { date: e.target.value })} />
                    <input className="input" value={row.amount} onChange={(e) => updateRow(row.id, { amount: e.target.value })} placeholder="סכום" />
                    <select className="input" value={row.category} onChange={(e) => updateRow(row.id, { category: e.target.value })}>
                      {categoryOptionsForRow(row.type, row.category).map((opt) => (
                        <option key={`${row.id}-${opt}`} value={opt}>{opt}</option>
                      ))}
                    </select>
                    <input className="input import-description" value={row.description} onChange={(e) => updateRow(row.id, { description: e.target.value })} placeholder="תיאור" />
                  </div>
                </div>
              ))}
            </div>

            <div className="toolbar-actions" style={{ marginTop: 20, justifyContent: "space-between" }}>
              <div className="muted text-small">נשמרות שורות מסומנות עם סכום חיובי בלבד.</div>
              <button className="btn" type="button" onClick={saveSelected} disabled={loading || saving || selectedCount === 0}>
                {saving ? <><span className="saving-spinner" /> שומר...</> : `שמור ${selectedCount} עסקאות`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
