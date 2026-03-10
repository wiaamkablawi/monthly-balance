import React from "react";
import { NavLink } from "react-router-dom";
import { routes, type RouteKey } from "../app/routes";

function Icon(props: { text: string }) {
  return <div className="nav-icon">{props.text}</div>;
}

export default function BottomNav() {
  const items: Array<{ key: RouteKey; icon: string }> = [
    { key: "dashboard", icon: "ס" },
    { key: "add", icon: "+" },
    { key: "transactions", icon: "י" },
    { key: "settings", icon: "ה" },
  ];

  return (
    <nav className="bottom-nav" aria-label="ניווט תחתון">
      <div className="bottom-nav-inner">
        {items.map((item) => (
          <NavLink
            key={item.key}
            to={routes[item.key].path}
            className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
            end={item.key === "dashboard"}
          >
            <Icon text={item.icon} />
            <div className="nav-label">{routes[item.key].label}</div>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
