import React, { Suspense, lazy, useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { watchAuth, getCachedAuthEmail, isAllowedEmail } from "../services/authService";
import type { User } from "firebase/auth";
import { APP_BUILD } from "./buildInfo";

function formatBuildVersion(value: string): string {
  const dotMatch = value.match(/^(\d{4})\.(\d{2})\.(\d{2})-(\d{2})(\d{2})$/);
  if (dotMatch) {
    return `${dotMatch[1]}-${dotMatch[2]}-${dotMatch[3]} ${dotMatch[4]}:${dotMatch[5]}:00`;
  }

  const isoMatch = value.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]} ${isoMatch[2]}`;
  }

  return value;
}

const BUILD_VERSION = formatBuildVersion(new Date().toISOString());

const DashboardPage = lazy(() => import("../pages/DashboardPage"));
const AddEntryPage = lazy(() => import("../pages/AddEntryPage"));
const TransactionsPage = lazy(() => import("../pages/TransactionsPage"));
const MonthlyReportPage = lazy(() => import("../pages/MonthlyReportPage"));
const SettingsPage = lazy(() => import("../pages/SettingsPage"));
const LoginPage = lazy(() => import("../pages/LoginPage"));

declare global {
  interface Window {
    __MONTHLY_BALANCE_BUILD__?: string;
    __MONTHLY_BALANCE_BUILD_LOGGED__?: boolean;
    __MONTHLY_BALANCE_LAST_AUTH_LOG__?: string;
  }
}

function Protected(props: { ready: boolean; user: User | null; children: React.ReactNode }) {
  if (!props.ready) return <SplashScreen />;
  if (!props.user) return <Navigate to="/login" replace />;
  return <>{props.children}</>;
}

// Splash / skeleton keyframes live in globals.css (mbSplashPulse, mbSkel)
const splashWrapStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: [
    "radial-gradient(ellipse 600px 400px at 10% 0%, rgba(0,229,255,0.06) 0%, transparent 60%)",
    "radial-gradient(ellipse 500px 350px at 90% 80%, rgba(168,85,247,0.07) 0%, transparent 60%)",
    "#060B14",
  ].join(", "),
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 32,
  direction: "rtl",
  fontFamily: "Rubik, Heebo, system-ui, sans-serif",
};

function SkelCard({ height, radius, delay = "0s" }: { height: number; radius: number; delay?: string }) {
  const s: React.CSSProperties = {
    height,
    borderRadius: radius,
    background: "linear-gradient(90deg,rgba(255,255,255,0.04) 25%,rgba(255,255,255,0.08) 50%,rgba(255,255,255,0.04) 75%)",
    backgroundSize: "600px 100%",
    animation: "mbSkel 1.5s " + delay + " infinite linear",
    border: "1px solid rgba(0,229,255,0.07)",
  };
  return React.createElement("div", { style: s });
}

function SplashScreen() {
  return (
    <div style={splashWrapStyle}>
      <div style={{ position: "relative", width: 72, height: 72 }}>
        <div style={{
          position: "absolute", inset: -10, borderRadius: "50%",
          border: "1.5px solid rgba(0,229,255,0.25)",
          animation: "mbSplashPulse 1.8s ease-out infinite",
        }} />
        <div style={{
          width: 72, height: 72, borderRadius: "50%",
          background: "linear-gradient(135deg,rgba(0,229,255,0.15),rgba(168,85,247,0.2))",
          border: "1px solid rgba(0,229,255,0.3)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 28,
          boxShadow: "0 0 32px rgba(0,229,255,0.2),inset 0 0 20px rgba(0,229,255,0.05)",
        }}>
          {"💳"}
        </div>
      </div>
      <div style={{ width: "min(340px,90vw)", display: "flex", flexDirection: "column", gap: 10 }}>
        <SkelCard height={130} radius={24} />
        <div style={{ display: "flex", gap: 8 }}>
          <SkelCard height={64} radius={16} delay="0.1s" />
          <SkelCard height={64} radius={16} delay="0.2s" />
          <SkelCard height={64} radius={16} delay="0.3s" />
        </div>
        <SkelCard height={110} radius={20} delay="0.15s" />
      </div>
    </div>
  );
}

function hasCachedSession(): boolean {
  const email = getCachedAuthEmail();
  return !!email && isAllowedEmail(email);
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(() => hasCachedSession());

  useEffect(() => {
    window.__MONTHLY_BALANCE_BUILD__ = BUILD_VERSION;

    if (!window.__MONTHLY_BALANCE_BUILD_LOGGED__) {
      console.info(`[monthly-balance] build: ${BUILD_VERSION}`);
      window.__MONTHLY_BALANCE_BUILD_LOGGED__ = true;
    }
  }, []);

  useEffect(() => {
    const unsubscribe = watchAuth((nextUser) => {
      setUser(nextUser);
      setAuthReady(true);

      const authLogKey = `${nextUser?.uid || "null"}:${APP_BUILD}`;
      if (window.__MONTHLY_BALANCE_LAST_AUTH_LOG__ !== authLogKey) {
        console.info(`[monthly-balance] auth ${APP_BUILD}`, {
          email: nextUser?.email || null,
          ready: true,
        });
        window.__MONTHLY_BALANCE_LAST_AUTH_LOG__ = authLogKey;
      }
    });

    return () => unsubscribe();
  }, []);

  if (!authReady) {
    return <SplashScreen />;
  }

  return (
    <Suspense fallback={<SplashScreen />}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />

        <Route
          path="/"
          element={
            <Protected ready={authReady} user={user}>
              <DashboardPage />
            </Protected>
          }
        />

        <Route
          path="/add"
          element={
            <Protected ready={authReady} user={user}>
              <AddEntryPage />
            </Protected>
          }
        />

        <Route
          path="/transactions"
          element={
            <Protected ready={authReady} user={user}>
              <TransactionsPage />
            </Protected>
          }
        />

        <Route
          path="/report"
          element={
            <Protected ready={authReady} user={user}>
              <MonthlyReportPage />
            </Protected>
          }
        />

        <Route
          path="/settings"
          element={
            <Protected ready={authReady} user={user}>
              <SettingsPage />
            </Protected>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
