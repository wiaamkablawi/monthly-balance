import {
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  type User,
} from "firebase/auth";
import { getFirebaseAuth, getFirebaseInitError, isFirebaseConfigured } from "./firebase";

const ALLOWED_EMAILS = new Set([
  "k.wiaam@gmail.com",
  "boshra.kablawi@gmail.com",
]);

const googleProvider = new GoogleAuthProvider();

export function watchAuth(cb: (u: User | null) => void): () => void {
  if (!isFirebaseConfigured()) {
    cb(null);
    return () => undefined;
  }

  let auth;
  try {
    auth = getFirebaseAuth();
  } catch {
    cb(null);
    return () => undefined;
  }

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
  if (!isFirebaseConfigured()) {
    throw new Error("חסרה הגדרת Firebase בקובץ הסביבה (.env). יש להגדיר VITE_FIREBASE_*.");
  }

  let auth;
  try {
    auth = getFirebaseAuth();
  } catch {
    throw new Error("הגדרות Firebase אינן תקינות (API key או פרטים אחרים שגויים).");
  }
  const result = await signInWithPopup(auth, googleProvider);
  const email = (result.user.email || "").toLowerCase();

  if (!ALLOWED_EMAILS.has(email)) {
    await signOut(auth);
    throw new Error("החשבון אינו מורשה להתחברות למערכת.");
  }
}

export async function logout(): Promise<void> {
  const auth = getFirebaseAuth();
  await signOut(auth);
}

export function getAuthSetupError(): string | null {
  if (!isFirebaseConfigured()) {
    return "Firebase config is missing.";
  }

  return getFirebaseInitError();
}

export function userKeyFromEmail(email?: string | null): "W" | "B" {
  const e = (email || "").toLowerCase();
  return e.startsWith("boshra.") ? "B" : "W";
}
