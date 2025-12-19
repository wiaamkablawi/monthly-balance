import React from "react";
import { NavLink } from "react-router-dom";
import { routes, type RouteKey } from "../app/routes";

function Icon(props: { text: string }) {
  return <div className="nav-icon">{props.text}</div>;
}

export default function BottomNav() {
  const items: Array<{ key: RouteKey; icon: string }> = [
    { key: "dashboard", icon: "ד" },
    { key: "add", icon: "+" },
    { key: "transactions", icon: "ת" },
    { key: "settings", icon: "ה" },
  ];

  return (
    <nav className="bottom-nav" aria-label="ניווט תחתון">
      <div className="bottom-nav-inner">
        {items.map((it) => (
          <NavLink
            key={it.key}
            to={routes[it.key].path}
            className={({ isActive }) => "nav-item" + (isActive ? " active" : "")}
            end={it.key === "dashboard"}
          >
            <Icon text={it.icon} />
            <div className="nav-label">{routes[it.key].label}</div>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
