# Obsidian Gold Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current teal glassmorphism design with a luxury dark "Obsidian Gold" theme across all pages without changing any functionality.

**Architecture:** CSS-first approach — replace the full `:root` palette in `globals.css` so most components update automatically. Then fix the 3 files that use hardcoded inline styles that CSS variables cannot reach (DashboardPage, BottomNav, LoginPage).

**Tech Stack:** React 18, TypeScript 5, Vite, CSS custom properties. No new dependencies.

**Verification:** No test framework in this project. Verify each task with `npm run typecheck` (TypeScript) + `npm run build` (full build) + visual check in `npm run dev`.

**OCR constraint:** `ImportEntriesModal.tsx` and `imageOcrService.ts` — never touch logic, state, or handlers. The modal uses only CSS classes (no inline color styles), so globals.css updates cover it automatically with zero JSX changes needed.

---

## Chunk 1: globals.css — Full Dark Theme

### Task 1: Replace `:root` CSS variables

**Files:**
- Modify: `src/styles/globals.css` (lines 1–25)

- [ ] **Step 1: Replace the entire `:root` block**

Open `src/styles/globals.css`. Replace lines 1–25 (the entire `:root { ... }` block) with:

```css
:root {
  --bg: #07080d;
  --bg-elevated: #0f1117;
  --surface: #161820;
  --border: rgba(255, 255, 255, 0.07);
  --border-gold: rgba(201, 168, 76, 0.22);
  --line: rgba(255, 255, 255, 0.07);
  --text: #f0ebe0;
  --muted: #a89e8c;
  --gold: #c9a84c;
  --gold-soft: rgba(201, 168, 76, 0.12);
  --primary: #c9a84c;
  --primary-strong: #b8943d;
  --income: #4ade80;
  --fixed: #c9a84c;
  --variable: #f87171;
  --danger: #ef4444;
  --danger-soft: rgba(239, 68, 68, 0.12);
  --success: #4ade80;
  --success-soft: rgba(74, 222, 128, 0.1);
  --neutral-soft: rgba(255, 255, 255, 0.06);
  --warning-soft: rgba(201, 168, 76, 0.12);
  --shadow-lg: 0 32px 80px rgba(0, 0, 0, 0.65);
  --shadow-md: 0 16px 48px rgba(0, 0, 0, 0.5);
  --shadow-sm: 0 6px 20px rgba(0, 0, 0, 0.4);
  --radius-xl: 28px;
  --radius-lg: 22px;
  --radius-md: 18px;
  --radius-sm: 14px;
}
```

Note: `--primary` and `--primary-strong` are kept as aliases for gold to preserve any references in the codebase.

- [ ] **Step 2: Run typecheck to confirm no compile errors**

```bash
cd "d:/הוצאות ביתיות - 3.26/monthly-balance"
npm run typecheck
```

Expected: no errors (CSS change only).

---

### Task 2: Update `body` and layout backgrounds

**Files:**
- Modify: `src/styles/globals.css` (body, .app-header, .bottom-nav)

- [ ] **Step 1: Update `body` background**

Find the `body { ... }` block and replace its `background` property:

```css
body {
  margin: 0;
  direction: rtl;
  color: var(--text);
  font-family: "Heebo", "Rubik", system-ui, sans-serif;
  background: linear-gradient(180deg, #07080d, #09090f);
}
```

- [ ] **Step 2: Update `.app-header`**

Find `.app-header { ... }` and replace:

```css
.app-header {
  position: sticky;
  top: 0;
  z-index: 30;
  border-bottom: 1px solid rgba(201, 168, 76, 0.12);
  background: rgba(7, 8, 13, 0.88);
  backdrop-filter: blur(20px);
}
```

- [ ] **Step 3: Update `.app-eyebrow`**

Find `.app-eyebrow, .eyebrow { ... }` and change `color` to:

```css
.app-eyebrow,
.eyebrow {
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--gold);
}
```

- [ ] **Step 4: Update `.bottom-nav`**

```css
.bottom-nav {
  position: fixed;
  inset-inline: 0;
  bottom: 0;
  z-index: 35;
  border-top: 1px solid rgba(201, 168, 76, 0.1);
  background: rgba(7, 8, 13, 0.92);
  backdrop-filter: blur(20px);
}
```

