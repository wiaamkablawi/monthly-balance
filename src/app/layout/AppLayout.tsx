import React, { useEffect, useState } from "react";
import { auth } from "../../services/firebase";
import BottomNav from "../../components/BottomNav";

export default function AppLayout(props: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  const [userName, setUserName] = useState<string>("משתמש");
  const [now, setNow] = useState<Date>(new Date());

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      const email = u?.email || "";

      if (email === "k.wiaam@gmail.com") {
        setUserName("ויאאם");
      } else if (email === "boshra.kablawi@gmail.com") {
        setUserName("בושרא");
      } else {
        setUserName("משתמש");
      }
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      setNow(new Date());
    }, 60 * 1000);
    return () => clearInterval(t);
  }, []);

  function formatDateTime(d: Date) {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${min} ${dd}/${mm}/${yyyy}`;
  }

  return (
    <>
      <header
        className="header"
        style={{
          padding: "14px 0",
          borderBottom: "1px solid rgba(0,0,0,0.05)",
        }}
      >
        <div
          className="header-inner"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            alignItems: "center",
            gap: 8,
          }}
        >
          {/* ימין */}
          <div
            style={{
              textAlign: "right",
              fontSize: 14,
              fontWeight: 500,
              color: "#334155",
              whiteSpace: "nowrap",
            }}
          >
            שלום {userName}
          </div>

          {/* מרכז */}
          <div
            style={{
              textAlign: "center",
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: "0.2px",
              color: "var(--text)",
            }}
          >
            מערכת ניהול תקציב חודשית · {props.title}
          </div>

          {/* שמאל */}
          <div
            className="muted"
            style={{
              textAlign: "left",
              fontSize: 12,
              whiteSpace: "nowrap",
            }}
          >
            {formatDateTime(now)}
          </div>
        </div>
      </header>

      <main className="container">{props.children}</main>

      {props.right ? (
        <div
          style={{
            position: "fixed",
            left: 14,
            top: 84,
            zIndex: 25,
          }}
        >
          {props.right}
        </div>
      ) : null}
    </>
  );
}
