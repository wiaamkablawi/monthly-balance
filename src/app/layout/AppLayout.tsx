import React, { useEffect, useMemo, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import AppIcon from "../../components/AppIcon";
import BottomNav from "../../components/BottomNav";
import { routes, type RouteKey } from "../routes";
import { displayNameFromEmail, logout } from "../../services/authService";
import { auth } from "../../services/firebase";
import { APP_BUILD } from "../buildInfo";

function formatDateTime(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} | ${hours}:${minutes}`;
}

const navItems: Array<{ key: RouteKey; icon: React.ComponentProps<typeof AppIcon>["name"] }> = [
  { key: "dashboard", icon: "dashboard" },
  { key: "add", icon: "plus" },
  { key: "transactions", icon: "journal" },
  { key: "report", icon: "report" },
  { key: "settings", icon: "settings" },
];

export default function AppLayout(props: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [userName, setUserName] = useState<string>(() => {
    const user = auth.currentUser;
    if (!user) return "משתמש";
    return user.displayName?.trim() || displayNameFromEmail(user.email || "") || "משתמש";
  });
  const [now, setNow] = useState<Date>(new Date());

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      const email = user?.email || "";
      const displayName = user?.displayName?.trim();
      setUserName(displayName || displayNameFromEmail(email) || "משתמש");
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const userInitial = useMemo(() => userName.trim().charAt(0) || "U", [userName]);

  return (
    <div className="app-frame">
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">
            <AppIcon name="dashboard" className="brand-mark-icon" />
          </div>
          <div>
            <div className="brand-name">WealthLedger</div>
            <div className="brand-subtitle">Institutional Intelligence</div>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="ניווט ראשי">
          {navItems.map((item) => (
            <NavLink
              key={item.key}
              to={routes[item.key].path}
              end={item.key === "dashboard"}
              className={({ isActive }) => `sidebar-nav-item${isActive ? " active" : ""}`}
            >
              <span className="sidebar-icon">
                <AppIcon name={item.icon} className="sidebar-icon-svg" />
              </span>
              <span>{routes[item.key].label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <Link className="btn sidebar-primary-action" to={routes.add.path}>
            <AppIcon name="plus" className="btn-icon" />
            הוספת תנועה
          </Link>

          <div className="sidebar-link-stack">
            <Link className="sidebar-link" to={routes.settings.path}>
              <AppIcon name="help" className="sidebar-link-icon" />
              תמיכה והגדרות
            </Link>
            <button className="sidebar-link" type="button" onClick={() => logout()}>
              <AppIcon name="logout" className="sidebar-link-icon" />
              התנתקות
            </button>
          </div>
        </div>
      </aside>

      <div className="app-shell">
        <header className="app-topbar">
          <div className="topbar-search" aria-hidden="true">
            <AppIcon name="search" className="topbar-search-icon" />
            <span>חפש תנועות או קטגוריות...</span>
          </div>

          <div className="topbar-actions">
            <button className="topbar-icon" type="button" aria-label="התראות">
              <AppIcon name="bell" className="topbar-icon-svg" />
              <span className="topbar-dot" />
            </button>
            <button className="topbar-icon" type="button" aria-label="עזרה">
              <AppIcon name="help" className="topbar-icon-svg" />
            </button>
            <div className="topbar-user">
              <div className="avatar-badge">{userInitial}</div>
              <div className="topbar-user-copy">
                <strong>{userName}</strong>
                <span>{formatDateTime(now)}</span>
              </div>
            </div>
          </div>
        </header>

        <main className="container page-shell">
          <section className="page-head">
            <div className="page-title-block">
              <div className="eyebrow">Household Financial Control</div>
              <h1 className="page-title">{props.title}</h1>
              {props.subtitle ? <p className="page-subtitle">{props.subtitle}</p> : null}
            </div>

            <div className="page-head-actions">
              <div className="header-chip subtle">build {APP_BUILD}</div>
              {props.right ? <div className="header-actions">{props.right}</div> : null}
            </div>
          </section>

          {props.children}
        </main>

        <BottomNav />
      </div>
    </div>
  );
}