- [ ] **Step 5: Update `.nav-item` and `.nav-item.active`**

```css
.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px 8px;
  border-radius: 16px;
  border: 1px solid transparent;
  color: var(--muted);
  transition: background 120ms ease, border-color 120ms ease, transform 120ms ease;
}

.nav-item.active {
  color: var(--gold);
  border-color: rgba(201, 168, 76, 0.28);
  background: rgba(201, 168, 76, 0.1);
}
```

- [ ] **Step 6: Update `.nav-icon`**

```css
.nav-icon {
  width: 28px;
  height: 28px;
  border-radius: 10px;
  border: 1px solid var(--border);
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.04);
  font-weight: 900;
}
```

- [ ] **Step 7: Visual check in dev server**

```bash
npm run dev
```

Open browser, verify: near-black background, gold header border, bottom nav dark glass.

---

### Task 3: Update cards, buttons, and inputs

**Files:**
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Update `.card` and `.card-shell`**

```css
.card,
.card-shell {
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
}

.card {
  padding: 18px;
}
```

- [ ] **Step 2: Update `.btn` (primary)**

```css
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 44px;
  padding: 10px 16px;
  border-radius: 16px;
  border: 1px solid rgba(201, 168, 76, 0.3);
  background: linear-gradient(135deg, #c9a84c, #b8943d);
  color: #07080d;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  transition: transform 120ms ease, filter 120ms ease, box-shadow 120ms ease;
  font-weight: 700;
}

.btn:hover {
  transform: translateY(-1px);
  filter: brightness(1.06);
  box-shadow: var(--shadow-md);
}

.btn:active {
  transform: translateY(0);
}

.btn.secondary {
  color: var(--text);
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.1);
}

.btn.danger {
  background: linear-gradient(135deg, #ef4444, #dc2626);
  border-color: rgba(239, 68, 68, 0.3);
  color: #fff;
}
```

- [ ] **Step 3: Update `.input`**

```css
.input {
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text);
  padding: 12px 14px;
  border-radius: 16px;
  outline: none;
  transition: border-color 120ms ease, box-shadow 120ms ease;
}

.input:focus {
  border-color: rgba(201, 168, 76, 0.5);
  box-shadow: 0 0 0 3px rgba(201, 168, 76, 0.12);
}
```

- [ ] **Step 4: Typecheck + quick visual check**

```bash
npm run typecheck
```

Open dev server, verify: cards are dark, primary buttons are gold with black text, inputs are dark with gold focus ring.

---

### Task 4: Update activity rows, status pills, modals, banners

**Files:**
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Update `.activity-row` / `.ledger-row`**

```css
.activity-row,
.ledger-row,
.import-row {
  border: 1px solid var(--border);
  border-radius: 20px;
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.activity-row,
.ledger-row {
  padding: 16px;
}

.activity-row.income,
.ledger-row.income {
  border-inline-start: 4px solid rgba(74, 222, 128, 0.95);
}

.activity-row.fixed,
.ledger-row.fixed {
  border-inline-start: 4px solid rgba(201, 168, 76, 0.95);
}

.activity-row.variable,
.ledger-row.variable {
  border-inline-start: 4px solid rgba(248, 113, 113, 0.95);
}
```

- [ ] **Step 2: Update amount colors**

```css
.activity-amount.income,
.ledger-amount.income {
  color: var(--success);
}

.activity-amount.fixed,
.ledger-amount.fixed {
  color: var(--gold);
}

.activity-amount.variable,
.ledger-amount.variable {
  color: var(--variable);
}
```

- [ ] **Step 3: Update `.status-pill` variants**

```css
.status-pill.income {
  background: var(--success-soft);
  color: var(--income);
}

.status-pill.fixed {
  background: var(--warning-soft);
  color: var(--gold);
}

.status-pill.variable {
  background: rgba(248, 113, 113, 0.1);
  color: var(--variable);
}

.status-pill.warn {
  background: var(--warning-soft);
  color: #fbbf24;
}

.status-pill.neutral {
  background: var(--neutral-soft);
  color: var(--muted);
}
```

- [ ] **Step 4: Update `.modal-overlay` and `.modal-card`**

