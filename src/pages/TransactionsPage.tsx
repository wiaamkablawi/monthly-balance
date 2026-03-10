import React, { useEffect, useRef, useState } from "react";
import AppLayout from "../app/layout/AppLayout";
import { currentMonthKey, monthKeyFromISO } from "../utils/dates";
import { formatILS } from "../utils/money";
import { auth } from "../services/firebase";
import { db } from "../services/firebaseDb";
import type { EntryDoc } from "../types/models";
import { householdIdFromEmail } from "../services/authService";
import { getAvailableMonthKeys } from "../services/entriesService";
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

function logWithTs(message: string, extra?: Record<string, unknown>) {
  const ts = new Date().toISOString();
  if (extra) {
    console.log(`[${ts}] ${message}`, extra);
    return;
  }
  console.log(`[${ts}] ${message}`);
}

function parseAmountInput(v: string): number | null {
  const n = Number((v || "").replace(/,/g, "").trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export default function TransactionsPage() {
  const [monthKey, setMonthKey] = useState(currentMonthKey());
  const [state, setState] = useState<LoadState>("idle");
  const [err, setErr] = useState("");
  const [items, setItems] = useState<EntryDoc[]>([]);
  const [monthOptions, setMonthOptions] = useState<string[]>([currentMonthKey()]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editAmount, setEditAmount] = useState("");

  const openSwipeId = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadMonthOptions() {
      const user = auth.currentUser;
      if (!user?.email) {
        logWithTs("Transactions month options: no user email, fallback to current month");
        setMonthOptions([currentMonthKey()]);
        return;
      }

      try {
        const householdId = householdIdFromEmail(user.email);
        const loaded = await getAvailableMonthKeys(householdId, 24);
        logWithTs("Transactions month options loaded", { householdId, count: loaded.length, latest: loaded[0] || null });
        if (!cancelled && loaded.length) setMonthOptions(loaded);
      } catch (e: any) {
        logWithTs("Transactions month options load failed, fallback to current month", { error: e?.message || "unknown" });
        if (!cancelled) setMonthOptions([currentMonthKey()]);
      }
    }

    loadMonthOptions();
    return () => {
      cancelled = true;
    };
  }, [monthKey]);

  /* =========================
     Load data
  ========================= */
  useEffect(() => {
    let cancelled = false;

        async function load() {
      setState("loading");
      setErr("");

      try {
        const user = auth.currentUser;
        if (!user?.email) {
          setItems([]);
          setState("ready");
          return;
        }

        const householdId = householdIdFromEmail(user.email);
        const qByMonthKey = query(
          collection(db, "records"),
          where("householdId", "==", householdId),
          where("monthKey", "==", monthKey)
        );

        const snap = await getDocs(qByMonthKey);
        if (cancelled) return;

        const list: EntryDoc[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<EntryDoc, "id">),
        }));

        list.sort((a, b) => {
          const aT = Number(a.updatedAt || a.createdAt || 0);
          const bT = Number(b.updatedAt || b.createdAt || 0);
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

  useEffect(() => {
    if (!monthOptions.length) return;
    if (!monthOptions.includes(monthKey)) {
      logWithTs("Transactions selected month updated to latest available", {
        previous: monthKey,
        next: monthOptions[0],
      });
      setMonthKey(monthOptions[0]);
    }
  }, [monthOptions, monthKey]);

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
    const normalizedAmount = parseAmountInput(editAmount);
    if (!editDate) {
      setErr("נא לבחור תאריך תקין.");
      return;
    }
    if (!normalizedAmount) {
      setErr("נא להזין סכום חיובי תקין.");
      return;
    }

    const mk = monthKeyFromISO(editDate);
    const updatedAt = Date.now();

    try {
      await updateDoc(doc(db, "records", it.id), {
        date: editDate,
        monthKey: mk,
        category: editCategory,
        description: editDescription,
        amount: normalizedAmount,
        updatedAt,
      });

      setItems((prev) => {
        if (mk !== monthKey) {
          return prev.filter((x) => x.id !== it.id);
        }

        return prev
          .map((x) =>
            x.id === it.id
              ? {
                  ...x,
                  date: editDate,
                  monthKey: mk,
                  category: editCategory,
                  description: editDescription,
                  amount: normalizedAmount,
                  updatedAt,
                }
              : x
          )
          .sort((a, b) =>
            Number(b.updatedAt || b.createdAt || 0) -
            Number(a.updatedAt || a.createdAt || 0)
          );
      });

      setErr("");
      setEditingId(null);
    } catch (e: any) {
      setErr(e?.message || "שגיאה בעדכון התנועה.");
    }
  }

  async function onDelete(it: EntryDoc) {
    if (!window.confirm("למחוק את התנועה?")) return;
    try {
      await deleteDoc(doc(db, "records", it.id));
      setItems((prev) => prev.filter((x) => x.id !== it.id));
      setErr("");
    } catch (e: any) {
      setErr(e?.message || "שגיאה במחיקת התנועה.");
    }
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
        <label>חודש</label>
        <select
          className="input"
          value={monthKey}
          onChange={(e) => setMonthKey(e.target.value)}
        >
          {monthOptions.map((mk) => (
            <option key={mk} value={mk}>
              {mk}
            </option>
          ))}
        </select>
      </div>

      <div style={{ height: 12 }} />

      {state === "error" && (
        <div className="card">
          <div style={{ color: "#fecaca" }}>{err}</div>
        </div>
      )}

      {state === "ready" && (
        <div className="grid">
          {items.map((it) => {
            const isEditing = editingId === it.id;

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

                <div
                  className="swipe-content card"
                  onPointerDown={(e) => onPointerDown(e, it.id)}
                >
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
        </div>
      )}
    </AppLayout>
  );
}


