import {
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  type User,
} from "firebase/auth";
import { auth, isFirebaseConfigured } from "./firebase";

export const ALLOWED_EMAIL_LIST: readonly string[] = [
  "k.wiaam@gmail.com",
  "boshra.kablawi@gmail.com",
];

const ALLOWED_EMAILS = new Set<string>(ALLOWED_EMAIL_LIST);
const HOUSEHOLD_ID = "household_wb";

const googleProvider = new GoogleAuthProvider();

export function watchAuth(cb: (u: User | null) => void): () => void {
  return onAuthStateChanged(auth, async (u) => {
    const email = (u?.email || "").toLowerCase();

    if (u && !ALLOWED_EMAILS.has(email)) {
      await signOut(auth);
      cb(null);
      return;
    }

    cb(u);
  });
}

export async function loginWithGoogle(): Promise<void> {
  if (!isFirebaseConfigured) {
    throw new Error("Google login is unavailable until VITE_FIREBASE_* variables are configured.");
  }

  const result = await signInWithPopup(auth, googleProvider);
  const email = (result.user.email || "").toLowerCase();

  if (!ALLOWED_EMAILS.has(email)) {
    await signOut(auth);
    throw new Error("This account is not authorized to access the system.");
  }
}

export async function logout(): Promise<void> {
  await signOut(auth);
}

export function isAllowedEmail(email?: string | null): boolean {
  return ALLOWED_EMAILS.has((email || "").toLowerCase());
}

export function householdIdFromEmail(email?: string | null): string {
  return isAllowedEmail(email) ? HOUSEHOLD_ID : "forbidden";
}

export function userKeyFromEmail(email?: string | null): "W" | "B" {
  const e = (email || "").toLowerCase();
  return e.startsWith("boshra.") ? "B" : "W";
}