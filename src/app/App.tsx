import React, { Suspense, lazy, useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { watchAuth } from "../services/authService";
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
  if (!props.ready) return <LoadingScreen message="טוען את המשתמש והנתונים..." />;
  if (!props.user) return <Navigate to="/login" replace />;
  return <>{props.children}</>;
}

function LoadingScreen(props: { message?: string }) {
  return (
    <div className="container" style={{ paddingTop: 32 }}>
      <div className="card">
        <div className="muted">{props.message || "טוען..."}</div>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

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
    return <LoadingScreen message="טוען את סביבת Firebase..." />;
  }

  return (
    <Suspense fallback={<LoadingScreen />}>
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
