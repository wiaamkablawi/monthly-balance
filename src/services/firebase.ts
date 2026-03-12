import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";

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

const requiredFirebaseEnvKeys = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
] as const;

export const missingFirebaseEnvKeys = requiredFirebaseEnvKeys.filter(
  (key) => String(import.meta.env[key] || "").trim().length === 0
);

export const isFirebaseConfigured = requiredFirebaseEnvKeys.every(
  (key) => String(import.meta.env[key] || "").trim().length > 0
);

export function getFirebaseConfigurationError(): string {
  if (!missingFirebaseEnvKeys.length) return "";
  return `Firebase is not configured. Missing: ${missingFirebaseEnvKeys.join(", ")}`;
}

const firebaseConfig = {
  apiKey: envOrFallback("VITE_FIREBASE_API_KEY", "demo-api-key"),
  authDomain: envOrFallback("VITE_FIREBASE_AUTH_DOMAIN", "demo-project.firebaseapp.com"),
  projectId: envOrFallback("VITE_FIREBASE_PROJECT_ID", "demo-project"),
  storageBucket: envOrFallback("VITE_FIREBASE_STORAGE_BUCKET", "demo-project.appspot.com"),
  messagingSenderId: envOrFallback("VITE_FIREBASE_MESSAGING_SENDER_ID", "1234567890"),
  appId: envOrFallback("VITE_FIREBASE_APP_ID", "1:1234567890:web:demo"),
};


export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);



