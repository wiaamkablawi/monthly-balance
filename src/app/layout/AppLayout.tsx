import React, { useEffect, useState } from "react";
import BottomNav from "../../components/BottomNav";
import { APP_BUILD } from "../buildInfo";
import { auth } from "../../services/firebase";

function displayNameFromEmail(email: string): string {
  const normalized = email.toLowerCase();
  if (normalized === "k.wiaam@gmail.com") return "ויאם";
  if (normalized === "boshra.kablawi@gmail.com") return "בושרא";
  return email.split("@")[0] || "משתמש";
}

function formatDateTime(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes} · ${day}/${month}/${year}`;
}

export default function AppLayout(props: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [userName, setUserName] = useState<string>("משתמש");
  const [now, setNow] = useState<Date>(new Date());

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      const email = user?.email || "";
      const displayName = user?.displayName?.trim();
      setUserName(displayName || displayNameFromEmail(email));
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <>
      <header className="app-header">
        <div className="app-header-inner">
          <div className="app-title-block">
            <div className="app-eyebrow">Expense Control</div>
            <h1 className="app-title">{props.title}</h1>
            {props.subtitle ? <div className="app-subtitle">{props.subtitle}</div> : null}
          </div>

          <div className="app-header-meta">
            <div className="header-chip">{userName}</div>
            <div className="header-chip subtle">{formatDateTime(now)}</div>
            <div className="header-chip subtle">build {APP_BUILD}</div>
            {props.right ? <div className="header-actions">{props.right}</div> : null}
          </div>
        </div>
      </header>

      <main className="container page-shell">{props.children}</main>

      <BottomNav />
    </>
  );
}