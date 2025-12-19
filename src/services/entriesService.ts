import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth } from "./firebase";
import { db } from "./firebase";
import { userKeyFromEmail } from "./authService";
import type { EntryDoc } from "../types/models";

function monthFromDate(date: string): string {
  // מצפה לפורמט YYYY-MM-DD
  if (!date || date.length < 7) return new Date().toISOString().slice(0, 7);
  return date.slice(0, 7);
}

export async function addEntry(doc: Omit<EntryDoc, "id">): Promise<string> {
  const email = auth.currentUser?.email?.toLowerCase() || "";

  const payload: Omit<EntryDoc, "id"> = {
    ...doc,
    userEmail: doc.userEmail || email,
    userKey: doc.userKey || userKeyFromEmail(doc.userEmail || email),
    month: (doc as any).month || monthFromDate((doc as any).date || ""),
    createdAt: (doc as any).createdAt || serverTimestamp(),
  } as any;

  const ref = await addDoc(collection(db, "records"), payload);
  return ref.id;
}
