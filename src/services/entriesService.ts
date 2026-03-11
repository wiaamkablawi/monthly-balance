import { addDoc, collection, getDocs, query, where } from "firebase/firestore";
import { auth } from "./firebase";
import { db } from "./firebaseDb";
import { householdIdFromEmail, userKeyFromEmail } from "./authService";
import type { EntryDoc } from "../types/models";

function monthFromDate(date: string): string {
  if (!date || date.length < 7) return new Date().toISOString().slice(0, 7);
  return date.slice(0, 7);
}

function buildRecentMonthKeys(count: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export async function getAvailableMonthKeys(householdId: string, fallbackCount = 18): Promise<string[]> {
  const base = buildRecentMonthKeys(fallbackCount);
  if (!householdId) return base;

  const q = query(collection(db, "records"), where("householdId", "==", householdId));
  const snap = await getDocs(q);

  const keys = new Set(base);
  snap.forEach((d) => {
    const data = d.data() as Partial<EntryDoc>;
    const mk = String(data.monthKey || "").trim();
    if (/^\d{4}-\d{2}$/.test(mk)) {
      keys.add(mk);
      return;
    }

    const fromDate = monthFromDate(String(data.date || "")).trim();
    if (/^\d{4}-\d{2}$/.test(fromDate)) {
      keys.add(fromDate);
    }
  });

  return Array.from(keys).sort((a, b) => b.localeCompare(a));
}

export async function addEntry(doc: Omit<EntryDoc, "id">): Promise<string> {
  const user = auth.currentUser;
  const email = user?.email?.toLowerCase() || "";

  const payload: Omit<EntryDoc, "id"> = {
    ...doc,
    createdBy: doc.createdBy || email,
    ownerUid: doc.ownerUid || user?.uid || "",
    householdId: doc.householdId || householdIdFromEmail(email),
    userKey: doc.userKey || userKeyFromEmail(doc.createdBy || email),
    monthKey: doc.monthKey || monthFromDate(doc.date || ""),
    createdAt: doc.createdAt || Date.now(),
  };

  const ref = await addDoc(collection(db, "records"), payload);
  return ref.id;
}
