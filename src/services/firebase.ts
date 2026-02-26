import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
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
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
};

const requiredKeys: Array<keyof typeof firebaseConfig> = [
  "apiKey",
  "authDomain",
  "projectId",
  "storageBucket",
  "messagingSenderId",
  "appId",
];

let firebaseApp: FirebaseApp | null = null;
let firebaseInitError: string | null = null;

export function isFirebaseConfigured(): boolean {
  return requiredKeys.every((key) => {
    const value = firebaseConfig[key];
    return typeof value === "string" && value.trim().length > 0;
  });
}

function ensureFirebaseApp(): FirebaseApp {
  if (firebaseApp) return firebaseApp;

  if (!isFirebaseConfigured()) {
    firebaseInitError = "Firebase config is missing. Please set all VITE_FIREBASE_* environment variables.";
    throw new Error(firebaseInitError);
  }

  try {
    firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
    return firebaseApp;
  } catch {
    firebaseInitError = "Firebase failed to initialize. Verify your Firebase web config (especially VITE_FIREBASE_API_KEY).";
    throw new Error(firebaseInitError);
  }
}

export function getFirebaseInitError(): string | null {
  return firebaseInitError;
}

export function getFirebaseAuth() {
  return getAuth(ensureFirebaseApp());
}

export function getFirebaseDb() {
  return getFirestore(ensureFirebaseApp());
}

export function getFirebaseStorage() {
  return getStorage(ensureFirebaseApp());
}
