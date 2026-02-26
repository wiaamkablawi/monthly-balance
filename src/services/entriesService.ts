import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { getFirebaseAuth, getFirebaseDb } from "./firebase";
import { userKeyFromEmail } from "./authService";
import type { EntryDoc } from "../types/models";

function monthFromDate(date: string): string {
  // מצפה לפורמט YYYY-MM-DD
  if (!date || date.length < 7) return new Date().toISOString().slice(0, 7);
  return date.slice(0, 7);
}

export async function addEntry(doc: Omit<EntryDoc, "id">): Promise<string> {
  const email = getFirebaseAuth().currentUser?.email?.toLowerCase() || "";

  const payload: Omit<EntryDoc, "id"> = {
    ...doc,
   createdBy: (doc as any).createdBy || email,
userKey: doc.userKey || userKeyFromEmail(((doc as any).createdBy || email) as string),

    month: (doc as any).month || monthFromDate((doc as any).date || ""),
    createdAt: (doc as any).createdAt || serverTimestamp(),
  } as any;

  const ref = await addDoc(collection(getFirebaseDb(), "records"), payload);
  return ref.id;
}
