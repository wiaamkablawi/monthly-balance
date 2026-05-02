import React from "react";
import { NavLink } from "react-router-dom";
import { routes, type RouteKey } from "../app/routes";
import AppIcon from "./AppIcon";

const items: Array<{ key: RouteKey; icon: React.ComponentProps<typeof AppIcon>["name"] }> = [
  { key: "dashboard", icon: "dashboard" },
  { key: "add", icon: "plus" },
  { key: "transactions", icon: "journal" },
  { key: "settings", icon: "settings" },
];

const mobileItems: Array<{ key: RouteKey; emoji: string; label: string }> = [
  { key: "dashboard", emoji: "🏠", label: "דשבורד" },
  { key: "add", emoji: "➕", label: "הוסף" },
  { key: "transactions", emoji: "📊", label: "גרפים" },
  { key: "settings", emoji: "⚙️", label: "הגדרות" },
];

export default function BottomNav(props: { variant?: "default" | "mobile" } = {}) {
  const variant = props.variant || "default";

  if (variant === "mobile") {
    return (
      <nav className="mb-bottom-nav" aria-label="ניווט תחתון">
        <div className="mb-bottom-nav-inner">
          {mobileItems.map((item) => (
            <NavLink
              key={item.key}
              to={routes[item.key].path}
              end={item.key === "dashboard"}
              className={({ isActive }) => `mb-tab${isActive ? " active" : ""}`}
            >
              <div className="mb-tab-ico">{item.emoji}</div>
              <div className="mb-tab-lbl">{item.label}</div>
            </NavLink>
          ))}
        </div>
      </nav>
    );
  }

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
            <div className="nav-icon">
              <AppIcon name={item.icon} className="nav-icon-svg" />
            </div>
            <div className="nav-label">{routes[item.key].label}</div>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
