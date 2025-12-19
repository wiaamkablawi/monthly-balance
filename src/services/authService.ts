import {
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  type User,
} from "firebase/auth";
import { auth } from "./firebase";

const ALLOWED_EMAILS = new Set([
  "k.wiaam@gmail.com",
  "boshra.kablawi@gmail.com",
]);

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
  const result = await signInWithPopup(auth, googleProvider);
  const email = (result.user.email || "").toLowerCase();

  if (!ALLOWED_EMAILS.has(email)) {
    await signOut(auth);
    throw new Error("החשבון אינו מורשה להתחברות למערכת.");
  }
}

export async function logout(): Promise<void> {
  await signOut(auth);
}

export function userKeyFromEmail(email?: string | null): "W" | "B" {
  const e = (email || "").toLowerCase();
  return e.startsWith("boshra.") ? "B" : "W";
}
