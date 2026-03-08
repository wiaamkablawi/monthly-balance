import React, { useEffect, useRef, useState } from "react";
import AppLayout from "../app/layout/AppLayout";
import { currentMonthKey, monthKeyFromISO } from "../utils/dates";
import { formatILS } from "../utils/money";
import { auth } from "../services/firebase";
import { db } from "../services/firebaseDb";
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
  const [monthKey, setMonthKey] = useState(currentMonthKey());
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
          setErr(e.message || "׳©׳’׳™׳׳” ׳‘׳˜׳¢׳™׳ ׳”");
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
      category: editCategory,
      description: editDescription,
      amount: Number(editAmount),
      updatedAt: Date.now(),
    });

    setEditingId(null);
  }

  async function onDelete(it: EntryDoc) {
    if (!window.confirm("׳׳׳—׳•׳§ ׳׳× ׳”׳×׳ ׳•׳¢׳”?")) return;
    await deleteDoc(doc(db, "records", it.id));
    setItems((prev) => prev.filter((x) => x.id !== it.id));
  }

  /* =========================
     Swipe logic ג€“ FIXED
  ========================= */
 function onPointerDown(e: React.PointerEvent, id: string) {
  const row = (e.currentTarget as HTMLElement).closest(
    ".swipe-row"
  ) as HTMLElement | null;
  if (!row) return;

  const contentEl = row.querySelector(".swipe-content");
  if (!(contentEl instanceof HTMLElement)) return;

  const content = contentEl; // ׳׳¢׳›׳©׳™׳• non-null ׳•-type-safe

  // ׳¡׳’׳™׳¨׳× swipe ׳₪׳×׳•׳— ׳§׳•׳“׳
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
    <AppLayout title="׳×׳ ׳•׳¢׳•׳×">
      <div className="card">
        <label>׳—׳•׳“׳©</label>
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
                    ׳¢׳¨׳•׳
                  </button>
                  <button
                    className="swipe-btn delete"
                    onClick={() => onDelete(it)}
                  >
                    ׳׳—׳§
                  </button>
                </div>

                <div
                  className="swipe-content card"
                  onPointerDown={(e) => onPointerDown(e, it.id)}
                >
                  <div className="txn-title">
                    {formatILS(it.amount)} ג€“{" "}
                    {it.category || "׳׳׳ ׳§׳˜׳’׳•׳¨׳™׳”"}
                  </div>
                  <div className="txn-sub">
                    {it.description || "׳׳׳ ׳×׳™׳׳•׳¨"}
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
                        ׳©׳׳•׳¨
                      </button>
                      <button
                        className="btn secondary"
                        onClick={cancelEdit}
                      >
                        ׳‘׳˜׳
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



