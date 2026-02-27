export type UserKey = "W" | "B" | "SYSTEM";

export type EntryType = "income" | "expense";
export type EntrySubType = "variable" | "fixed_realization";

export interface EntryDoc {
  id: string;
  type: EntryType;
  subType: EntrySubType;
  date: string;       // YYYY-MM-DD
  monthKey: string;   // YYYY-MM
  month?: string;     // Legacy support (old docs)
  category: string;
  description: string;
  amount: number;
  userKey: UserKey;

  // תשלומים
  installmentsCount?: number;     // N
  installmentsTotal?: number;     // Legacy/compat alias used in existing docs
  installmentIndex?: number;      // 1..N
  installmentGroupId?: string;    // מזהה משותף לכל התשלומים
  chargeDay?: number;

  // מקור הוצאה קבועה
  sourceFixedId?: string;
  importHash?: string;
  importSource?: string;
  importFingerprint?: string;

  createdAt: number;
  createdBy: string; // email או "system"
  updatedAt?: number;
  updatedBy?: string;
}

export interface FixedExpenseDoc {
  id: string;
  category: string;
  description: string;
  amount: number;
  chargeDay: number; // 1..28, ברירת מחדל 1
  startDate: string; // YYYY-MM-DD
  isActive: boolean;

  createdAt: number;
  createdBy: string; // email
  updatedAt: number;
  updatedBy: string; // email
}
