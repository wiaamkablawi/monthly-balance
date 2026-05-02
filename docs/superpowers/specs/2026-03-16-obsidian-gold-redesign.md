# Obsidian Gold — Redesign Spec
**Date:** 2026-03-16
**Approach:** CSS + targeted JSX fixes
**Scope:** Visual/design only — zero functional changes

---

## Goals

Transform the app from its current teal glassmorphism into a luxury dark "Obsidian Gold" aesthetic, on par with premium fintech products (Revolut, Bloomberg, private banking apps). Fix structural visual clutter on the Dashboard without touching any business logic.

## Hard Constraints

- **OCR flow is untouchable** — `imageOcrService.ts` and `ImportEntriesModal.tsx`: change only CSS classes/inline colors — never touch logic, state, handlers, or flow.
- No functional regressions — all existing features must work identically.
- RTL Hebrew layout must remain intact.

---

## Color Palette

Replace the entire `:root` block in `globals.css`. Remove all old variables (`--primary`, `--primary-strong`, `--accent`, `--panel`, `--card`, `--bg-strong`, `--line`, `--neutral-soft` old value, etc.) and replace with:

| Variable | Value | Usage |
|----------|-------|-------|
| `--bg` | `#07080d` | Page background |
| `--bg-elevated` | `#0f1117` | Cards and panels (`.card`, `.card-shell`, `.modal-card`) |
| `--surface` | `#161820` | Row surfaces (`.activity-row`, `.ledger-row`, `.import-row`) |
| `--border` | `rgba(255,255,255,0.07)` | Default borders |
| `--border-gold` | `rgba(201,168,76,0.22)` | Gold accent borders |
| `--text` | `#f0ebe0` | Primary text (warm white) |
| `--muted` | `#a89e8c` | Secondary/muted text (~5.1:1 contrast on `#07080d` — passes WCAG AA with margin) |
| `--gold` | `#c9a84c` | Primary accent — CTAs, key values |
| `--gold-soft` | `rgba(201,168,76,0.12)` | Hover/active backgrounds |
| `--line` | `rgba(255,255,255,0.07)` | Alias for --border (keeps existing class references working) |
| `--income` | `#4ade80` | Income amounts |
| `--fixed` | `#c9a84c` | Fixed expense amounts (gold) |
| `--variable` | `#f87171` | Variable expense amounts |
| `--danger` | `#ef4444` | Errors and negative balance |
| `--danger-soft` | `rgba(239,68,68,0.12)` | Error backgrounds |
| `--success` | `#4ade80` | Success states |
| `--success-soft` | `rgba(74,222,128,0.1)` | Success backgrounds |
| `--warning-soft` | `rgba(201,168,76,0.12)` | Warning backgrounds |
| `--neutral-soft` | `rgba(255,255,255,0.06)` | Neutral tag backgrounds |
| `--shadow-lg` | `0 32px 80px rgba(0,0,0,0.65)` | Large shadow |
| `--shadow-md` | `0 16px 48px rgba(0,0,0,0.5)` | Medium shadow |
| `--shadow-sm` | `0 6px 20px rgba(0,0,0,0.4)` | Small shadow |

**Background:** Replace radial-gradient body with: `linear-gradient(180deg, #07080d, #09090f)`.

**Font:** Keep Heebo — no change.

**Border-radius variables:** Keep all `--radius-*` values unchanged.

---

## Component Changes

### 1. globals.css — Full Palette + Dark Theme

After replacing `:root`, update all component classes:

**Layout:**
- `body`: dark gradient bg (see above), `color: var(--text)`
- `.app-header`: `background: rgba(7,8,13,0.85)`, `backdrop-filter: blur(20px)`, `border-bottom: 1px solid rgba(201,168,76,0.12)`
- `.app-eyebrow`: `color: var(--gold)` (replaces teal `rgba(15,118,110,0.86)`)
- `.bottom-nav`: `background: rgba(7,8,13,0.9)`, `backdrop-filter: blur(20px)`
- `.nav-item.active`: `background: rgba(201,168,76,0.1)`, `border-color: rgba(201,168,76,0.28)`, `color: var(--gold)`
- `.nav-icon`: `background: rgba(255,255,255,0.05)`, `border-color: var(--border)`

