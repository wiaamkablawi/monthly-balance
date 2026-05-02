export type RouteKey = "dashboard" | "add" | "transactions" | "report" | "settings";

export const routes: Record<RouteKey, { path: string; label: string }> = {
  dashboard: { path: "/", label: "סקירה" },
  add: { path: "/add", label: "קליטה" },
  transactions: { path: "/transactions", label: "יומן" },
  report: { path: "/report", label: "דו״ח חודשי" },
  settings: { path: "/settings", label: "הגדרות" },
};
