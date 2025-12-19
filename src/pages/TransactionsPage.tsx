import React, { useEffect, useMemo, useState } from "react";
import AppLayout from "../app/layout/AppLayout";
import { currentMonthKey, monthKeyFromISO } from "../utils/dates";
import { formatILS } from "../utils/money";
import { db } from "../services/firebase";
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
} from "firebase/firestore";

type LoadState = "idle" | "loading" | "ready" | "error";

function typeLabel(e: EntryDoc): string {
  if (e.type === "income") return "הכנסה";
  return "הוצאה";
}

function userLabel(userKey: string): string {
  if (userKey === "B") return "ב";
  if (userKey === "W") return "ו";
  return "ס";
}

function parseAmount(input: string): number | null {
  const normalized = (input || "").replace(/,/g, "").trim();
  const n = Number(normalized);
  if (!normalized || Number.isNaN(n) || !Number.isFinite(n)) return null;
  if (n <= 0) return null;
  return n;
}

function hasInstallments(it: any): boolean {
  return !!it?.installmentsTotal && Number(it.installmentsTotal) > 1;
}

export default function TransactionsPage() {
  const [monthKey, setMonthKey] = useState<string>(currentMonthKey());
  const [state, setState] = useState<LoadState>("idle");
  const [err, setErr] = useState<string>("");
  const [items, setItems] = useState<EntryDoc[]>([]);
  const [deletingId, setDeletingId] = useState<string>("");

  // מצב עריכה
  const [editingId, setEditingId] = useState<string>("");
  const [editDate, setEditDate] = useState<string>("");
  const [editCategory, setEditCategory] = useState<string>("");
  const [editDescription, setEditDescription] = useState<string>("");
  const [editAmount, setEditAmount] = useState<string>("");
  const [editErr, setEditErr] = useState<string>("");
  const [savingEditId, setSavingEditId] = useState<string>("");

  const monthOptions = useMemo(() => {
    const out: string[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
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

        const list: EntryDoc[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<EntryDoc, "id">),
        }));

        if (!cancelled) {
          setItems(list);
          setState("ready");
        }
      } catch (ex: any) {
        if (!cancelled) {
          setItems([]);
          setState("error");
          setErr(ex?.message || "שגיאה בטעינת נתונים.");
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [monthKey]);

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const it of items) {
      if (it.type === "income") income += Number(it.amount) || 0;
      else expense += Number(it.amount) || 0;
    }
    return { income, expense, balance: income - expense };
  }, [items]);

  async function onDelete(it: EntryDoc) {
    if (!it?.id) return;

    const ok = window.confirm(
      `האם למחוק את התנועה?\n\n${typeLabel(it)} - ${formatILS(it.amount)}\n${it.date} - ${it.category}`
    );
    if (!ok) return;

    setErr("");
    setDeletingId(it.id);

    try {
      await deleteDoc(doc(db, "records", it.id));
      setItems((prev) => prev.filter((x) => x.id !== it.id));
    } catch (ex: any) {
      setErr(ex?.message || "שגיאה במחיקה.");
    } finally {
      setDeletingId("");
    }
  }

  function startEdit(it: EntryDoc) {
    setEditErr("");
    setEditingId(it.id);
    setEditDate(it.date || "");
    setEditCategory(it.category || "");
    setEditDescription(it.description || "");
    setEditAmount(String(it.amount ?? ""));
  }

  function cancelEdit() {
    if (savingEditId) return;
    setEditingId("");
    setEditErr("");
    setEditDate("");
    setEditCategory("");
    setEditDescription("");
    setEditAmount("");
  }

  function validateEdit(): { amountNumber: number } | null {
    setEditErr("");

    if (!editDate) {
      setEditErr("נא לבחור תאריך.");
      return null;
    }
    if (!editCategory) {
      setEditErr("נא לבחור קטגוריה.");
      return null;
    }
    const n = parseAmount(editAmount);
    if (n === null) {
      setEditErr("נא להזין סכום תקין (גדול מאפס).");
      return null;
    }
    return { amountNumber: n };
  }

  async function onSaveEditToFirestore(it: EntryDoc) {
    const v = validateEdit();
    if (!v) return;

    setErr("");
    setEditErr("");
    setSavingEditId(it.id);

    try {
      const nextMonthKey = monthKeyFromISO(editDate);

      const updatePayload: Partial<EntryDoc> = {
        date: editDate,
        monthKey: nextMonthKey,
        category: editCategory,
        description: editDescription.trim(),
        amount: v.amountNumber,
        updatedAt: Date.now(),
      };

      await updateDoc(doc(db, "records", it.id), updatePayload as any);

      if (nextMonthKey !== monthKey) {
        setItems((prev) => prev.filter((x) => x.id !== it.id));
      } else {
        setItems((prev) =>
          prev.map((x) => (x.id === it.id ? { ...x, ...updatePayload } : x))
        );
      }

      cancelEdit();
    } catch (ex: any) {
      setEditErr(ex?.message || "שגיאה בשמירה ל-Firestore.");
    } finally {
      setSavingEditId("");
    }
  }

  return (
    <AppLayout title="תנועות">
      <div className="card">
        <h2>סינון</h2>

        <div className="form-grid">
          <div className="grid" style={{ gap: 6 }}>
            <label>חודש</label>
            <select
              className="input"
              value={monthKey}
              onChange={(e) => setMonthKey(e.target.value)}
              disabled={state === "loading" || !!deletingId || !!editingId || !!savingEditId}
            >
              {monthOptions.map((mk) => (
                <option key={mk} value={mk}>
                  {mk}
                </option>
              ))}
            </select>
          </div>

          <div className="grid" style={{ gap: 6 }}>
            <label>סיכום לחודש</label>
            <div
              className="input"
              style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}
            >
              <span className="muted">הכנסות:</span>
              <span>{formatILS(totals.income)}</span>
              <span className="muted" style={{ marginInlineStart: 8 }}>
                הוצאות:
              </span>
              <span>{formatILS(totals.expense)}</span>
              <span className="muted" style={{ marginInlineStart: 8 }}>
                יתרה:
              </span>
              <span>{formatILS(totals.balance)}</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ height: 12 }} />

      {err ? (
        <div className="card">
          <h2>שגיאה</h2>
          <div style={{ color: "#fecdd3", fontSize: 12 }}>{err}</div>
        </div>
      ) : null}

      {state === "loading" ? (
        <div className="card">
          <h2>טוען</h2>
          <div className="muted">טוען תנועות...</div>
        </div>
      ) : null}

      {state === "ready" ? (
        <>
          {items.length === 0 ? (
            <div className="card">
              <h2>אין נתונים</h2>
              <div className="muted">לא נמצאו תנועות בחודש {monthKey}.</div>
            </div>
          ) : (
            <div className="grid" style={{ gap: 10 }}>
              {items.map((it: any) => {
                const isEditing = editingId === it.id;
                const isSavingThis = savingEditId === it.id;

                return (
                  <div key={it.id} className="card">
                    <div className="row" style={{ justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontWeight: 700, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <span>
                          {typeLabel(it)} - {formatILS(it.amount)}
                        </span>

                        {hasInstallments(it) ? (
                          <span className="badge">
                            תשלום {it.installmentIndex}/{it.installmentsTotal}
                          </span>
                        ) : null}
                      </div>

                      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                        <div className="badge">מזין: {userLabel(it.userKey)}</div>

                        {!isEditing ? (
                          <>
                            <button
                              className="btn secondary"
                              type="button"
                              onClick={() => startEdit(it)}
                              disabled={!!deletingId || !!savingEditId}
                              title="עריכת תנועה"
                            >
                              ערוך
                            </button>

                            <button
                              className="btn secondary"
                              type="button"
                              onClick={() => onDelete(it)}
                              disabled={!!deletingId || !!savingEditId}
                              title="מחיקת תנועה"
                            >
                              {deletingId === it.id ? "מוחק..." : "מחק"}
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className="btn"
                              type="button"
                              onClick={() => onSaveEditToFirestore(it)}
                              disabled={isSavingThis}
                            >
                              {isSavingThis ? "שומר..." : "שמור"}
                            </button>
                            <button
                              className="btn secondary"
                              type="button"
                              onClick={cancelEdit}
                              disabled={isSavingThis}
                            >
                              ביטול
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {!isEditing ? (
                      <>
                        <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                          {it.date} - {it.category}
                        </div>
                      {it.description ? (
                        <div style={{ marginTop: 8 }}>{it.description}</div>
                      ) : null}

                      </>
                    ) : (
                      <>
                        <div style={{ height: 10 }} />

                        <div className="form-grid">
                          <div className="grid" style={{ gap: 6 }}>
                            <label>תאריך</label>
                            <input
                              className="input"
                              type="date"
                              value={editDate}
                              onChange={(e) => setEditDate(e.target.value)}
                              disabled={isSavingThis}
                            />
                          </div>

                          <div className="grid" style={{ gap: 6 }}>
                            <label>קטגוריה</label>
                            <input
                              className="input"
                              value={editCategory}
                              onChange={(e) => setEditCategory(e.target.value)}
                              placeholder="לדוגמה: מזון"
                              disabled={isSavingThis}
                            />
                          </div>
                        </div>

                        <div style={{ height: 10 }} />

                        <div className="form-grid">
                          <div className="grid" style={{ gap: 6 }}>
                            <label>סכום</label>
                            <input
                              className="input"
                              inputMode="decimal"
                              value={editAmount}
                              onChange={(e) => setEditAmount(e.target.value)}
                              placeholder="לדוגמה: 120"
                              disabled={isSavingThis}
                            />
                          </div>

                          <div className="grid" style={{ gap: 6 }}>
                            <label>תיאור</label>
                            <input
                              className="input"
                              value={editDescription}
                              onChange={(e) => setEditDescription(e.target.value)}
                              placeholder="לדוגמה: קניות בסופר"
                              disabled={isSavingThis}
                            />
                          </div>
                        </div>

                        {editErr ? (
                          <div style={{ color: "#fecdd3", fontSize: 12, marginTop: 10 }}>
                            {editErr}
                          </div>
                        ) : null}

                        <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
                          הערה: השמירה מתבצעת ל-Firestore. אם שינית לחודש אחר, התנועה תיעלם מהחודש הנוכחי.
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : null}
    </AppLayout>
  );
}