**Cards:**
- `.card`, `.card-shell`: `background: var(--bg-elevated)` (`#0f1117`), `border: 1px solid var(--border)`, deep shadow

**Buttons:**
- `.btn` (primary): `background: linear-gradient(135deg, #c9a84c, #b8943d)`, `color: #07080d`, `border-color: rgba(201,168,76,0.3)`
- `.btn.secondary`: `background: rgba(255,255,255,0.04)`, `border: 1px solid rgba(255,255,255,0.1)`, `color: var(--text)`
- `.btn.danger`: `background: linear-gradient(135deg, #ef4444, #dc2626)`, keep as-is

**Inputs:**
- `.input`: `background: rgba(255,255,255,0.04)`, `color: var(--text)`, `border: 1px solid rgba(255,255,255,0.1)`
- `.input:focus`: `border-color: rgba(201,168,76,0.5)`, `box-shadow: 0 0 0 3px rgba(201,168,76,0.12)`

**Activity rows (CSS classes only — NOT inline styles in DashboardPage):**
- `.activity-row`, `.ledger-row`: `background: var(--surface)` (`#161820`), `border: 1px solid var(--border)`
- `.activity-row.income`, `.ledger-row.income`: `border-inline-start: 4px solid var(--income)` (remove old `border-right`)
- `.activity-row.fixed`, `.ledger-row.fixed`: `border-inline-start: 4px solid var(--gold)`
- `.activity-row.variable`, `.ledger-row.variable`: `border-inline-start: 4px solid var(--variable)`
- Amount colors: `.activity-amount.fixed`, `.ledger-amount.fixed`: `color: var(--gold)`
- Amount colors: `.activity-amount.variable`, `.ledger-amount.variable`: `color: var(--variable)`

**Status pills:**
- `.status-pill.income`: `background: var(--success-soft)`, `color: var(--income)`
- `.status-pill.fixed`: `background: var(--warning-soft)`, `color: var(--gold)`
- `.status-pill.variable`: `background: var(--neutral-soft)`, `color: var(--variable)`
- `.status-pill.warn`: `background: var(--warning-soft)`, `color: #fbbf24`
- `.status-pill.neutral`: `background: rgba(255,255,255,0.06)`, `color: var(--muted)`

**Hero balance:**
- `.hero-balance`: `background: linear-gradient(135deg, rgba(201,168,76,0.15), rgba(201,168,76,0.08))`, `border: 1px solid rgba(201,168,76,0.22)`, `color: var(--text)`
- `.hero-balance.negative`: `background: linear-gradient(135deg, rgba(239,68,68,0.15), rgba(239,68,68,0.08))`, `border-color: rgba(239,68,68,0.22)`

**Modal:**
- `.modal-overlay`: `background: rgba(0,0,0,0.65)`
- `.modal-card`: `background: #0f1117`, `border: 1px solid rgba(255,255,255,0.1)`

**Banners:**
- `.note-banner`: dark blue-tint bg, light text
- `.error-banner`: `background: var(--danger-soft)`, `color: var(--danger)`
- `.empty-panel`: `background: rgba(255,255,255,0.02)`, `border-color: rgba(255,255,255,0.08)`

**Dropzone:**
- `.file-dropzone`: `background: rgba(255,255,255,0.02)`, `border-color: rgba(201,168,76,0.24)`
- `.file-dropzone.active`: gold border + gold glow shadow

**Summary/insight cards:**
- `.summary-card`, `.insight-card`: `background: var(--bg-elevated)`, dark border
- `.summary-card.positive`: gold-tint gradient overlay
- `.summary-card.negative`: danger-tint gradient overlay
- `.summary-card.neutral`: surface gradient overlay

**Category bars:**
- `.category-track`: `background: rgba(255,255,255,0.06)`
- `.category-fill`: `background: linear-gradient(90deg, var(--gold), #b8943d)`