```css
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: grid;
  place-items: center;
  padding: 18px;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(8px);
}

.modal-card {
  width: min(760px, 96vw);
  max-height: 88vh;
  overflow: auto;
  border-radius: var(--radius-xl);
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: var(--bg-elevated);
  box-shadow: 0 40px 100px rgba(0, 0, 0, 0.7);
  padding: 20px;
}

.modal-card.modal-wide {
  width: min(1060px, 96vw);
}
```

- [ ] **Step 5: Update banners and empty state**

```css
.note-banner {
  background: rgba(79, 142, 247, 0.08);
  color: #93c5fd;
  border: 1px solid rgba(79, 142, 247, 0.18);
}

.error-banner {
  background: var(--danger-soft);
  color: var(--danger);
  border: 1px solid rgba(239, 68, 68, 0.18);
}

.empty-panel {
  background: rgba(255, 255, 255, 0.02);
  color: var(--muted);
  border: 1px dashed rgba(255, 255, 255, 0.1);
  text-align: center;
}
```

- [ ] **Step 6: Update `.hero-balance`**

```css
.hero-balance {
  padding: 18px;
  border-radius: 22px;
  color: var(--text);
  background: linear-gradient(135deg, rgba(201, 168, 76, 0.14), rgba(201, 168, 76, 0.06));
  border: 1px solid rgba(201, 168, 76, 0.22);
  box-shadow: var(--shadow-md);
}

.hero-balance.negative {
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.14), rgba(239, 68, 68, 0.06));
  border-color: rgba(239, 68, 68, 0.22);
}
```

- [ ] **Step 7: Update summary/insight cards, category bars, dropzone**

```css
.summary-card {
  padding: 16px;
  border-radius: 22px;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  box-shadow: var(--shadow-sm);
  display: grid;
  gap: 10px;
}

.summary-card.positive {
  background: linear-gradient(180deg, rgba(74, 222, 128, 0.08), var(--bg-elevated));
}

.summary-card.negative {
  background: linear-gradient(180deg, rgba(239, 68, 68, 0.08), var(--bg-elevated));
}

.summary-card.neutral {
  background: linear-gradient(180deg, rgba(201, 168, 76, 0.06), var(--bg-elevated));
}

.insight-card {
  padding: 16px;
  border-radius: 22px;
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
  background: var(--bg-elevated);
}

.insight-card.good {
  background: linear-gradient(180deg, rgba(74, 222, 128, 0.08), var(--bg-elevated));
}

.insight-card.warn {
  background: linear-gradient(180deg, rgba(201, 168, 76, 0.1), var(--bg-elevated));
}

.insight-card.neutral {
  background: linear-gradient(180deg, rgba(79, 142, 247, 0.07), var(--bg-elevated));
}

.category-track {
  height: 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  overflow: hidden;
}

.category-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #c9a84c, #b8943d);
}

.file-dropzone {
  display: grid;
  gap: 12px;
  padding: 18px;
  border-radius: 20px;
  border: 2px dashed rgba(201, 168, 76, 0.24);
  background: rgba(255, 255, 255, 0.02);
  transition: border-color 120ms ease, box-shadow 120ms ease, transform 120ms ease, background 120ms ease;
}

.file-dropzone.active {
  border-color: rgba(201, 168, 76, 0.7);
  box-shadow: 0 0 0 4px rgba(201, 168, 76, 0.1);
  transform: translateY(-1px);
}

.file-dropzone.ready {
  border-style: solid;
  border-color: rgba(201, 168, 76, 0.45);
}
```

- [ ] **Step 8: Update `label` color**

```css
label {
  font-size: 12px;
  color: var(--muted);
  font-weight: 700;
}
```

- [ ] **Step 9: Full build check**

```bash
npm run build
```

Expected: exits with code 0. Fix any errors before proceeding.

- [ ] **Step 10: Commit Chunk 1**

```bash
git add src/styles/globals.css
git commit -m "style: apply Obsidian Gold dark theme to globals.css"
```

---

## Chunk 2: BottomNav.tsx + DashboardPage.tsx

### Task 5: BottomNav — SVG icons

**Files:**
- Modify: `src/components/BottomNav.tsx`

- [ ] **Step 1: Rewrite BottomNav.tsx with SVG icons**

Replace the entire file content with:

