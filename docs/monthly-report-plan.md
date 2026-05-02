# Monthly Report — Implementation Plan

**תאריך:** 2026-05-02
**סטטוס:** ממתין לאישור משתמש לפני התחלת מימוש

---

## 1. מטרה

דף נפרד ל"דו״ח חודשי מלא" שמספק:
- ניתוח עמוק יותר מהדשבורד הקיים (גרף יומי, השוואה לחודש קודם, פירוט קבועות)
- "סקירת סוף חודש" שאפשר להדפיס/לייצא ל-PDF/Excel

הדשבורד נשאר כמו שהוא; הדו״ח הוא **תצוגה נוספת**, לא החלפה.

---

## 2. החלטות אפיון (סוכמו עם המשתמש)

| נושא | החלטה |
|---|---|
| מטרה | ניתוח עמוק + סקירת סוף חודש |
| כניסה | דף נפרד ב-route `/report/:monthKey?` עם כפתור בולט בדשבורד (ללא שינוי ב-BottomNav) |
| גרפים | `react-chartjs-2` + `chart.js` (כבר מותקנים, לא משתמשים בזה כיום) |
| ייצוא | `window.print()` עם CSS print-friendly + ייצוא Excel (`xlsx` כבר מותקן) |
| עיצוב | סגנון `mb-*` הקיים — עקבי עם הדשבורד |
| גרף יומי | רק הוצאות **משתנות** (קבועות מקבלות סקשן נפרד) |
| השוואה | סקשן נפרד "השוואה לחודש קודם" עם טבלה מפורטת |

---

## 3. תוכן הדף (לפי הסדר)

### 3.1 Header
- כותרת: "דו״ח חודשי · {שם החודש}"
- בורר חודש (זהה לזה שבדשבורד)
- כפתורי פעולה: 🖨️ הדפסה / 📥 ייצוא Excel / ← חזרה לדשבורד

### 3.2 שורת KPIs (6 כרטיסים)
כל כרטיס: ערך גדול + Δ קטן ליד (חץ + אחוז ירוק/אדום מול חודש קודם):

1. **הכנסות** — `summary.totals.income`
2. **הוצאות** — `summary.totals.expenses`
3. **יתרה** — `summary.totals.balance`
4. **שיעור חיסכון** — `summary.savingsRate * 100` (יתרה / הכנסות)
5. **יחס הוצאות/הכנסות** — `summary.expenseLoad * 100`
6. **מספר עסקאות** — `summary.counts.all`

### 3.3 גרף עוגה — הרכב הוצאות
3 פלחים: הוצאות קבועות / הוצאות משתנות / הכנסות (לצד השוואה ויזואלית)
מקור: `summary.totals.fixed`, `summary.totals.variable`, `summary.totals.income`

### 3.4 גרף עמודות אופקי — Top 8 קטגוריות הוצאה
- כל קטגוריות ההוצאה (קבועות + משתנות), ממוינות לפי סכום, 8 העליונות
- לחיצה על עמודה לא נדרשת (תצוגה בלבד)

### 3.5 גרף עמודות יומי
- ציר X: ימי החודש (1 עד `totalDays`)
- ציר Y: סכום הוצאות **משתנות** באותו יום
- קו אופקי דק = ממוצע יומי (להקשר)

### 3.6 השוואה לחודש קודם — טבלה
| קטגוריה | חודש קודם | חודש נוכחי | שינוי ₪ | שינוי % |

ממוין לפי הפרש ₪ יורד. כולל הכנסות והוצאות.

### 3.7 פירוט הוצאות קבועות שמומשו החודש
טבלה: תיאור / קטגוריה / סכום / תאריך חיוב / סטטוס (ירדה/מתוזמנת)
מקור: `entries.filter(isFixedExpense)` + `getEntryLifecycle`

### 3.8 טבלת קטגוריות מלאה
| קטגוריה | סוג (קבועה/משתנה/הכנסה) | מספר עסקאות | סכום | % מסך הוצאות |
עם Progress bar עדין ליד ה-%

---

## 4. ארכיטקטורה — קבצים שיווצרו / ישתנו

### 4.1 קבצים חדשים

#### `src/domain/report.ts` (חדש)
פונקציות חישוב ייעודיות לדו״ח שלא קיימות ב-`analytics.ts`:

```ts
// סכום הוצאות משתנות לפי יום בחודש
export function dailyVariableExpenses(entries: EntryDoc[], monthKey: string): number[]

// כל קטגוריות ההוצאה ממוינות (לא רק משתנות, כפי ש-groupVariableExpensesByCategory עושה)
export function groupAllExpensesByCategory(entries: EntryDoc[]): CategoryGroup[]

// השוואה בין שני חודשים — מחזיר מערך לפי קטגוריה
export function compareMonths(currentEntries: EntryDoc[], previousEntries: EntryDoc[]): CategoryComparison[]

// מימוש קבועות — סינון + סטטוס lifecycle
export function listFixedRealizations(entries: EntryDoc[], referenceISO?: string): FixedRealizationRow[]

// טבלת קטגוריות מלאה לדו״ח
export function buildCategoryTable(entries: EntryDoc[]): CategoryTableRow[]

// חישוב Δ% עבור KPIs מול חודש קודם
export function computeKpiDeltas(current: MonthlySummary, previous: MonthlySummary | null): KpiDeltas
```

#### `src/services/reportExport.ts` (חדש)
ייצוא Excel באמצעות `xlsx`:

