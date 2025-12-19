export function formatILS(amount: number): string {
  try {
    return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS" }).format(amount);
  } catch {
    return `${amount} ₪`;
  }
}
