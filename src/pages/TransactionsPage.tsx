import React, { useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";
import { Link } from "react-router-dom";
import AppLayout from "../app/layout/AppLayout";
import { summarizeMonthlyEntries } from "../domain/analytics";
import { getEntryLifecycle, getEntryTone, getEntryTypeLabel, getInstallmentLabel, parseAmountInput, sortEntriesByDisplayDate } from "../domain/entries";
import { deleteEntryRecord, listAvailableMonthKeys, listMonthEntries, subscribeRecordsState, updateEntryRecord } from "../services/recordsService";
import type { EntryDoc } from "../types/models";
import { currentMonthKey, formatMonthKey, listRecentMonthKeys, monthKeyFromISO, todayISO } from "../utils/dates";
import { formatILS } from "../utils/money";

type LoadState = "idle" | "loading" | "ready" | "error";
type FilterKey = "all" | "income" | "variable" | "fixed" | "scheduled";

function mergeMonthOptions(primary: string[], secondary: string[]): string[] {
  return Array.from(new Set([...primary, ...secondary])).sort((left, right) => right.localeCompare(left));
}

export default function TransactionsPage() {
  const currentMonth = currentMonthKey();
  const [monthKey, setMonthKey] = useState(currentMonth);
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [items, setItems] = useState<EntryDoc[]>([]);
  const [state, setState] = useState<LoadState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [search, setSearch] = useState("");
  const [filterKey, setFilterKey] = useState<FilterKey>("all");
  const [editingId, setEditingId] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editError, setEditError] = useState("");
  const [savingEditId, setSavingEditId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [isMonthPending, startMonthTransition] = useTransition();

  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const monthOptions = useMemo(
    () => mergeMonthOptions(listRecentMonthKeys(18, currentMonth, "desc"), availableMonths),
    [availableMonths, currentMonth]
  );

  useEffect(() => {
    return subscribeRecordsState(() => {
      setReloadToken((value) => value + 1);
    });
  }, []);

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
  }, [monthKey, reloadToken]);

  const monthSummary = useMemo(() => summarizeMonthlyEntries(items, monthKey), [items, monthKey]);

  const filteredItems = useMemo(() => {
    const filtered = items.filter((entry) => {
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

    return sortEntriesByDisplayDate(filtered);
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

  async function saveEdit(entry: EntryDoc) {
    const amount = parseAmountInput(editAmount);
    if (!amount) {
      setEditError("נא להזין סכום תקין.");
      return;
    }
    if (!editCategory) {
      setEditError("נא להזין קטגוריה.");
      return;
    }
    if (!editDate) {
      setEditError("נא לבחור תאריך.");
      return;
    }

    setSavingEditId(entry.id);
    setEditError("");

    try {
      await updateEntryRecord(entry.id, {
        date: editDate,
        category: editCategory,
        description: editDescription,
        amount,
      });

      const nextMonthKey = monthKeyFromISO(editDate);
      if (nextMonthKey !== monthKey) {
        setReloadToken((value) => value + 1);
      } else {
        setItems((currentItems) =>
          currentItems.map((currentEntry) =>
            currentEntry.id === entry.id
              ? {
                  ...currentEntry,
                  date: editDate,
                  monthKey: nextMonthKey,
                  category: editCategory,
                  description: editDescription,
                  amount,
                }
              : currentEntry
          )
        );
      }

      cancelEdit();
    } catch (error: any) {
      setEditError(error?.message || "אירעה שגיאה בשמירת התנועה.");
    } finally {
      setSavingEditId("");
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
      <div className="page-stack">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <Link className="btn" to="/add">
            הוספת תנועה
          </Link>

          <div className="row" style={{ gap: 10, alignItems: "center" }}>
            <div className="muted" style={{ fontSize: 12 }}>
              חודש
            </div>
            <select
              className="input"
              style={{ width: 180 }}
              value={monthKey}
              disabled={state === "loading" || isMonthPending}
              onChange={(event) => startMonthTransition(() => setMonthKey(event.target.value))}
            >
              {monthOptions.map((optionMonthKey) => (
                <option key={optionMonthKey} value={optionMonthKey}>
                  {formatMonthKey(optionMonthKey)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="toolbar-card">
          <div className="row" style={{ gap: 12, alignItems: "flex-end" }}>
            <div className="field-stack" style={{ flex: 2, minWidth: 220 }}>
              <label>חיפוש</label>
              <input
                className="input"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="חיפוש לפי קטגוריה, תיאור או תאריך"
              />
            </div>

            <div className="field-stack" style={{ flex: 1, minWidth: 180 }}>
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
        </div>

        {availableMonths.length > 0 && !availableMonths.includes(currentMonth) ? (
          <div className="note-banner">החודש הנוכחי ללא תנועות, ולכן מוצג אוטומטית החודש האחרון עם נתונים.</div>
        ) : null}
        {state === "loading" || isMonthPending ? <div className="note-banner">טוען את היומן...</div> : null}
        {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}

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

        <div className="card">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontWeight: 900 }}>תנועות</div>
            <div className="muted" style={{ fontSize: 12 }}>הכרטיסיות מתעדכנות לפי החיפוש והסינון הנוכחיים</div>
          </div>

          <div style={{ height: 10 }} />

          {!filteredItems.length ? (
            <div className="muted">לא נמצאו תנועות שתואמות את הסינון הנוכחי.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
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
                            <div className="ledger-title">
                              {entry.category || "ללא קטגוריה"} - {formatILS(Number(entry.amount || 0))}
                            </div>
                            <div className="ledger-subtitle">
                              {getEntryTypeLabel(entry)}
                              {entry.description ? ` · ${entry.description}` : ""}
                            </div>
                          </div>

                          <div className="row" style={{ gap: 6 }}>
                            <button className="btn secondary" type="button" onClick={() => startEdit(entry)}>
                              ערוך
                            </button>
                            <button className="btn danger" type="button" onClick={() => removeEntry(entry)} disabled={deletingId === entry.id}>
                              {deletingId === entry.id ? "מוחק..." : "מחיקה"}
                            </button>
                          </div>
                        </div>

                        <div className="ledger-meta">
                          <div className="ledger-date">{String(entry.date || "")}</div>
                          <div className="badge-row">
                            <span className={`status-pill ${tone}`}>{getEntryTypeLabel(entry)}</span>
                            {lifecycle === "scheduled" ? <span className="status-pill warn">מתוזמן</span> : null}
                            {installmentLabel ? <span className="status-pill neutral">תשלום {installmentLabel}</span> : null}
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="form-grid">
                          <div>
                            <label>תאריך</label>
                            <input className="input" type="date" value={editDate} onChange={(event) => setEditDate(event.target.value)} />
                          </div>

                          <div>
                            <label>קטגוריה</label>
                            <input className="input" value={editCategory} onChange={(event) => setEditCategory(event.target.value)} />
                          </div>

                          <div>
                            <label>סכום</label>
                            <input className="input" value={editAmount} onChange={(event) => setEditAmount(event.target.value)} />
                          </div>

                          <div>
                            <label>תיאור</label>
                            <input className="input" value={editDescription} onChange={(event) => setEditDescription(event.target.value)} />
                          </div>
                        </div>

                        {editError ? <div className="error" style={{ marginTop: 8 }}>{editError}</div> : null}

                        <div className="row" style={{ gap: 8, marginTop: 10 }}>
                          <button className="btn" type="button" onClick={() => saveEdit(entry)} disabled={savingEditId === entry.id}>
                            {savingEditId === entry.id ? "שומר..." : "שמור"}
                          </button>
                          <button className="btn secondary" type="button" onClick={cancelEdit}>
                            ביטול
                          </button>
                        </div>
                      </>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
