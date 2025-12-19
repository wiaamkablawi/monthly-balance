export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function monthKeyFromISO(dateISO: string): string {
  // YYYY-MM-DD -> YYYY-MM
  return dateISO.slice(0, 7);
}

export function currentMonthKey(): string {
  return monthKeyFromISO(todayISO());
}
