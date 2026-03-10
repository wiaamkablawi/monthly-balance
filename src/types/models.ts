export type UserKey = "W" | "B" | "SYSTEM";

export type EntryType = "income" | "expense";
export type EntrySubType = "variable" | "fixed" | "fixed_realization";

export interface EntryDoc {
  id: string;
  type: EntryType;
  subType?: EntrySubType;
  date: string; // YYYY-MM-DD
  monthKey: string; // YYYY-MM
  category: string;
  description: string;
  amount: number;
  userKey: UserKey;

  // Ownership / tenancy
  ownerUid: string;
  householdId: string;

  // Installments
  installmentsCount?: number;
  installmentsTotal?: number;
  installmentIndex?: number;
  installmentGroupId?: string;
  chargeDay?: number;

  // Import / source metadata
  sourceFixedId?: string;
  templateId?: string;
  importHash?: string;
  importSource?: string;
  importFingerprint?: string;

  createdAt: number;
  createdBy: string; // email or "system"
  updatedAt?: number;
  updatedBy?: string;
}

export interface FixedExpenseDoc {
  id: string;
  category: string;
  description: string;
  amount: number;
  chargeDay: number;
  startDate: string;
  isActive: boolean;
  householdId: string;

  createdAt: number;
  createdBy: string;
  updatedAt: number;
  updatedBy: string;
}

