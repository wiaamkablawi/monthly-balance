export type RouteKey = "dashboard" | "add" | "transactions" | "settings";

export const routes: Record<RouteKey, { path: string; label: string }> = {
  dashboard: { path: "/", label: "סקירה" },
  add: { path: "/add", label: "קליטה" },
  transactions: { path: "/transactions", label: "יומן" },
  settings: { path: "/settings", label: "הגדרות" },
};
