import React, { useState } from "react";
import { loginWithGoogle } from "../services/authService";
import { isFirebaseConfigured } from "../services/firebase";

export default function LoginPage() {
  const [err, setErr] = useState<string>("");

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

          <button className="btn" type="button" onClick={onGoogleLogin} disabled={!isFirebaseConfigured}>
            התחברות עם Google
          </button>

          {!isFirebaseConfigured ? (
            <div style={{ color: "#fca5a5", fontSize: 12 }}>
              התחברות מושבתת: חסרה הגדרת Firebase בסביבת ההרצה.
            </div>
          ) : null}

          <div className="muted" style={{ fontSize: 12 }}>
            ניתן להתחבר רק עם חשבונות מורשים.
          </div>
        </div>
      </div>
    </div>
  );
}
