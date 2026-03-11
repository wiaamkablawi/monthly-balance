import { addDoc, collection, getDocs, query, where } from "firebase/firestore";
import { auth } from "./firebase";
import { db } from "./firebaseDb";
import { householdEmails, householdIdFromEmail, userKeyFromEmail } from "./authService";
import type { EntryDoc } from "../types/models";

const ENTRY_COLLECTIONS = ["records", "entries"] as const;

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

function isMonthKey(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value.trim());
}

function toEntryDoc(id: string, raw: Partial<EntryDoc>): EntryDoc {
  const normalizedDate = String(raw.date || "").trim().slice(0, 10);
  const normalizedMonthKey = isMonthKey(String(raw.monthKey || ""))
    ? String(raw.monthKey || "").trim()
    : monthFromDate(normalizedDate);

  return {
    id,
    type: (raw.type === "income" ? "income" : "expense") as EntryDoc["type"],
    subType: raw.subType,
    date: normalizedDate,
    monthKey: normalizedMonthKey,
    category: String(raw.category || "אחר"),
    description: String(raw.description || ""),
    amount: Number(raw.amount || 0),
    userKey: (raw.userKey || "W") as EntryDoc["userKey"],
    ownerUid: String(raw.ownerUid || ""),
    householdId: String(raw.householdId || ""),
    installmentsCount: raw.installmentsCount,
    installmentsTotal: raw.installmentsTotal,
    installmentIndex: raw.installmentIndex,
    installmentGroupId: raw.installmentGroupId,
    chargeDay: raw.chargeDay,
    sourceFixedId: raw.sourceFixedId,
    templateId: raw.templateId,
    importHash: raw.importHash,
    importSource: raw.importSource,
    importFingerprint: raw.importFingerprint,
    createdAt: Number(raw.createdAt || 0),
    createdBy: String(raw.createdBy || ""),
    updatedAt: raw.updatedAt,
    updatedBy: raw.updatedBy,
  };
}

export async function getAvailableMonthKeys(householdId: string, fallbackCount = 18): Promise<string[]> {
  const base = buildRecentMonthKeys(fallbackCount);
  const emails = householdEmails();

  const snaps = await Promise.all(
    ENTRY_COLLECTIONS.map(async (collectionName) => {
      const queries = [
        householdId
          ? getDocs(query(collection(db, collectionName), where("householdId", "==", householdId)))
          : Promise.resolve(null),
        emails.length
          ? getDocs(query(collection(db, collectionName), where("createdBy", "in", emails)))
          : Promise.resolve(null),
      ];

      const results = await Promise.all(queries);
      return results.filter(Boolean);
    })
  );

  const keys = new Set(base);

  snaps.flat().forEach((snap: any) => {
    snap.forEach((d: any) => {
      const data = d.data() as Partial<EntryDoc>;
      const mk = String(data.monthKey || "").trim();
      if (isMonthKey(mk)) {
        keys.add(mk);
        return;
      }

      const fromDate = monthFromDate(String(data.date || "")).trim();
      if (isMonthKey(fromDate)) {
        keys.add(fromDate);
      }
    });
  });

  return Array.from(keys).sort((a, b) => b.localeCompare(a));
}

export async function getEntriesByMonth(householdId: string, monthKey: string): Promise<EntryDoc[]> {
  const emails = householdEmails();
  const byId = new Map<string, EntryDoc>();

  for (const collectionName of ENTRY_COLLECTIONS) {
    const monthSnap = householdId
      ? await getDocs(
          query(
            collection(db, collectionName),
            where("householdId", "==", householdId),
            where("monthKey", "==", monthKey)
          )
        )
      : null;

    monthSnap?.forEach((d) => {
      const data = toEntryDoc(d.id, d.data() as Partial<EntryDoc>);
      byId.set(`${collectionName}:${d.id}`, data);
    });

    if (emails.length) {
      const createdBySnap = await getDocs(
        query(collection(db, collectionName), where("createdBy", "in", emails))
      );

      createdBySnap.forEach((d) => {
        const data = toEntryDoc(d.id, d.data() as Partial<EntryDoc>);
        if (data.monthKey !== monthKey) return;
        byId.set(`${collectionName}:${d.id}`, data);
      });
    }
  }

  return Array.from(byId.values());
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
