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

export default function BottomNav() {
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
