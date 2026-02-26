export type ThemeMode = "light" | "dark" | "auto";

export type UserPreferences = {
  theme: ThemeMode;
  compactMode: boolean;
  highlightLargeExpenses: boolean;
};

const STORAGE_KEY = "monthly_balance_preferences_v1";

export const defaultPreferences: UserPreferences = {
  theme: "auto",
  compactMode: false,
  highlightLargeExpenses: true,
};

export function loadPreferences(): UserPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultPreferences;

    const parsed = JSON.parse(raw);
    return {
      theme:
        parsed?.theme === "light" || parsed?.theme === "dark" || parsed?.theme === "auto"
          ? parsed.theme
          : defaultPreferences.theme,
      compactMode: Boolean(parsed?.compactMode),
      highlightLargeExpenses:
        parsed?.highlightLargeExpenses === undefined
          ? defaultPreferences.highlightLargeExpenses
          : Boolean(parsed.highlightLargeExpenses),
    };
  } catch {
    return defaultPreferences;
  }
}

export function savePreferences(prefs: UserPreferences): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export function applyPreferencesToDocument(prefs: UserPreferences): void {
  const root = document.documentElement;

  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
  const resolvedTheme = prefs.theme === "auto" ? (prefersDark ? "dark" : "light") : prefs.theme;

  root.dataset.theme = resolvedTheme;
  root.classList.toggle("compact-mode", prefs.compactMode);
  root.classList.toggle("highlight-large-expenses", prefs.highlightLargeExpenses);
}