```tsx
import React, { type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { routes, type RouteKey } from "../app/routes";

function Icon(props: { children: ReactNode }) {
  return <div className="nav-icon">{props.children}</div>;
}

const DashboardIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
);

const AddIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="16" />
    <line x1="8" y1="12" x2="16" y2="12" />
  </svg>
);

const ListIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" />
    <line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);

const SettingsIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const items: Array<{ key: RouteKey; icon: ReactNode }> = [
  { key: "dashboard", icon: DashboardIcon },
  { key: "add", icon: AddIcon },
  { key: "transactions", icon: ListIcon },
  { key: "settings", icon: SettingsIcon },
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
            <Icon>{item.icon}</Icon>
            <div className="nav-label">{routes[item.key].label}</div>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Visual check**

```bash
npm run dev
```

Open the app. Verify bottom nav shows SVG icons (bar chart, plus circle, list, gear) instead of Hebrew letters. Active item should be gold.

- [ ] **Step 4: Commit**

```bash
git add src/components/BottomNav.tsx
git commit -m "style: replace Hebrew letter nav icons with SVG icons"
```

---

### Task 6: DashboardPage — Remove duplicates + fix inline styles

**Files:**
- Modify: `src/pages/DashboardPage.tsx`

- [ ] **Step 1: Remove the muted description div (line ~198)**

Find and delete the following JSX block (it appears right after the month selector row):

```tsx
<div className="muted" style={{ fontSize: 12 }}>
  תצוגה חודשית. הכרטיסיות והגרפים מתעדכנים אוטומטית לפי החודש שנבחר.
</div>
```

- [ ] **Step 2: Remove the duplicate action card (lines ~202–221)**

Find and delete the entire card block that comes immediately after the above div:

```tsx
<div
  className="card"
  style={{
    ...cardStyle,
    padding: 10,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 10,
  }}
>
  <button className="btn" type="button" onClick={() => setIsImportOpen(true)} disabled={state === "loading" || isMonthPending}>
    פתיחת ייבוא קובץ
  </button>
  <Link className="btn secondary" to="/transactions">
    מעבר ליומן מלא
  </Link>
  <div className="muted" style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700 }}>
    {state === "loading" || isMonthPending ? "טוען נתוני חודש..." : `סקירה עבור ${formatMonthKey(monthKey)}`}
  </div>
</div>
```

- [ ] **Step 3: Update `cardStyle` constant (line ~149)**

Find:
```tsx
const cardStyle = {
  background: "linear-gradient(180deg, #ffffff, #f8fafc)",
  borderRadius: 20,
  boxShadow: "0 30px 60px rgba(0,0,0,0.18)",
};
```

Replace with:
```tsx
const cardStyle = {
  background: "#0f1117",
  borderRadius: 20,
  boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
};
```

- [ ] **Step 4: Update `balanceBorder` colors (line ~155)**

Find:
```tsx
const balanceBorder =
  summary.totals.balance > 0
    ? "6px solid rgba(34,197,94,0.95)"
    : summary.totals.balance < 0
      ? "6px solid rgba(239,68,68,0.95)"
      : undefined;
```

Replace with:
```tsx
const balanceBorder =
  summary.totals.balance > 0
    ? "6px solid rgba(201,168,76,0.9)"
    : summary.totals.balance < 0
      ? "6px solid rgba(239,68,68,0.9)"
      : undefined;
