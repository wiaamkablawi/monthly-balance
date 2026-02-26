import React, { useEffect, useState } from "react";
import { getAuthSetupError, loginWithGoogle } from "../services/authService";

export default function LoginPage() {
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    const setupError = getAuthSetupError();
    if (setupError) {
      setErr("הגדרות Firebase אינן תקינות. בדקו את ערכי VITE_FIREBASE_*.");
    }
  }, []);

  async function onGoogleLogin() {
    setErr("");
    try {
      await loginWithGoogle();
    } catch (ex: any) {
      setErr(ex?.message || "שגיאה בהתחברות.");
    }
  }

  return (
    <div className="container" style={{ paddingTop: 48 }}>
      <div className="card">
        <h2 style={{ marginBottom: 12 }}>התחברות</h2>

        <div className="grid" style={{ gap: 10 }}>
          {err ? <div style={{ color: "#fecdd3", fontSize: 12 }}>{err}</div> : null}

          <button className="btn" type="button" onClick={onGoogleLogin}>
            התחברות עם Google
          </button>

          <div className="muted" style={{ fontSize: 12 }}>
            ניתן להתחבר רק עם חשבונות מורשים.
          </div>
        </div>
      </div>
    </div>
  );
}
