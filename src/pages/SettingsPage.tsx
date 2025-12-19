import React from "react";
import AppLayout from "../app/layout/AppLayout";
import { logout } from "../services/authService";

export default function SettingsPage() {
  return (
    <AppLayout title="הגדרות" right={<button className="btn secondary" onClick={() => logout()}>התנתקות</button>}>
      <div className="card">
        <h2>הגדרות</h2>
        <div className="muted">בשלב הבא: ניהול הוצאות קבועות משפחתיות, ייצוא, וגיבוי.</div>
      </div>
    </AppLayout>
  );
}
