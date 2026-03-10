import React, { useEffect, useState } from "react";
import AppLayout from "../app/layout/AppLayout";
import { logout } from "../services/authService";
import { deleteFixedTemplate, listFixedTemplates, saveFixedTemplate } from "../services/recordsService";
import type { FixedExpenseDoc } from "../types/models";
import { formatILS } from "../utils/money";

function FixedTemplatesSection() {
  const [items, setItems] = useState<FixedExpenseDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [chargeDay, setChargeDay] = useState("1");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [isActive, setIsActive] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  async function loadTemplates() {
    setLoading(true);
    setErrorMessage("");

    try {
      const nextItems = await listFixedTemplates();
      setItems(nextItems);
    } catch (error: any) {
      setErrorMessage(error?.message || "לא הצלחנו לטעון את ההוצאות הקבועות.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTemplates();
  }, []);

  function resetForm() {
    setEditingId("");
    setCategory("");
    setDescription("");
    setAmount("");
    setChargeDay("1");
    setStartDate(new Date().toISOString().slice(0, 10));
    setIsActive(true);
    setErrorMessage("");
    setSuccessMessage("");
  }

  function startEdit(item: FixedExpenseDoc) {
    setEditingId(item.id);
    setCategory(item.category);
    setDescription(item.description || "");
    setAmount(String(item.amount));
    setChargeDay(String(item.chargeDay));
    setStartDate(item.startDate);
    setIsActive(item.isActive);
    setErrorMessage("");
    setSuccessMessage("");
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const amountNumber = Number(amount.replace(/,/g, "").trim());

    if (!category.trim()) {
      setErrorMessage("יש לבחור קטגוריה.");
      return;
    }
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      setErrorMessage("יש להזין סכום תקין.");
      return;
    }
    if (!startDate) {
      setErrorMessage("יש לבחור תאריך התחלה.");
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      await saveFixedTemplate({
        id: editingId || undefined,
        category: category.trim(),
        description: description.trim(),
        amount: amountNumber,
        chargeDay: Number(chargeDay),
        startDate,
        isActive,
      });

      await loadTemplates();
      resetForm();
      setSuccessMessage(editingId ? "ההוצאה הקבועה עודכנה." : "ההוצאה הקבועה נוספה.");
    } catch (error: any) {
      setErrorMessage(error?.message || "אירעה שגיאה בשמירת ההוצאה הקבועה.");
    } finally {
      setSaving(false);
    }
  }

  async function onToggleActive(item: FixedExpenseDoc) {
    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      await saveFixedTemplate({
        id: item.id,
        category: item.category,
        description: item.description,
        amount: item.amount,
        chargeDay: item.chargeDay,
        startDate: item.startDate,
        isActive: !item.isActive,
      });
      await loadTemplates();
    } catch (error: any) {
      setErrorMessage(error?.message || "אירעה שגיאה בעדכון הסטטוס.");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(item: FixedExpenseDoc) {
    if (!window.confirm(`למחוק את ההוצאה הקבועה "${item.category}"?`)) return;

    setDeletingId(item.id);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      await deleteFixedTemplate(item.id);
      await loadTemplates();
      if (editingId === item.id) resetForm();
    } catch (error: any) {
      setErrorMessage(error?.message || "אירעה שגיאה במחיקת ההוצאה הקבועה.");
    } finally {
      setDeletingId("");
    }
  }

  return (
    <section className="card">
      <div className="section-header compact">
        <div>
          <div className="section-title">ניהול הוצאות קבועות</div>
          <div className="section-subtitle">כאן מנהלים תבניות חודשיות. המערכת מייצרת מהן חיובים אוטומטיים לכל חודש רלוונטי.</div>
        </div>
      </div>

      <form onSubmit={onSubmit} className="grid" style={{ gap: 12, marginTop: 12 }}>
        <div className="form-grid">
          <div className="grid" style={{ gap: 6 }}>
            <label>קטגוריה</label>
            <input className="input" value={category} onChange={(event) => setCategory(event.target.value)} disabled={saving} />
          </div>
          <div className="grid" style={{ gap: 6 }}>
            <label>סכום</label>
            <input className="input" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={saving} />
          </div>
        </div>

        <div className="form-grid">
          <div className="grid" style={{ gap: 6 }}>
            <label>יום חיוב</label>
            <input
              className="input"
              type="number"
              min={1}
              max={28}
              value={chargeDay}
              onChange={(event) => setChargeDay(event.target.value)}
              disabled={saving}
            />
          </div>
          <div className="grid" style={{ gap: 6 }}>
            <label>תאריך התחלה</label>
            <input className="input" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} disabled={saving} />
          </div>
        </div>

        <div className="grid" style={{ gap: 6 }}>
          <label>תיאור</label>
          <input className="input" value={description} onChange={(event) => setDescription(event.target.value)} disabled={saving} />
        </div>

        <label className="check-row">
          <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} disabled={saving} />
          <span>תבנית פעילה</span>
        </label>

        {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}
        {successMessage ? <div className="note-banner">{successMessage}</div> : null}

        <div className="toolbar-actions" style={{ justifyContent: "space-between" }}>
          <button className="btn" type="submit" disabled={saving}>
            {saving ? "שומר..." : editingId ? "עדכן הוצאה קבועה" : "הוסף הוצאה קבועה"}
          </button>
          <button className="btn secondary" type="button" onClick={resetForm} disabled={saving}>
            נקה טופס
          </button>
        </div>
      </form>

      <div style={{ height: 18 }} />

      {loading ? <div className="note-banner">טוען הוצאות קבועות...</div> : null}
      {!loading && !items.length ? <div className="empty-panel">עדיין אין תבניות קבועות במערכת.</div> : null}

      {!loading && items.length ? (
        <div className="ledger-list">
          {items.map((item) => (
            <article key={item.id} className="ledger-row fixed">
              <div className="ledger-top">
                <div>
                  <div className="ledger-title">{item.category}</div>
                  <div className="ledger-subtitle">{item.description || "ללא תיאור"}</div>
                </div>
                <div className="ledger-amount fixed">{formatILS(item.amount)}</div>
              </div>

              <div className="ledger-meta">
                <span className="ledger-date">מתחיל ב-{item.startDate} · חיוב חודשי ב-{item.chargeDay}</span>
                <div className="badge-row">
                  <span className={`status-pill ${item.isActive ? "fixed" : "neutral"}`}>{item.isActive ? "פעיל" : "מושהה"}</span>
                </div>
              </div>

              <div className="ledger-actions">
                <button className="btn secondary" type="button" onClick={() => startEdit(item)} disabled={saving}>
                  ערוך
                </button>
                <button className="btn secondary" type="button" onClick={() => onToggleActive(item)} disabled={saving}>
                  {item.isActive ? "השהה" : "הפעל"}
                </button>
                <button className="btn danger" type="button" onClick={() => onDelete(item)} disabled={deletingId === item.id}>
                  {deletingId === item.id ? "מוחק..." : "מחק"}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export default function SettingsPage() {
  return (
    <AppLayout
      title="הגדרות מערכת"
      subtitle="שכבת ניהול בסיסית עם גישה, משילות נתונים וניהול הוצאות קבועות."
      right={
        <button className="btn secondary" type="button" onClick={() => logout()}>
          התנתקות
        </button>
      }
    >
      <div className="page-stack">
        <FixedTemplatesSection />

        <section className="card">
          <div className="section-header compact">
            <div>
              <div className="section-title">גישה והרשאות</div>
              <div className="section-subtitle">הגישה למערכת נשלטת כרגע לפי רשימת משתמשים מורשים ב-Firebase Auth.</div>
            </div>
          </div>
          <div className="stack-sm muted">
            <div>מתאים לשלב משפחתי או צוות קטן, אבל לא מחליף שכבת roles מלאה.</div>
            <div>בגרסה ארגונית כדאי להוסיף roles, אישורי גישה, וסביבת audit לכל שינוי בתנועה.</div>
          </div>
        </section>

        <section className="card">
          <div className="section-header compact">
            <div>
              <div className="section-title">משילות נתונים</div>
              <div className="section-subtitle">המערכת שומרת שיוך בית, תאריך יצירה ועדכון, ומפרידה בין קליטה לתבניות קבועות.</div>
            </div>
          </div>
          <div className="stack-sm muted">
            <div>זה בסיס נכון למערכת הוצאות טובה: שיוך ברור, היסטוריית שינוי, והפרדה בין קליטה, בקרה ויומן.</div>
            <div>השלב הבא ברמה עולמית הוא approval flow, תקציב מול ביצוע, וחריגות לפי בעלים וקטגוריות.</div>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
