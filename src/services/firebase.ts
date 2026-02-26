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
const envConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};

const hasFirebaseEnv = Object.values(envConfig).every((v) => Boolean(v && String(v).trim()));

export const firebaseEnvWarning = hasFirebaseEnv
  ? ""
  : "המערכת רצה במצב הדגמה: חסרים משתני Firebase (.env). התחברות ושמירה לענן לא יהיו זמינות.";

const firebaseConfig = {
  apiKey: envConfig.apiKey || "AIzaSyDemoKey00000000000000000000000",
  authDomain: envConfig.authDomain || "demo-project.firebaseapp.com",
  projectId: envConfig.projectId || "demo-project",
  storageBucket: envConfig.storageBucket || "demo-project.appspot.com",
  messagingSenderId: envConfig.messagingSenderId || "000000000000",
  appId: envConfig.appId || "1:000000000000:web:demo000000000000",
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