**Responsive breakpoints:** Preserve `@media` block structure exactly. Only color/shadow values change inside them. No layout properties altered.

---

### 2. BottomNav.tsx — SVG Icons (JSX/TS targeted fix)

Replace Hebrew letter icons with inline SVGs. No new npm dependency.

1. **Update the React import**: `import React, { type ReactNode } from "react"` — required for TypeScript to recognize `ReactNode`
2. Change `Icon` component props: `{ text: string }` → `{ children: ReactNode }`
3. Render `{props.children}` (or destructured `{children}`) instead of `{props.text}`
4. **Update the `items` array type**: change `icon: string` → `icon: ReactNode`
5. **Update the call site in the map**: change `<Icon text={item.icon} />` → `<Icon>{item.icon}</Icon>`
6. Pass inline `<svg>` JSX as the `icon` values for each of the four items

SVG spec for all icons (24×24 viewBox, `stroke="currentColor"`, `strokeWidth="1.5"`, `strokeLinecap="round"`, `strokeLinejoin="round"`, `fill="none"`):

- **דשבורד** (BarChart2): `<line x1="18" y1="20" x2="18" y2="10"/>`, `<line x1="12" y1="20" x2="12" y2="4"/>`, `<line x1="6" y1="20" x2="6" y2="14"/>`
- **הוספה** (PlusCircle): `<circle cx="12" cy="12" r="10"/>`, `<line x1="12" y1="8" x2="12" y2="16"/>`, `<line x1="8" y1="12" x2="16" y2="12"/>`
- **תנועות** (List): `<line x1="8" y1="6" x2="21" y2="6"/>`, `<line x1="8" y1="12" x2="21" y2="12"/>`, `<line x1="8" y1="18" x2="21" y2="18"/>`, `<line x1="3" y1="6" x2="3.01" y2="6"/>`, `<line x1="3" y1="12" x2="3.01" y2="12"/>`, `<line x1="3" y1="18" x2="3.01" y2="18"/>`
- **הגדרות** (Settings): use a simplified gear — `<circle cx="12" cy="12" r="3"/>` + `<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>`

---

### 3. DashboardPage.tsx — Cleanup + Inline Style Updates

**A. Remove two JSX blocks:**

1. Muted description div (around line 198) — remove entirely:
   ```
   <div className="muted" style={{ fontSize: 12 }}>
     תצוגה חודשית. הכרטיסיות...
   </div>
   ```

2. Duplicate action card (lines ~202–221) — remove entirely:
   ```
   <div className="card" style={{ ...cardStyle, padding: 10, display: "grid", gridTemplateColumns: "repeat(auto-fit,...", ... }}>
     ...פתיחת ייבוא קובץ... מעבר ליומן מלא... סקירה עבור...
   </div>
   ```

**B. Update `cardStyle` constant** (around line 149) to dark theme:
```tsx
const cardStyle = {
  background: "#0f1117",
  borderRadius: 20,
  boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
};
```

**C. Fix `balanceBorder` colors** (around line 155):
```tsx
const balanceBorder =
  summary.totals.balance > 0
    ? "6px solid rgba(201,168,76,0.9)"   // gold for positive
    : summary.totals.balance < 0
      ? "6px solid rgba(239,68,68,0.9)"  // red for negative
      : undefined;
```

**D. Fix balance card border direction** (around line 230):
```tsx
// Change borderLeft → borderInlineStart
style={{ ...cardStyle, borderInlineStart: balanceBorder }}
```

**E. Update recent activity inline styles** (the `recentActivity.map()` block, around lines 412–468):
Replace all hardcoded light-theme inline styles with dark equivalents:
- Row background: `"rgba(255,255,255,0.94)"` → `"#161820"`
- Row borders: the row currently has four separate border keys (`borderLeft`, `borderTop`, `borderRight`, `borderBottom`). Replace the entire border specification with:
  ```tsx
  border: "1px solid rgba(255,255,255,0.06)",
  borderInlineStart: entry.type === "income"
    ? "4px solid #4ade80"
    : tone === "fixed"
      ? "4px solid #c9a84c"
      : "4px solid #f87171",
  ```
  Remove the separate `borderTop`, `borderRight`, `borderBottom` keys (the shorthand `border` covers them), and **remove** the old `borderLeft` key entirely. `borderInlineStart` will override the inline-start side of `border` on RTL layouts.
