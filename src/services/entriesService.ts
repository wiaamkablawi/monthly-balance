import { addDoc, collection } from "firebase/firestore";
import { auth } from "./firebase";
import { db } from "./firebaseDb";
import { householdIdFromEmail, userKeyFromEmail } from "./authService";
import type { EntryDoc } from "../types/models";

function monthFromDate(date: string): string {
  if (!date || date.length < 7) return new Date().toISOString().slice(0, 7);
  return date.slice(0, 7);
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


