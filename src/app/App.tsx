import React, { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import DashboardPage from "../pages/DashboardPage";
import AddEntryPage from "../pages/AddEntryPage";
import TransactionsPage from "../pages/TransactionsPage";
import SettingsPage from "../pages/SettingsPage";
import LoginPage from "../pages/LoginPage";
import { watchAuth } from "../services/authService";
import type { User } from "firebase/auth";

function Protected(props: { user: User | null; children: React.ReactNode }) {
  if (!props.user) return <Navigate to="/login" replace />;
  return <>{props.children}</>;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsub = watchAuth((u) => setUser(u));
    return () => unsub();
  }, []);

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/" replace /> : <LoginPage />}
      />

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
  );
}
