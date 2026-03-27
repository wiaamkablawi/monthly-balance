import React, { useState } from "react";
import { loginWithGoogle } from "../services/authService";
import { getFirebaseConfigurationError, isFirebaseConfigured } from "../services/firebase";

export default function LoginPage() {
  const [err, setErr] = useState<string>("");
  const firebaseConfigurationError = getFirebaseConfigurationError();

  async function onGoogleLogin() {
    setErr("");

    try {
      await loginWithGoogle();
    } catch (ex: any) {
      setErr(ex?.message || "אירעה שגיאה בתהליך ההתחברות.");
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <section className="login-panel brand">
          <div className="eyebrow" style={{ color: "rgba(230, 222, 255, 0.82)" }}>
            Institutional Intelligence
          </div>
          <h1 className="login-title">WealthLedger</h1>
          <p className="login-copy">
            מערכת בקרה להוצאות ביתיות עם דשבורד חודשי, קליטת תנועות, ייבוא קבצים ושכבת בקרה שמתאימה לעבודה משפחתית מסודרת.
          </p>
        </section>

        <section className="login-panel">
          <div className="page-title-block">
            <div className="eyebrow">Secure Access</div>
            <h2 className="page-title">התחברות למערכת</h2>
            <p className="page-subtitle">הכניסה מתבצעת עם Google בלבד, ורק עבור משתמשים שמורשים במערכת.</p>
          </div>

          <div className="page-stack" style={{ marginTop: 24 }}>
            {err ? <div className="error-banner">{err}</div> : null}

            <button
              className="btn"
              type="button"
              onClick={onGoogleLogin}
              disabled={!isFirebaseConfigured}
              style={!isFirebaseConfigured ? { opacity: 0.55, cursor: "not-allowed" } : undefined}
              title={!isFirebaseConfigured ? "יש להגדיר VITE_FIREBASE_* בקובץ .env" : undefined}
            >
              התחברות עם Google
            </button>

            {!isFirebaseConfigured ? <div className="error-banner">{firebaseConfigurationError}</div> : null}

            {!isFirebaseConfigured ? (
              <div className="note-banner">ההתחברות מושבתת כרגע כי הגדרות Firebase לא זמינות בסביבת ההרצה.</div>
            ) : null}

            <div className="muted text-small">אם ההתחברות נכשלה למרות שיש הרשאה, בדוק שהחשבון שבחרת הוא החשבון המורשה ב-Firebase Auth.</div>
          </div>
        </section>
      </div>
    </div>
  );
}
