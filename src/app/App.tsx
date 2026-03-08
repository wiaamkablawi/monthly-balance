import React, { Suspense, lazy, useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { watchAuth } from "../services/authService";
import type { User } from "firebase/auth";

const DashboardPage = lazy(() => import("../pages/DashboardPage"));
const AddEntryPage = lazy(() => import("../pages/AddEntryPage"));
const TransactionsPage = lazy(() => import("../pages/TransactionsPage"));
const SettingsPage = lazy(() => import("../pages/SettingsPage"));
const LoginPage = lazy(() => import("../pages/LoginPage"));

function Protected(props: { user: User | null; children: React.ReactNode }) {
  if (!props.user) return <Navigate to="/login" replace />;
  return <>{props.children}</>;
}

function LoadingScreen() {
  return (
    <div className="container" style={{ paddingTop: 32 }}>
      <div className="card">
        <div className="muted">טוען...</div>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsub = watchAuth((u) => setUser(u));
    return () => unsub();
  }, []);

  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />

        <Route
          path="/"
          element={
            <Protected user={user}>
              <DashboardPage />
            </Protected>
          }
        />

        <Route
          path="/add"
          element={
            <Protected user={user}>
              <AddEntryPage />
            </Protected>
          }
        />

        <Route
          path="/transactions"
          element={
            <Protected user={user}>
              <TransactionsPage />
            </Protected>
          }
        />

        <Route
          path="/settings"
          element={
            <Protected user={user}>
              <SettingsPage />
            </Protected>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
