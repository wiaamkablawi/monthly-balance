export type RouteKey = "dashboard" | "add" | "transactions" | "settings";

export const routes: Record<RouteKey, { path: string; label: string }> = {
  dashboard: { path: "/", label: "דשבורד" },
  add: { path: "/add", label: "הוספה" },
  transactions: { path: "/transactions", label: "תנועות" },
  settings: { path: "/settings", label: "הגדרות" },
};