- Income amount color: `"rgba(34,197,94,0.95)"` → `"#4ade80"`
- Fixed amount color: `"rgba(168,85,247,0.95)"` → `"#c9a84c"` (gold)
- Variable amount color: already `"rgba(239,68,68,0.95)"` — update to `"#f87171"`

**F. No changes to:** data loading, state, handlers, chart data/options, `summarizeMonthlyEntries`, `buildDashboardInsights`, `groupVariableExpensesByCategory`, `listVariableExpenseTrend`, `ImportEntriesModal` usage.

**G. Chart.js readability on dark bg** — add `color: "#a89e8c"` to axis tick options and legend labels:
```tsx
// In Bar chart options scales:
x: { ticks: { autoSkip: false, maxRotation: 0, minRotation: 0, color: "#a89e8c" } },
y: { ticks: { callback: (value) => formatILS(Number(value)), color: "#a89e8c" } }
// In Doughnut options plugins:
legend: { position: "bottom", labels: { padding: 18, color: "#a89e8c" } }
```

---

### 4. AppLayout.tsx — No JSX changes

All changes handled by globals.css (`.app-header` dark + gold border, `.app-eyebrow` gold color).

---

### 5. LoginPage.tsx — Dark Theme

Read the file first to identify all inline color styles. Update:
- `color: "#fecdd3"` (main error message text) → `color: "var(--danger)"` — this is an error string, use danger not text
- `color: "#fca5a5"` (appears twice in `!isFirebaseConfigured` block) → `color: "var(--danger)"` — both instances
- Any light background inline styles → dark equivalents using the new palette
- No changes to form handlers, auth logic, or navigation

---

### 6. ImportEntriesModal.tsx — CSS classes only

Update any inline `background`, `color`, or `border` style props that use the old teal/light palette to dark equivalents. **Zero changes** to: OCR trigger logic, file handling, state, form submission, or any event handlers.

---

## What Is NOT Changing

- All OCR logic, state, and flow in `imageOcrService.ts` and `ImportEntriesModal.tsx`
- All Firebase/Firestore queries and services
- All routing and navigation logic
- All data models, domain functions, analytics
- Form validation and submission logic
- Auth flow
- All responsive breakpoint structure (grid columns, flex direction rules)

---

## Files Touched

| File | Change Type |
|------|------------|
| `src/styles/globals.css` | Full `:root` palette replacement + dark theme for all classes |
| `src/components/BottomNav.tsx` | JSX/TS: SVG icons replace Hebrew letter icons |
| `src/pages/DashboardPage.tsx` | JSX: remove 2 blocks, update cardStyle + balanceBorder + activity row inline styles + chart tick colors |
| `src/app/layout/AppLayout.tsx` | No changes (affected by globals.css only) |
| `src/pages/LoginPage.tsx` | JSX: inline color style updates only |
| `src/components/entry/ImportEntriesModal.tsx` | JSX: inline color style updates only, zero logic |

---

## Success Criteria

- [ ] App background is near-black (`#07080d`) — no teal radial gradients
- [ ] Primary buttons are gold with black text
- [ ] Bottom nav shows SVG icons (not Hebrew letters)
- [ ] Dashboard has no duplicate action card
- [ ] Balance card border-inline-start is gold (positive) or red (negative)
- [ ] KPI cards and activity rows are dark (`#0f1117` / `#161820`) — not white
- [ ] Chart.js axis labels and legend text are legible on dark background
- [ ] All existing features work identically (import, OCR, charts, auth)
- [ ] RTL Hebrew text renders correctly at all breakpoints
- [ ] OCR import flow opens, processes, and saves exactly as before
