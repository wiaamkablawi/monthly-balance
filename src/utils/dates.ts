export function todayISO(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function monthKeyFromISO(dateISO: string): string {
  return dateISO.slice(0, 7);
}

export function currentMonthKey(): string {
  return monthKeyFromISO(todayISO());
}

export function listRecentMonthKeys(
  count: number,
  anchorMonthKey: string = currentMonthKey(),
  order: "asc" | "desc" = "desc"
): string[] {
  const [yearRaw, monthRaw] = anchorMonthKey.split("-").map(Number);
  const baseYear = Number.isFinite(yearRaw) ? yearRaw : new Date().getFullYear();
  const baseMonthIndex = Number.isFinite(monthRaw) ? monthRaw - 1 : new Date().getMonth();

  const months = Array.from({ length: Math.max(0, count) }, (_, index) => {
    const date = new Date(baseYear, baseMonthIndex - index, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  });

  return order === "asc" ? months.reverse() : months;
}

export function formatMonthKey(monthKey: string): string {
  const [yearRaw, monthRaw] = monthKey.split("-").map(Number);
  if (!Number.isFinite(yearRaw) || !Number.isFinite(monthRaw)) return monthKey;

  try {
    return new Intl.DateTimeFormat("he-IL", {
      month: "long",
      year: "numeric",
    }).format(new Date(yearRaw, monthRaw - 1, 1));
  } catch {
    return monthKey;
  }
}

export function getMonthProgress(monthKey: string, referenceISO: string = todayISO()): {
  elapsedDays: number;
  remainingDays: number;
  totalDays: number;
  progress: number;
} {
  const [yearRaw, monthRaw] = monthKey.split("-").map(Number);
  const [refYearRaw, refMonthRaw, refDayRaw] = referenceISO.split("-").map(Number);
  const year = Number.isFinite(yearRaw) ? yearRaw : new Date().getFullYear();
  const month = Number.isFinite(monthRaw) ? monthRaw : new Date().getMonth() + 1;
  const totalDays = new Date(year, month, 0).getDate();

  const normalizedMonthKey = `${year}-${String(month).padStart(2, "0")}`;
  const referenceMonthKey = `${Number.isFinite(refYearRaw) ? refYearRaw : year}-${String(
    Number.isFinite(refMonthRaw) ? refMonthRaw : month
  ).padStart(2, "0")}`;

  const buildResult = (elapsedDays: number) => {
    const normalizedElapsed = Math.max(0, Math.min(totalDays, elapsedDays));
    return {
      elapsedDays: normalizedElapsed,
      remainingDays: Math.max(totalDays - normalizedElapsed, 0),
      totalDays,
      progress: totalDays ? normalizedElapsed / totalDays : 0,
    };
  };

  if (normalizedMonthKey < referenceMonthKey) return buildResult(totalDays);
  if (normalizedMonthKey > referenceMonthKey) return buildResult(0);

  return buildResult(Number.isFinite(refDayRaw) ? refDayRaw : 0);
}
