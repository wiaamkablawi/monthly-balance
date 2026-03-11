import React, { useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";
import { Link } from "react-router-dom";
import AppLayout from "../app/layout/AppLayout";
import { summarizeMonthlyEntries } from "../domain/analytics";
import {
  getEntryLifecycle,
  getEntryTone,
  getEntryTypeLabel,
  getInstallmentLabel,
  parseAmountInput,
  sortEntriesByDisplayDate,
} from "../domain/entries";
import { deleteEntryRecord, listAvailableMonthKeys, listMonthEntries, updateEntryRecord } from "../services/recordsService";
import type { EntryDoc } from "../types/models";
import { householdIdFromEmail } from "../services/authService";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,

  query,
  updateDoc,
  where,
} from "firebase/firestore";

type LoadState = "idle" | "loading" | "ready" | "error";

export default function TransactionsPage() {
  const currentMonth = currentMonthKey();
  const [monthKey, setMonthKey] = useState(currentMonth);
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [items, setItems] = useState<EntryDoc[]>([]);
  const [state, setState] = useState<LoadState>("idle");
  const [err, setErr] = useState("");
  const [items, setItems] = useState<EntryDoc[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editAmount, setEditAmount] = useState("");

  const openSwipeId = useRef<string | null>(null);

  /* =========================
     Load data
  ========================= */
  useEffect(() => {
    let cancelled = false;

    async function loadTransactions() {
      setState("loading");
      setErrorMessage("");

      try {
        const loadedItems = await listMonthEntries(monthKey);
        if (cancelled) return;

        setItems(loadedItems);
        setState("ready");
      } catch (error: any) {
        if (cancelled) return;

        setItems([]);
        setState("error");
        setErrorMessage(error?.message || "לא הצלחנו לטעון את יומן התנועות.");
      }
    }

    loadTransactions();
    return () => {
      cancelled = true;
    };
  }, [monthKey]);

  useEffect(() => {
    if (!monthOptions.length) return;
    if (!monthOptions.includes(monthKey)) {
      setMonthKey(monthOptions[0]);
    }
  }, [monthOptions, monthKey]);

  const monthSummary = useMemo(() => summarizeMonthlyEntries(items, monthKey), [items, monthKey]);

  const filteredItems = useMemo(() => {
    return items.filter((entry) => {
      const lifecycle = getEntryLifecycle(entry, todayISO());
      const matchesFilter =
        filterKey === "all"
          ? true
          : filterKey === "income"
          ? entry.type === "income"
          : filterKey === "variable"
          ? getEntryTone(entry) === "variable"
          : filterKey === "fixed"
          ? getEntryTone(entry) === "fixed"
          : lifecycle === "scheduled";

      if (!matchesFilter) return false;
      if (!deferredSearch) return true;

      const haystack = [entry.category, entry.description, entry.date, getEntryTypeLabel(entry)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(deferredSearch);
    });
  }, [items, filterKey, deferredSearch]);

  function startEdit(entry: EntryDoc) {
    setEditingId(entry.id);
    setEditDate(String(entry.date || ""));
    setEditCategory(String(entry.category || ""));
    setEditDescription(String(entry.description || ""));
    setEditAmount(String(entry.amount || ""));
    setEditError("");
  }

  function cancelEdit() {
    setEditingId("");
    setEditError("");
    setSavingEditId("");
  }

  async function saveEdit(it: EntryDoc) {
    const mk = monthKeyFromISO(editDate);

    await updateDoc(doc(db, "records", it.id), {
      date: editDate,
      monthKey: mk,
      category: editCategory,
      description: editDescription,
      amount: Number(editAmount),
      updatedAt: Date.now(),
    });

    setEditingId(null);
  }

  async function onDelete(it: EntryDoc) {
    if (!window.confirm("למחוק את התנועה?")) return;
    await deleteDoc(doc(db, "records", it.id));
    setItems((prev) => prev.filter((x) => x.id !== it.id));
  }

  /* =========================
     Swipe logic – FIXED
  ========================= */
 function onPointerDown(e: React.PointerEvent, id: string) {
  const row = (e.currentTarget as HTMLElement).closest(
    ".swipe-row"
  ) as HTMLElement | null;
  if (!row) return;

  const contentEl = row.querySelector(".swipe-content");
  if (!(contentEl instanceof HTMLElement)) return;

  const content = contentEl; // מעכשיו non-null ו-type-safe

  // סגירת swipe פתוח קודם
  if (openSwipeId.current && openSwipeId.current !== id) {
    const prev = document.querySelector(
      `[data-swipe-id="${openSwipeId.current}"] .swipe-content`
    );
    if (prev instanceof HTMLElement) {
      prev.style.transform = "";
    }
    openSwipeId.current = null;
  }

  let startX = e.clientX;
  let currentX = 0;
  const maxSwipe = -140;
  let moved = false;

  function move(ev: PointerEvent) {
    currentX = ev.clientX - startX;

    if (Math.abs(currentX) > 6) {
      moved = true;
      ev.preventDefault();
    }

    if (currentX < 0) {
      content.style.transform = `translateX(${Math.max(
        currentX,
        maxSwipe
      )}px)`;
    }
  }

  async function removeEntry(entry: EntryDoc) {
    if (!window.confirm("למחוק את התנועה הזו?")) return;

    setDeletingId(entry.id);
    setErrorMessage("");
    try {
      await deleteEntryRecord(entry.id);
      setItems((currentItems) => currentItems.filter((currentEntry) => currentEntry.id !== entry.id));
    } catch (error: any) {
      setErrorMessage(error?.message || "אירעה שגיאה במחיקת התנועה.");
    } finally {
      setDeletingId("");
    }
  }

  return (
    <AppLayout title="תנועות">
      <div className="card">
        <label>חודש</label>
        <select
          className="input"
          value={monthKey}
          onChange={(e) => setMonthKey(e.target.value)}
        >
          {Array.from({ length: 24 }).map((_, i) => {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            const mk = `${d.getFullYear()}-${String(
              d.getMonth() + 1
            ).padStart(2, "0")}`;
            return (
              <option key={mk} value={mk}>
                {mk}
              </option>
            );
          })}
        </select>
      </div>

            <div className="field-stack field-span-2">
              <label>חיפוש</label>
              <input
                className="input"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="חיפוש לפי קטגוריה, תיאור או תאריך"
              />
            </div>

            <div className="field-stack">
              <label>סינון</label>
              <select className="input" value={filterKey} onChange={(event) => setFilterKey(event.target.value as FilterKey)}>
                <option value="all">כל התנועות</option>
                <option value="income">הכנסות</option>
                <option value="variable">הוצאות משתנות</option>
                <option value="fixed">הוצאות קבועות</option>
                <option value="scheduled">מתוזמנות בלבד</option>
              </select>
            </div>
          </div>

          {availableMonths.length > 0 && !availableMonths.includes(currentMonth) ? (
            <div className="note-banner">החודש הנוכחי ללא תנועות, ולכן מוצג אוטומטית החודש האחרון עם נתונים.</div>
          ) : null}
          {state === "loading" || isMonthPending ? <div className="note-banner">טוען את היומן...</div> : null}
          {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}
        </section>

        <section className="summary-grid compact-grid">
          <article className="summary-card neutral">
            <div className="summary-label">סה"כ הוצאות</div>
            <div className="summary-value">{formatILS(monthSummary.totals.expenses)}</div>
            <div className="summary-hint">כולל קבועות ומשתנות</div>
          </article>
          <article className="summary-card neutral">
            <div className="summary-label">הכנסות</div>
            <div className="summary-value">{formatILS(monthSummary.totals.income)}</div>
            <div className="summary-hint">{monthSummary.counts.income} תנועות</div>
          </article>
          <article className={`summary-card ${monthSummary.totals.balance >= 0 ? "positive" : "negative"}`}>
            <div className="summary-label">מאזן</div>
            <div className="summary-value">{formatILS(monthSummary.totals.balance)}</div>
            <div className="summary-hint">תמונה מלאה לחודש הנבחר</div>
          </article>
          <article className="summary-card neutral">
            <div className="summary-label">תוצאות מסוננות</div>
            <div className="summary-value">{filteredItems.length}</div>
            <div className="summary-hint">תנועות לאחר חיפוש וסינון</div>
          </article>
        </section>

        <section className="card">
          <div className="section-header compact">
            <div>
              <div className="section-title">רשומות</div>
              <div className="section-subtitle">היומן מסודר בסדר כרונולוגי יורד, עם סטטוסים ותשלומים מפוצלים.</div>
            </div>
          </div>

          {!filteredItems.length ? (
            <div className="empty-panel">לא נמצאו תנועות שתואמות את הסינון הנוכחי.</div>
          ) : (
            <div className="ledger-list">
              {filteredItems.map((entry) => {
                const tone = getEntryTone(entry);
                const lifecycle = getEntryLifecycle(entry, todayISO());
                const installmentLabel = getInstallmentLabel(entry);
                const isEditing = editingId === entry.id;

                return (
                  <article key={entry.id} className={`ledger-row ${tone}`}>
                    {!isEditing ? (
                      <>
                        <div className="ledger-top">
                          <div>
                            <div className="ledger-title">{entry.category || "ללא קטגוריה"}</div>
                            <div className="ledger-subtitle">{entry.description || getEntryTypeLabel(entry)}</div>
                          </div>

                          <div className={`ledger-amount ${tone}`}>
                            {entry.type === "income" ? "+" : "-"}
                            {formatILS(Number(entry.amount || 0))}
                          </div>
                        </div>

                        <div className="ledger-meta">
                          <span className="ledger-date">{entry.date}</span>
                          <div className="badge-row">
                            <span className={`status-pill ${tone}`}>{getEntryTypeLabel(entry)}</span>
                            {lifecycle === "scheduled" ? <span className="status-pill warn">מתוזמן</span> : null}
                            {installmentLabel ? <span className="status-pill neutral">תשלום {installmentLabel}</span> : null}
                          </div>
                        </div>

                        <div className="ledger-actions">
                          <button className="btn secondary" type="button" onClick={() => startEdit(entry)}>
                            ערוך
                          </button>
                          <button
                            className="btn danger"
                            type="button"
                            onClick={() => removeEntry(entry)}
                            disabled={deletingId === entry.id}
                          >
                            {deletingId === entry.id ? "מוחק..." : "מחק"}
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="ledger-editor">
                        <div className="filters-grid compact-editor">
                          <div className="field-stack">
                            <label>תאריך</label>
                            <input className="input" type="date" value={editDate} onChange={(event) => setEditDate(event.target.value)} />
                          </div>
                          <div className="field-stack">
                            <label>קטגוריה</label>
                            <input className="input" value={editCategory} onChange={(event) => setEditCategory(event.target.value)} />
                          </div>
                          <div className="field-stack">
                            <label>סכום</label>
                            <input className="input" value={editAmount} onChange={(event) => setEditAmount(event.target.value)} />
                          </div>
                          <div className="field-stack field-span-2">
                            <label>תיאור</label>
                            <input className="input" value={editDescription} onChange={(event) => setEditDescription(event.target.value)} />
                          </div>
                        </div>

                        {editError ? <div className="error-banner">{editError}</div> : null}

                        <div className="ledger-actions">
                          <button className="btn" type="button" onClick={() => saveEdit(entry)} disabled={savingEditId === entry.id}>
                            {savingEditId === entry.id ? "שומר..." : "שמור"}
                          </button>
                          <button className="btn secondary" type="button" onClick={cancelEdit}>
                            ביטול
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </AppLayout>
  );
}



