import React, { useEffect, useState } from "react";
import AppLayout from "../app/layout/AppLayout";
import { logout } from "../services/authService";
import {
  applyPreferencesToDocument,
  loadPreferences,
  savePreferences,
  type ThemeMode,
  type UserPreferences,
} from "../utils/preferences";

export default function SettingsPage() {
  const [prefs, setPrefs] = useState<UserPreferences>(loadPreferences());

  useEffect(() => {
    applyPreferencesToDocument(prefs);
    savePreferences(prefs);
  }, [prefs]);

  function setTheme(theme: ThemeMode) {
    setPrefs((prev) => ({ ...prev, theme }));
  }

  return (
    <AppLayout title="הגדרות" right={<button className="btn secondary" onClick={() => logout()}>התנתקות</button>}>
      <div className="card">
        <h2>הגדרות</h2>

        <div className="grid" style={{ gap: 14 }}>
          <div>
            <label>ערכת נושא</label>
            <div className="row" style={{ marginTop: 8 }}>
              <button className={"btn secondary" + (prefs.theme === "light" ? " is-selected" : "")} onClick={() => setTheme("light")}>בהיר</button>
              <button className={"btn secondary" + (prefs.theme === "dark" ? " is-selected" : "")} onClick={() => setTheme("dark")}>כהה</button>
              <button className={"btn secondary" + (prefs.theme === "auto" ? " is-selected" : "")} onClick={() => setTheme("auto")}>אוטומטי</button>
            </div>
          </div>

          <label className="settings-check">
            <input
              type="checkbox"
              checked={prefs.compactMode}
              onChange={(e) => setPrefs((prev) => ({ ...prev, compactMode: e.target.checked }))}
            />
            מצב קומפקטי (יותר מידע בפחות גלילה)
          </label>

          <label className="settings-check">
            <input
              type="checkbox"
              checked={prefs.highlightLargeExpenses}
              onChange={(e) =>
                setPrefs((prev) => ({ ...prev, highlightLargeExpenses: e.target.checked }))
              }
            />
            הדגשת הוצאות גבוהות (מעל 1,000 ₪)
          </label>
        </div>

        <div className="muted" style={{ marginTop: 12 }}>
          שלב הבא מומלץ: התראות תקציב, חוקים אוטומטיים לקטגוריות, ייצוא מתקדם וגיבוי.
        </div>
      </div>
    </AppLayout>
  );
}
