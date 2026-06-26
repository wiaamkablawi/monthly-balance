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

// ── Auth-state cache (localStorage) for instant render ─────────────────────
const CACHED_AUTH_KEY = "mb_auth_v1";

export function getCachedAuthEmail(): string | null {
  try {
    return localStorage.getItem(CACHED_AUTH_KEY);
  } catch {
    return null;
  }
}

function persistAuthEmail(email: string | null): void {
  try {
    if (email) localStorage.setItem(CACHED_AUTH_KEY, email);
    else localStorage.removeItem(CACHED_AUTH_KEY);
  } catch { /* ignore */ }
}


export function watchAuth(cb: (u: User | null) => void): () => void {
  return onAuthStateChanged(auth, async (u) => {
    const email = (u?.email || "").toLowerCase();

    if (u && !ALLOWED_EMAILS.has(email)) {
      await signOut(auth);
      persistAuthEmail(null);
      cb(null);
      return;
    }

    persistAuthEmail(u ? (u.email || '').toLowerCase() : null);
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

export function displayNameFromEmail(email?: string | null): string {
  const normalized = (email || "").trim().toLowerCase();
  if (normalized === "k.wiaam@gmail.com") return "ויאם";
  if (normalized === "boshra.kablawi@gmail.com") return "בושרא";
  return normalized.split("@")[0] || "משתמש";
}
