import React, { useState } from "react";
import { loginWithGoogle } from "../services/authService";
import { firebaseEnvWarning } from "../services/firebase";

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
      <div className="card login-card">
        <h2 style={{ marginBottom: 12 }}>התחברות</h2>

        <div className="grid" style={{ gap: 10 }}>
          {err ? <div className="auth-message auth-message-error">{err}</div> : null}

          {firebaseEnvWarning ? (
            <div className="auth-message auth-message-warning">{firebaseEnvWarning}</div>
          ) : null}

          <button className="btn" type="button" onClick={onGoogleLogin} disabled={Boolean(firebaseEnvWarning)}>
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