```

- [ ] **Step 5: Fix balance card border direction (line ~230)**

Find:
```tsx
style={{ ...cardStyle, borderLeft: balanceBorder }}
```

Replace with:
```tsx
style={{ ...cardStyle, borderInlineStart: balanceBorder }}
```

- [ ] **Step 6: Update recent activity row inline styles**

Find the entire block inside `recentActivity.map((entry) => {` — the `<div key={entry.id} style={{ borderLeft: ..., borderRadius: 18, ... }}>`. Replace the inline style object with dark theme styles:

```tsx
<div
  key={entry.id}
  style={{
    border: "1px solid rgba(255,255,255,0.06)",
    borderInlineStart:
      entry.type === "income"
        ? "4px solid #4ade80"
        : tone === "fixed"
          ? "4px solid #c9a84c"
          : "4px solid #f87171",
    borderRadius: 18,
    background: "#161820",
    padding: 14,
  }}
>
```

- [ ] **Step 7: Update recent activity amount colors**

In the same map block, find the amount `<div style={{ fontWeight: 900, color: ... }}>`. Replace its `color` logic:

```tsx
<div
  style={{
    fontWeight: 900,
    color:
      entry.type === "income"
        ? "#4ade80"
        : tone === "fixed"
          ? "#c9a84c"
          : "#f87171",
  }}
>
```

- [ ] **Step 8: Add Chart.js dark text colors**

In the `<Bar>` chart options, update `scales` to add tick colors:

```tsx
scales: {
  x: {
    ticks: {
      autoSkip: false,
      maxRotation: 0,
      minRotation: 0,
      color: "#a89e8c",
    },
  },
  y: {
    ticks: {
      callback: (value) => formatILS(Number(value)),
      color: "#a89e8c",
    },
  },
},
```

In the `<Doughnut>` chart options, update `legend.labels` to add color:

```tsx
legend: {
  position: "bottom",
  labels: {
    padding: 18,
    color: "#a89e8c",
  },
},
```

- [ ] **Step 9: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 10: Visual check**

```bash
npm run dev
```

Open the Dashboard. Verify:
- No duplicate "פתיחת ייבוא קובץ" card below the toolbar
- KPI cards are dark (#0f1117)
- Balance card has gold border-inline-start (right side in RTL)
- Recent activity rows are dark (#161820) with gold/green/red left accent
- Chart axis labels are visible (warm gray) on dark background

- [ ] **Step 11: Commit**

```bash
git add src/pages/DashboardPage.tsx
git commit -m "style: apply Obsidian Gold theme to DashboardPage inline styles"
```

---

## Chunk 3: LoginPage + Final Build

### Task 7: LoginPage — Dark theme inline colors

**Files:**
- Modify: `src/pages/LoginPage.tsx`

- [ ] **Step 1: Update the 3 inline color instances**

The file has exactly 3 hardcoded light-pink color values. Replace them all:

At line 24 — error message after failed login:
```tsx
// Before:
<div style={{ color: "#fecdd3", fontSize: 12 }}>{err}</div>
// After:
<div style={{ color: "var(--danger)", fontSize: 12 }}>{err}</div>
```

At line 38 — Firebase config error text:
```tsx
// Before:
<div style={{ color: "#fca5a5", fontSize: 12 }}>
  {firebaseConfigurationError}
</div>
// After:
<div style={{ color: "var(--danger)", fontSize: 12 }}>
  {firebaseConfigurationError}
</div>
```

At line 44 — Firebase disabled message:
```tsx
// Before:
<div style={{ color: "#fca5a5", fontSize: 12 }}>
  התחברות מושבתת: חסרה הגדרת Firebase בסביבת ההרצה.
</div>
// After:
<div style={{ color: "var(--danger)", fontSize: 12 }}>
  התחברות מושבתת: חסרה הגדרת Firebase בסביבת ההרצה.
</div>
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/LoginPage.tsx
git commit -m "style: update LoginPage inline colors for dark theme"
```

---

### Task 8: Final verification

- [ ] **Step 1: Full production build**

```bash
npm run build
```

Expected: exits code 0 with no TypeScript or build errors.

- [ ] **Step 2: Visual walkthrough in dev server**

```bash
npm run dev
```

Check each screen against the success criteria:

| Screen | What to verify |
|--------|---------------|
| Login | Dark card, gold button, danger-red error text (if visible) |
| Dashboard | Dark bg, no teal gradients, gold primary buttons, no duplicate card, dark KPI/activity cards, gold/red balance border, readable chart labels |
| Add Entry | Dark form inputs with gold focus ring, gold submit button |
| Transactions | Dark ledger rows with colored inline-start borders |
| Settings | Dark cards |
| Bottom Nav | SVG icons (bar chart, plus, list, gear), active item gold |
| Import Modal | Opens correctly, OCR flow works, modal is dark |

- [ ] **Step 3: Test OCR import flow (critical)**

Open Dashboard → click "הוספת קובץ" → modal opens → verify the import UI appears correctly → close without importing → confirm no errors in console.

- [ ] **Step 4: Final commit if any cleanup needed**

```bash
git add -p   # stage only intentional changes
git commit -m "style: final Obsidian Gold polish"
```
