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

function typeLabel(it: EntryDoc) {
  if (it.type === "income") return "הכנסה";
if (it.type === "expense" && it.subType === "fixed_realization") return "הוצאה קבועה";
  return "הוצאה משתנה";
}

function userLabel(userKey?: string) {
  if (userKey === "W") return "ו";
  if (userKey === "B") return "ב";
  if (userKey === "SYSTEM") return "ס";
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

function toMillis(v: any): number {
  if (!v) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v.seconds === "number") return v.seconds * 1000;
  if (v instanceof Date) return v.getTime();
  return 0;
}

function dateKey(v: any): string {
  if (!v) return "";
  if (typeof v === "string") return v.slice(0, 10);
  if (typeof v.toDate === "function") {
    try {
      return v.toDate().toISOString().slice(0, 10);
    } catch {
      return "";
    }
  }
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return "";
}

export default function TransactionsPage() {
  const [monthKey, setMonthKey] = useState(currentMonthKey());
  const [state, setState] = useState<LoadState>("idle");
  const [err, setErr] = useState("");
  const [items, setItems] = useState<EntryDoc[]>([]);
  const [deletingId, setDeletingId] = useState("");

  const [editingId, setEditingId] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editErr, setEditErr] = useState("");
  const [savingEditId, setSavingEditId] = useState("");

  const monthOptions = useMemo(() => {
    const out: string[] = [];
    const now = new Date();
    for (let i = 0; i < 24; i++) {
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

        // שינוי נקודתי: מיון לפי תאריך פעולה (date) מהחדש לישן
        // במקרה של שוויון: לפי updatedAt ואז createdAt מהחדש לישן
        list.sort((a: any, b: any) => {
          const ad = dateKey(a?.date);
          const bd = dateKey(b?.date);
          if (ad !== bd) return bd.localeCompare(ad);

          const aT = toMillis(a?.updatedAt) || toMillis(a?.createdAt);
          const bT = toMillis(b?.updatedAt) || toMillis(b?.createdAt);
          return bT - aT;
        });

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
      `האם למחוק את התנועה?\n\n${typeLabel(it)} - ${formatILS(it.amount)}\n${String(it.date || "")} - ${String(
        it.category || ""
      )}`
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
    setEditDate(String(it.date || ""));
    setEditCategory(String(it.category || ""));
    setEditDescription(String(it.description || ""));
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
        setItems((prev) => {
          const next = prev.map((x) => (x.id === it.id ? ({ ...x, ...updatePayload } as any) : x));
          // לשמור על המיון גם אחרי שמירה
          next.sort((a: any, b: any) => {
            const ad = dateKey(a?.date);
            const bd = dateKey(b?.date);
            if (ad !== bd) return bd.localeCompare(ad);
            const aT = toMillis(a?.updatedAt) || toMillis(a?.createdAt);
            const bT = toMillis(b?.updatedAt) || toMillis(b?.createdAt);
            return bT - aT;
          });
          return next as any;
        });
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
            <div className="input" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
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
                      <div
                        style={{
                          fontWeight: 700,
                          display: "flex",
                          gap: 8,
                          alignItems: "center",
                          flexWrap: "wrap",
                        }}
                      >
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
                              title="שמירת עריכה"
                            >
                              {isSavingThis ? "שומר..." : "שמור"}
                            </button>

                            <button
                              className="btn secondary"
                              type="button"
                              onClick={() => cancelEdit()}
                              disabled={isSavingThis}
                              title="ביטול עריכה"
                            >
                              בטל
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {!isEditing ? (
                      <>
                        <div className="muted" style={{ marginTop: 8 }}>
                          {it.category || "ללא קטגוריה"}
                        </div>
                        <div className="muted" style={{ marginTop: 6 }}>
                          {it.description || "ללא תיאור"}
                        </div>
                        <div className="muted" style={{ marginTop: 6 }}>
                          {String(it.date || "")}
                        </div>
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
                              disabled={isSavingThis}
                            />
                          </div>

                          <div className="grid" style={{ gap: 6 }}>
                            <label>תיאור</label>
                            <input
                              className="input"
                              value={editDescription}
                              onChange={(e) => setEditDescription(e.target.value)}
                              disabled={isSavingThis}
                            />
                          </div>

                          <div className="grid" style={{ gap: 6 }}>
                            <label>סכום</label>
                            <input
                              className="input"
                              value={editAmount}
                              onChange={(e) => setEditAmount(e.target.value)}
                              disabled={isSavingThis}
                              inputMode="decimal"
                            />
                          </div>
                        </div>

                        {editErr ? <div style={{ color: "#fecdd3", fontSize: 12, marginTop: 8 }}>{editErr}</div> : null}
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
