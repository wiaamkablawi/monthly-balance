import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

/**
 * הגדרה דרך קובץ .env (לא לשים מפתחות בקוד)
 * VITE_FIREBASE_API_KEY=...
 * VITE_FIREBASE_AUTH_DOMAIN=...
 * VITE_FIREBASE_PROJECT_ID=...
 * VITE_FIREBASE_STORAGE_BUCKET=...
 * VITE_FIREBASE_MESSAGING_SENDER_ID=...
 * VITE_FIREBASE_APP_ID=...
 */
function envOrFallback(key: string, fallback: string): string {
  const v = String(import.meta.env[key] || "").trim();
  return v || fallback;
}

const firebaseConfig = {
  apiKey: envOrFallback("VITE_FIREBASE_API_KEY", "demo-api-key"),
  authDomain: envOrFallback("VITE_FIREBASE_AUTH_DOMAIN", "demo-project.firebaseapp.com"),
  projectId: envOrFallback("VITE_FIREBASE_PROJECT_ID", "demo-project"),
  storageBucket: envOrFallback("VITE_FIREBASE_STORAGE_BUCKET", "demo-project.appspot.com"),
  messagingSenderId: envOrFallback("VITE_FIREBASE_MESSAGING_SENDER_ID", "1234567890"),
  appId: envOrFallback("VITE_FIREBASE_APP_ID", "1:1234567890:web:demo"),
};

if (!import.meta.env.VITE_FIREBASE_API_KEY) {
  console.warn("Firebase env vars are missing; using safe demo placeholders. Configure VITE_FIREBASE_* in .env for production.");
}

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