```ts
export function exportMonthlyReportToExcel(args: {
  monthKey: string;
  summary: MonthlySummary;
  categoryTable: CategoryTableRow[];
  comparison: CategoryComparison[];
  fixedRealizations: FixedRealizationRow[];
}): void
```

יוצר workbook עם 4 sheets: סיכום / קטגוריות / השוואה / קבועות.

#### `src/pages/MonthlyReportPage.tsx` (חדש)
הדף הראשי. בנוי מ-sub-components פנימיים:
- `<ReportHeader />` — כותרת, בורר חודש, כפתורי פעולה
- `<KpiGrid />` — 6 כרטיסי KPI עם Δ
- `<CompositionChart />` — עוגה (chart.js)
- `<TopCategoriesChart />` — עמודות אופקי (chart.js)
- `<DailyExpensesChart />` — עמודות יומי (chart.js)
- `<MonthComparisonTable />`
- `<FixedRealizationsTable />`
- `<CategoryBreakdownTable />`

טוען נתונים: `listMonthEntries(monthKey)` עבור החודש הנוכחי **והקודם** במקביל.

#### `src/styles/report.css` (חדש)
- מחלקות `mb-report-*` בסגנון הקיים
- בלוק `@media print` שמסתיר נאב/כפתורים, מעצב לדף A4
- ייבוא ב-`src/styles/index.css` (או איפה שכל ה-CSS מתאסף — אבדוק)

### 4.2 קבצים שישתנו

#### `src/app/routes.tsx`
הוספת `report: { path: "/report", label: "דו״ח חודשי" }` ל-`RouteKey`.

#### `src/app/App.tsx` (או היכן שה-Routes מוגדרים)
הוספת `<Route path="/report" element={<MonthlyReportPage />} />`
תמיכה ב-query param `?month=YYYY-MM` (כמו ב-DashboardPage).

#### `src/pages/DashboardPage.tsx`
הוספת כפתור בולט בלבד — לא נוגעים ב-BottomNav.
מיקום מוצע: בתוך `mb-qa` (אחרי "ייבוא קובץ") או כשורה נפרדת מתחת ל-hero:

```tsx
<Link to={`/report?month=${monthKey}`} className="mb-qa-btn mb-qa-btn-report">
  <span className="mb-qa-ico">📊</span>
  <span className="mb-qa-lbl">דו״ח חודשי מלא</span>
</Link>
```

---

## 5. נקודות עדינות שיש לטפל בהן

### 5.1 חודש קודם ללא נתונים
אם אין `entries` בחודש הקודם — KPI Δ מציג "—" (לא 0%, כדי לא להטעות).
טבלת השוואה: רק שורות עם נתונים בלפחות אחד מהחודשים.

### 5.2 גרף יומי — חודשים עם 28/29/30/31 ימים
שימוש ב-`getMonthProgress(monthKey).totalDays` שכבר קיים ב-`utils/dates.ts`.

### 5.3 הדפסה
- `@media print`: הסתרת `BottomNav`, כפתורים, בורר חודש (מציגים את שם החודש כטקסט קבוע)
- כל סקשן ב-`break-inside: avoid`
- צבעים: `print-color-adjust: exact` כדי שהגרפים יודפסו בצבע

### 5.4 ייצוא Excel — RTL
`xlsx` תומך ב-RTL ברמת cell. נכתוב כותרות בעברית; הקובץ ייפתח נכון ב-Excel עברי.
שם הקובץ: `דוח-חודשי-{monthKey}.xlsx`

### 5.5 ביצועים
טעינת חודש קודם **במקביל** (`Promise.all`) — לא טורית.
שימוש ב-`useMemo` לכל החישובים הכבדים (טבלאות, השוואה, daily array).

### 5.6 chart.js — registration
ב-chart.js v4 צריך לרשום את ה-controllers/elements ידנית (`Chart.register(...)`).
נעשה את זה פעם אחת ב-`MonthlyReportPage.tsx` (או בקובץ helper נפרד `chartSetup.ts`).

---

## 6. סדר ביצוע (בערך 7 שלבים)

1. **`src/domain/report.ts`** — כל פונקציות החישוב (אפשר לכתוב ולבדוק עם מערכי בדיקה ידניים)
2. **`src/services/reportExport.ts`** — ייצוא Excel
3. **`src/styles/report.css`** + ייבוא + הגדרות print
4. **`src/pages/MonthlyReportPage.tsx`** — שלד + טעינת נתונים + KPIs + טבלאות (ללא גרפים)
5. **הוספת הגרפים** עם chart.js (3 גרפים)
6. **חיווט routes + כפתור בדשבורד**
7. **בדיקות ידניות**: ניווט, חודש ריק, חודש מלא, הדפסה, ייצוא Excel, RTL

---

## 7. מה **לא** במסגרת הפיצ'ר הזה (out of scope)

- שינוי ב-`BottomNav`
- שינויים בלוגיקת analytics קיימת (`summarizeMonthlyEntries` נשאר כמו שהוא)
- ייצוא PDF דרך ספריה ייעודית — רק `window.print()`
- שמירת דו״חות היסטוריים ב-Firestore
- שיתוף דו״ח (link sharing)
- גרפים אינטראקטיביים מעבר ל-tooltips ברירת מחדל של chart.js

---

## 8. אישור

לפני שאני מתחיל לכתוב קוד — תאשר:
- [ ] התוכן והסדר של הסקשנים נכונים
- [ ] רשימת הקבצים החדשים/משתנים מתאימה
- [ ] סדר הביצוע הגיוני
- [ ] אין משהו שחסר או שצריך להוציא

או — תגיד מה לשנות ואני אעדכן את ה-plan לפני שמתחילים.
