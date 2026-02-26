import React, { useEffect, useRef, useState } from "react";
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
  query,
  updateDoc,
  where,
} from "firebase/firestore";

type LoadState = "idle" | "loading" | "ready" | "error";

export default function TransactionsPage() {
  const [monthKey, setMonthKey] = useState(currentMonthKey());
  const [state, setState] = useState<LoadState>("idle");
  const [err, setErr] = useState("");
  const [items, setItems] = useState<EntryDoc[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "income" | "expense">("all");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editAmount, setEditAmount] = useState("");

  const openSwipeId = useRef<string | null>(null);

  const filteredItems = items.filter((it) => {
    if (typeFilter !== "all" && it.type !== typeFilter) return false;
    if (!search.trim()) return true;

    const q = search.trim().toLowerCase();
    return (
      String(it.category || "").toLowerCase().includes(q) ||
      String(it.description || "").toLowerCase().includes(q) ||
      String(it.date || "").toLowerCase().includes(q)
    );
  });

  const totals = filteredItems.reduce(
    (acc, it) => {
      const amount = Number(it.amount || 0);
      if (it.type === "income") acc.income += amount;
      else acc.expense += amount;
      return acc;
    },
    { income: 0, expense: 0 }
  );

  /* =========================
     Load data
  ========================= */
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState("loading");
      setErr("");

      try {
  const qByMonthKey = query(
  collection(db, "records"),
  where("monthKey", "==", monthKey)
);

const qByMonth = query(
  collection(db, "records"),
  where("month", "==", monthKey)
);

const [snapKey, snapMonth] = await Promise.all([getDocs(qByMonthKey), getDocs(qByMonth)]);
if (cancelled) return;

const seen = new Set<string>();
const list: EntryDoc[] = [];

const pushSnap = (snap: any) => {
  snap.forEach((d: any) => {
    if (seen.has(d.id)) return;
    seen.add(d.id);
    list.push({ id: d.id, ...(d.data() as any) } as EntryDoc);
  });
};

pushSnap(snapKey);
pushSnap(snapMonth);

// מיון מקומי כדי להימנע מתלות ב-orderBy ואינדקסים
list.sort((a: any, b: any) => {
  const aT = Number(a?.updatedAt || a?.createdAt || 0);
  const bT = Number(b?.updatedAt || b?.createdAt || 0);
  return bT - aT;
});

setItems(list);
setState("ready");



      } catch (e: any) {
        if (!cancelled) {
          setErr(e.message || "שגיאה בטעינה");
          setState("error");
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [monthKey]);

  /* =========================
     Edit helpers
  ========================= */
  function startEdit(it: EntryDoc) {
    setEditingId(it.id);
    setEditDate(String(it.date || ""));
    setEditCategory(String(it.category || ""));
    setEditDescription(String(it.description || ""));
    setEditAmount(String(it.amount || ""));
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(it: EntryDoc) {
    const mk = monthKeyFromISO(editDate);

await updateDoc(doc(db, "records", it.id), {
  date: editDate,
  monthKey: mk,
  month: mk,
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

  function up() {
    if (moved && currentX < -60) {
      content.style.transform = `translateX(${maxSwipe}px)`;
      openSwipeId.current = id;
    } else {
      content.style.transform = "";
      openSwipeId.current = null;
    }

    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  }

  window.addEventListener("pointermove", move, { passive: false });
  window.addEventListener("pointerup", up);
}


  /* =========================
     Render
  ========================= */
  return (
    <AppLayout title="תנועות">
      <div className="card">
        <div className="form-grid">
          <div>
            <label>חודש</label>
            <select className="input" value={monthKey} onChange={(e) => setMonthKey(e.target.value)}>
              {Array.from({ length: 24 }).map((_, i) => {
                const d = new Date();
                d.setMonth(d.getMonth() - i);
                const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                return (
                  <option key={mk} value={mk}>
                    {mk}
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label>סוג תנועה</label>
            <select
              className="input"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as "all" | "income" | "expense")}
            >
              <option value="all">הכול</option>
              <option value="income">הכנסות</option>
              <option value="expense">הוצאות</option>
            </select>
          </div>
        </div>

        <div style={{ height: 10 }} />

        <label>חיפוש מהיר</label>
        <input
          className="input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="קטגוריה, תיאור או תאריך"
        />

        <div className="row" style={{ marginTop: 10 }}>
          <div className="badge">סה"כ הכנסות: {formatILS(totals.income)}</div>
          <div className="badge">סה"כ הוצאות: {formatILS(totals.expense)}</div>
          <div className="badge">נטו: {formatILS(totals.income - totals.expense)}</div>
          <div className="badge">פריטים: {filteredItems.length}</div>
        </div>
      </div>

      <div style={{ height: 12 }} />

      {state === "error" && (
        <div className="card">
          <div style={{ color: "#fecaca" }}>{err}</div>
        </div>
      )}

      {state === "ready" && (
        <div className="grid">
          {filteredItems.map((it) => {
            const isEditing = editingId === it.id;
            const isLargeExpense = it.type === "expense" && Number(it.amount || 0) >= 1000;

            return (
              <div
                key={it.id}
                className="swipe-row"
                data-swipe-id={it.id}
              >
                <div className="swipe-actions">
                  <button
                    className="swipe-btn edit"
                    onClick={() => startEdit(it)}
                  >
                    ערוך
                  </button>
                  <button
                    className="swipe-btn delete"
                    onClick={() => onDelete(it)}
                  >
                    מחק
                  </button>
                </div>

                <div className={"swipe-content card" + (isLargeExpense ? " tx-large-expense" : "")} onPointerDown={(e) => onPointerDown(e, it.id)}>
                  <div className="txn-title">
                    {formatILS(it.amount)} –{" "}
                    {it.category || "ללא קטגוריה"}
                  </div>
                  <div className="txn-sub">
                    {it.description || "ללא תיאור"}
                  </div>
                  <div className="txn-date">
                    {String(it.date || "")}
                  </div>

                  {isEditing && (
                    <div className="form-grid" style={{ marginTop: 12 }}>
                      <input
                        className="input"
                        type="date"
                        value={editDate}
                        onChange={(e) => setEditDate(e.target.value)}
                      />
                      <input
                        className="input"
                        value={editCategory}
                        onChange={(e) =>
                          setEditCategory(e.target.value)
                        }
                      />
                      <input
                        className="input"
                        value={editDescription}
                        onChange={(e) =>
                          setEditDescription(e.target.value)
                        }
                      />
                      <input
                        className="input"
                        value={editAmount}
                        onChange={(e) =>
                          setEditAmount(e.target.value)
                        }
                      />
                      <button
                        className="btn"
                        onClick={() => saveEdit(it)}
                      >
                        שמור
                      </button>
                      <button
                        className="btn secondary"
                        onClick={cancelEdit}
                      >
                        בטל
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {filteredItems.length === 0 && (
            <div className="card muted" style={{ textAlign: "center" }}>
              לא נמצאו תוצאות לפי הסינון שבחרת.
            </div>
          )}
        </div>
      )}
    </AppLayout>
  );
}
