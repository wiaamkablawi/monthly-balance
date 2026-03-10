import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { APP_BUILD } from "../app/buildInfo";
import type { EntryDoc, FixedExpenseDoc } from "../types/models";
import { isFixedExpense, sortEntriesByDisplayDate } from "../domain/entries";
import { currentMonthKey, monthKeyFromISO } from "../utils/dates";
import { ALLOWED_EMAIL_LIST, householdIdFromEmail, userKeyFromEmail } from "./authService";
import { auth } from "./firebase";
import { db } from "./firebaseDb";

type SessionContext = {
  uid: string;
  email: string;
  householdId: string;
  userKey: "W" | "B";
};

type FixedTemplateInput = Pick<
  FixedExpenseDoc,
  "category" | "description" | "amount" | "chargeDay" | "startDate" | "isActive"
> & { id?: string };

type LegacyFixedTemplateRecord = Record<string, unknown>;
type LoadedFixedTemplate = {
  raw: LegacyFixedTemplateRecord;
  template: FixedExpenseDoc;
};

type LegacyRecord = Record<string, unknown>;
type LoadedRecord = {
  raw: LegacyRecord;
  entry: EntryDoc;
};
type QueryDoc = { id: string; data: () => unknown };
type QuerySnapshot = { docs: QueryDoc[] };

let attemptedLegacyTemplateFallback = false;
let attemptedLegacyRecordFallback = false;

function requireSessionContext(): SessionContext {
  const user = auth.currentUser;
  const email = (user?.email || "").trim().toLowerCase();

  if (!user || !email) {
    throw new Error("׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ³׳’ג‚¬ג„¢׳³ג€™׳’ג€ֲ¬ײ²ֲ׳²ֲ²ײ²ֲ¢׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ²ײ²ֲ²׳²ֲ²ײ²ֲ© ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ²ײ²ֲ²׳²ֲ²ײ²ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ³׳’ג‚¬ג„¢׳³ג€™׳’ג‚¬ֲײ²ֲ¬׳²ֲ²ײ²ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ²ײ²ֲ³׳³ג€™׳’ג€ֲ¬׳’ג‚¬ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ³׳’ג‚¬ג„¢׳³ג€™׳’ג‚¬ֲײ²ֲ¬׳³ג€™׳’ג€ֲ¬ײ²ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ³׳’ג‚¬ג„¢׳³ג€™׳’ג‚¬ֲײ²ֲ¬׳²ֲ»ײ²ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ²ײ²ֲ²׳²ֲ²ײ²ֲ¨ ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ²ײ²ֲ²׳²ֲ²ײ²ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ³׳’ג‚¬ג„¢׳³ג€™׳’ג‚¬ֲײ²ֲ¬׳³ג€™׳’ג€ֲ¬ײ²ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ³׳’ג‚¬ג„¢׳³ג€™׳’ג‚¬ֲײ²ֲ¬׳²ֲ²ײ²ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ²ײ²ֲ²׳²ֲ²ײ²ֲ© ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ³׳’ג‚¬ג„¢׳³ג€™׳’ג‚¬ֲײ²ֲ¬׳²ֲ³ײ²ֲ·׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ³׳’ג‚¬ג„¢׳³ג€™׳’ג‚¬ֲײ²ֲ¬׳²ֲ²ײ²ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ³׳’ג‚¬ג„¢׳³ג€™׳’ג€ֲ¬ײ²ֲ׳²ֲ²ײ²ֲ¢ ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ²ײ²ֲ²׳²ֲ²ײ²ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ²ײ²ֲ»׳²ֲ²ײ²ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ²ײ²ֲ²׳²ֲ²ײ²ֲ¢׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ³׳’ג‚¬ג„¢׳³ג€™׳’ג‚¬ֲײ²ֲ¬׳²ֲ²ײ²ֲ¢׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ²ײ²ֲ²׳²ֲ²ײ²ֲ ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ²ײ²ֲ²׳²ֲ²ײ²ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ²ײ²ֲ³׳³ג€™׳’ג€ֲ¬׳’ג‚¬ֲ ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ³׳’ג‚¬ג„¢׳³ג€™׳’ג‚¬ֲײ²ֲ¬׳²ֲ²ײ²ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ²ײ²ֲ²׳²ֲ²ײ²ֲ ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ²ײ²ֲ³׳³ג€™׳’ג€ֲ¬׳’ג‚¬ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ³׳’ג‚¬ג„¢׳³ג€™׳’ג‚¬ֲײ²ֲ¬׳²ֲ²ײ²ֲ¢׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ²ײ²ֲ²׳²ֲ²ײ²ֲ ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ³׳’ג‚¬ג„¢׳³ג€™׳’ג€ֲ¬ײ²ֲ׳²ֲ²ײ²ֲ¢׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ²ײ²ֲ²׳²ֲ²ײ²ֲ.");
  }

  return {
    uid: user.uid,
    email,
    householdId: householdIdFromEmail(email),
    userKey: userKeyFromEmail(email),
  };
}

function fixedRealizationIds(targetMonthKey: string, templateId: string): string[] {
  return [
    `fx__${targetMonthKey}__${templateId}`,
    `fx__${targetMonthKey}__W__${templateId}`,
    `fx__${targetMonthKey}__B__${templateId}`,
  ];
}

function templateIdFromFixedRealizationRecordId(recordId: string, targetMonthKey: string): string {
  const prefix = `fx__${targetMonthKey}__`;
  if (!recordId.startsWith(prefix)) return "";

  const suffix = recordId.slice(prefix.length);
  if (!suffix) return "";

  if (suffix.startsWith("W__") || suffix.startsWith("B__")) {
    return suffix.slice(3).trim();
  }

  return suffix.trim();
}

function shouldCreateRealizationForMonth(startDate: unknown, targetMonthKey: string): boolean {
  const startDateISO = normalizeISODate(startDate);
  if (!startDateISO) return true;
  return monthKeyFromISO(startDateISO) <= targetMonthKey;
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }

  return "";
}

function firstNumber(...values: unknown[]): number {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return 0;
}

function toMillis(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.getTime();

  if (value && typeof value === "object") {
    const maybeTimestamp = value as {
      toMillis?: () => number;
      toDate?: () => Date;
      seconds?: number;
    };

    if (typeof maybeTimestamp.toMillis === "function") {
      const millis = maybeTimestamp.toMillis();
      if (Number.isFinite(millis)) return millis;
    }

    if (typeof maybeTimestamp.toDate === "function") {
      const date = maybeTimestamp.toDate();
      if (date instanceof Date && Number.isFinite(date.getTime())) return date.getTime();
    }

    if (typeof maybeTimestamp.seconds === "number") {
      return maybeTimestamp.seconds * 1000;
    }
  }

  return 0;
}

function normalizeISODate(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }

    if (/^\d{4}-\d{2}$/.test(trimmed)) {
      return `${trimmed}-01`;
    }

    const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slashMatch) {
      const [, day, month, year] = slashMatch;
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }

    return "";
  }

  const millis = toMillis(value);
  if (!millis) return "";

  const date = new Date(millis);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function clampChargeDay(value: unknown): number {
  const parsed = Number(value || 1);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(28, Math.trunc(parsed)));
}

function normalizeMonthKey(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (/^\d{4}-\d{2}$/.test(trimmed)) {
        return trimmed;
      }
    }

    const isoDate = normalizeISODate(value);
    if (isoDate) {
      return monthKeyFromISO(isoDate);
    }
  }

  return "";
}

function normalizeOptionalInteger(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(1, Math.trunc(parsed));
}

function normalizeEntryType(data: LegacyRecord): EntryDoc["type"] {
  return firstString(data.type, data.entryType, data.kind).toLowerCase() === "income" ? "income" : "expense";
}

function normalizeEntrySubType(data: LegacyRecord, type: EntryDoc["type"]): EntryDoc["subType"] {
  const subType = firstString(data.subType, data.sourceType).toLowerCase();
  if (subType === "variable" || subType === "fixed" || subType === "fixed_realization") {
    return subType as EntryDoc["subType"];
  }

  return type === "expense" ? "variable" : undefined;
}

function normalizeUserKey(data: LegacyRecord, createdBy: string, context: SessionContext): EntryDoc["userKey"] {
  const rawUserKey = firstString(data.userKey).toUpperCase();
  if (rawUserKey === "W" || rawUserKey === "B" || rawUserKey === "SYSTEM") {
    return rawUserKey as EntryDoc["userKey"];
  }

  return userKeyFromEmail(createdBy || context.email);
}

function normalizeStartDate(data: LegacyFixedTemplateRecord): string {
  return (
    normalizeISODate(data.startDate) ||
    normalizeISODate(data.firstChargeDate) ||
    normalizeISODate(data.date) ||
    normalizeISODate(data.start) ||
    normalizeISODate(data.monthKey) ||
    normalizeISODate(data.month) ||
    `${currentMonthKey()}-01`
  );
}

function normalizeIsActive(data: LegacyFixedTemplateRecord): boolean {
  const directFlags = [data.isActive, data.active, data.enabled];
  for (const flag of directFlags) {
    if (typeof flag === "boolean") return flag;
  }

  const status = firstString(data.status, data.state).toLowerCase();
  if (!status) return true;

  return !["inactive", "disabled", "archived", "paused", "deleted", "false"].includes(status);
}

function normalizeFixedTemplate(
  id: string,
  data: LegacyFixedTemplateRecord,
  context: SessionContext
): FixedExpenseDoc {
  const createdBy = firstString(data.createdBy, data.userEmail, data.ownerEmail, data.email, context.email).toLowerCase();
  const updatedBy = firstString(data.updatedBy, data.modifiedBy, data.userEmail, createdBy, context.email).toLowerCase();
  const createdAt = toMillis(data.createdAt) || toMillis(data.updatedAt) || Date.now();
  const updatedAt = toMillis(data.updatedAt) || createdAt;

  return {
    id,
    category: firstString(data.category, data.categoryName, data.name, data.title, "׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ²ײ²ֲ²׳²ֲ²ײ²ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ³׳’ג‚¬ג„¢׳³ג€™׳’ג‚¬ֲײ²ֲ¬׳³ג€™׳’ג€ֲ¬ײ²ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ²ײ²ֲ²׳²ֲ²ײ²ֲ¨"),
    description: firstString(data.description, data.desc, data.note, data.notes),
    amount: firstNumber(data.amount, data.sum, data.value, data.price, data.monthlyAmount),
    chargeDay: clampChargeDay(data.chargeDay ?? data.billingDay ?? data.paymentDay ?? data.day ?? data.debitDay),
    startDate: normalizeStartDate(data),
    isActive: normalizeIsActive(data),
    householdId: firstString(data.householdId, context.householdId),
    createdAt,
    createdBy,
    updatedAt,
    updatedBy,
  };
}

function needsTemplateBackfill(raw: LegacyFixedTemplateRecord, template: FixedExpenseDoc): boolean {
  return (
    firstString(raw.householdId) !== template.householdId ||
    firstString(raw.createdBy, raw.userEmail).toLowerCase() !== template.createdBy ||
    !normalizeISODate(raw.startDate) ||
    typeof raw.isActive !== "boolean" ||
    !Number.isFinite(Number(raw.amount)) ||
    !Number.isFinite(Number(raw.chargeDay))
  );
}

function normalizeRecord(id: string, data: LegacyRecord, context: SessionContext): EntryDoc {
  const type = normalizeEntryType(data);
  const subType = normalizeEntrySubType(data, type);
  const createdBy = firstString(data.createdBy, data.userEmail, data.ownerEmail, data.email, context.email).toLowerCase();
  const monthKey = normalizeMonthKey(data.monthKey, data.month, data.date, data.createdAt) || currentMonthKey();
  const createdAt = toMillis(data.createdAt) || toMillis(data.updatedAt) || Date.now();
  const updatedAt = toMillis(data.updatedAt);
  const updatedBy = firstString(data.updatedBy, data.modifiedBy, data.userEmail, createdBy, context.email).toLowerCase();

  const entry: EntryDoc = {
    id,
    type,
    date: normalizeISODate(data.date) || `${monthKey}-01`,
    monthKey,
    category: firstString(data.category, data.categoryName, data.name, data.title, "׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ²ײ²ֲ²׳²ֲ²ײ²ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ³׳’ג‚¬ג„¢׳³ג€™׳’ג‚¬ֲײ²ֲ¬׳³ג€™׳’ג€ֲ¬ײ²ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ²ײ²ֲ²׳²ֲ²ײ²ֲ¨"),
    description: firstString(data.description, data.desc, data.note, data.notes),
    amount: firstNumber(data.amount, data.sum, data.value, data.price, data.total),
    userKey: normalizeUserKey(data, createdBy, context),
    ownerUid: firstString(data.ownerUid, data.uid, context.uid),
    householdId: firstString(data.householdId, context.householdId),
    createdAt,
    createdBy: createdBy || context.email,
  };

  if (subType) {
    entry.subType = subType;
  }

  const installmentsCount = normalizeOptionalInteger(data.installmentsCount);
  if (installmentsCount) {
    entry.installmentsCount = installmentsCount;
  }

  const installmentsTotal = normalizeOptionalInteger(data.installmentsTotal);
  if (installmentsTotal) {
    entry.installmentsTotal = installmentsTotal;
  }

  const installmentIndex = normalizeOptionalInteger(data.installmentIndex);
  if (installmentIndex) {
    entry.installmentIndex = installmentIndex;
  }

  const chargeDay = normalizeOptionalInteger(data.chargeDay);
  if (chargeDay) {
    entry.chargeDay = clampChargeDay(chargeDay);
  }

  const installmentGroupId = firstString(data.installmentGroupId);
  if (installmentGroupId) {
    entry.installmentGroupId = installmentGroupId;
  }

  const sourceFixedId = firstString(data.sourceFixedId);
  if (sourceFixedId) {
    entry.sourceFixedId = sourceFixedId;
  }

  const templateId = firstString(data.templateId);
  if (templateId) {
    entry.templateId = templateId;
  }

  const importHash = firstString(data.importHash);
  if (importHash) {
    entry.importHash = importHash;
  }

  const importSource = firstString(data.importSource);
  if (importSource) {
    entry.importSource = importSource;
  }

  const importFingerprint = firstString(data.importFingerprint);
  if (importFingerprint) {
    entry.importFingerprint = importFingerprint;
  }

  if (updatedAt) {
    entry.updatedAt = updatedAt;
  }

  if (updatedBy) {
    entry.updatedBy = updatedBy;
  }

  return entry;
}

function needsRecordBackfill(raw: LegacyRecord, entry: EntryDoc): boolean {
  const rawType = firstString(raw.type, raw.entryType, raw.kind).toLowerCase();
  const rawCreatedBy = firstString(raw.createdBy, raw.userEmail, raw.ownerEmail, raw.email).toLowerCase();
  const rawMonthKey = normalizeMonthKey(raw.monthKey, raw.month, raw.date, raw.createdAt);
  const rawDate = normalizeISODate(raw.date);
  const rawUserKey = firstString(raw.userKey).toUpperCase();
  const rawSubType = firstString(raw.subType, raw.sourceType).toLowerCase();

  return (
    firstString(raw.householdId) !== entry.householdId ||
    firstString(raw.ownerUid, raw.uid) !== entry.ownerUid ||
    rawCreatedBy !== entry.createdBy ||
    rawType !== entry.type ||
    rawMonthKey !== entry.monthKey ||
    rawDate !== entry.date ||
    rawUserKey !== entry.userKey ||
    (entry.subType ? rawSubType !== entry.subType : Boolean(rawSubType)) ||
    !Number.isFinite(Number(raw.amount))
  );
}

function matchesContextRecord(raw: LegacyRecord, context: SessionContext): boolean {
  const rawHouseholdId = firstString(raw.householdId);
  if (rawHouseholdId) {
    return rawHouseholdId === context.householdId;
  }

  const rawEmail = firstString(raw.createdBy, raw.userEmail, raw.ownerEmail, raw.email).toLowerCase();
  return ALLOWED_EMAIL_LIST.includes(rawEmail);
}

async function backfillLegacyTemplate(item: LoadedFixedTemplate, context: SessionContext): Promise<void> {
  if (!needsTemplateBackfill(item.raw, item.template)) return;

  const { id, ...payload } = item.template;
  await setDoc(
    doc(db, "fixed_templates", id),
    {
      ...payload,
      updatedAt: Date.now(),
      updatedBy: context.email,
    },
    { merge: true }
  );
}

function isPermissionDeniedError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const code = String((error as { code?: unknown }).code || "");
  return code.toLowerCase().includes("permission-denied");
}

async function readFixedTemplates(
  label: string,
  loader: () => Promise<QuerySnapshot>,
  options?: { optional?: boolean }
) {
  try {
    const snapshot = await loader();
    console.info(`[monthly-balance] fixed_templates query ${label} ${APP_BUILD}`, {
      count: snapshot.docs.length,
    });
    return snapshot;
  } catch (error) {
    if (options?.optional && isPermissionDeniedError(error)) {
      console.info(`[monthly-balance] fixed_templates query skipped ${label} ${APP_BUILD}`, {
        reason: "permission-denied",
      });
      return null;
    }

    console.warn(`[monthly-balance] fixed_templates query failed ${label} ${APP_BUILD}`, error);
    return null;
  }
}
async function loadFixedTemplates(context: SessionContext): Promise<LoadedFixedTemplate[]> {
  const byId = new Map<string, LegacyFixedTemplateRecord>();
  const snapshots: Array<QuerySnapshot | null> = [];

  const householdSnapshot = await readFixedTemplates("household", () =>
    getDocs(query(collection(db, "fixed_templates"), where("householdId", "==", context.householdId)))
  );
  snapshots.push(householdSnapshot);

  const shouldTryLegacyFallback =
    !attemptedLegacyTemplateFallback && (!householdSnapshot || householdSnapshot.docs.length === 0);

  if (shouldTryLegacyFallback) {
    attemptedLegacyTemplateFallback = true;

    const createdBySnapshot = await readFixedTemplates(
      "createdBy",
      () => getDocs(query(collection(db, "fixed_templates"), where("createdBy", "in", [...ALLOWED_EMAIL_LIST]))),
      { optional: true }
    );
    snapshots.push(createdBySnapshot);

    const userEmailSnapshot = await readFixedTemplates(
      "userEmail",
      () => getDocs(query(collection(db, "fixed_templates"), where("userEmail", "in", [...ALLOWED_EMAIL_LIST]))),
      { optional: true }
    );
    snapshots.push(userEmailSnapshot);

    if (!createdBySnapshot && !userEmailSnapshot) {
      const allSnapshot = await readFixedTemplates("all", () => getDocs(collection(db, "fixed_templates")), {
        optional: true,
      });
      snapshots.push(allSnapshot);
    }
  }

  for (const snapshot of snapshots) {
    if (!snapshot) continue;
    snapshot.docs.forEach((templateDoc) => {
      if (!byId.has(templateDoc.id)) {
        byId.set(templateDoc.id, templateDoc.data() as LegacyFixedTemplateRecord);
      }
    });
  }

  const loaded = Array.from(byId.entries())
    .map(([id, raw]) => ({
      raw,
      template: normalizeFixedTemplate(id, raw, context),
    }))
    .filter(({ template }) => template.amount > 0);

  console.info(`[monthly-balance] fixed_templates normalized ${APP_BUILD}`, {
    householdId: context.householdId,
    count: loaded.length,
    ids: loaded.map(({ template }) => template.id),
  });

  await Promise.all(loaded.map((item) => backfillLegacyTemplate(item, context).catch(() => undefined)));

  return loaded;
}

async function backfillLegacyRecord(item: LoadedRecord, context: SessionContext): Promise<void> {
  if (!needsRecordBackfill(item.raw, item.entry)) return;

  const { id, ...payload } = item.entry;
  await setDoc(
    doc(db, "records", id),
    {
      ...payload,
      updatedAt: Date.now(),
      updatedBy: context.email,
    },
    { merge: true }
  );
}

async function readRecords(
  label: string,
  loader: () => Promise<QuerySnapshot>,
  options?: { optional?: boolean }
) {
  try {
    const snapshot = await loader();
    console.info(`[monthly-balance] records query ${label} ${APP_BUILD}`, {
      count: snapshot.docs.length,
    });
    return snapshot;
  } catch (error) {
    if (options?.optional && isPermissionDeniedError(error)) {
      console.info(`[monthly-balance] records query skipped ${label} ${APP_BUILD}`, {
        reason: "permission-denied",
      });
      return null;
    }

    console.warn(`[monthly-balance] records query failed ${label} ${APP_BUILD}`, error);
    return null;
  }
}
async function loadRecords(context: SessionContext): Promise<LoadedRecord[]> {
  const byId = new Map<string, LegacyRecord>();
  const snapshots: Array<QuerySnapshot | null> = [];

  const householdSnapshot = await readRecords("household", () =>
    getDocs(query(collection(db, "records"), where("householdId", "==", context.householdId)))
  );
  snapshots.push(householdSnapshot);

  const shouldTryLegacyFallback =
    !attemptedLegacyRecordFallback && (!householdSnapshot || householdSnapshot.docs.length === 0);

  if (shouldTryLegacyFallback) {
    attemptedLegacyRecordFallback = true;

    const createdBySnapshot = await readRecords(
      "createdBy",
      () => getDocs(query(collection(db, "records"), where("createdBy", "in", [...ALLOWED_EMAIL_LIST]))),
      { optional: true }
    );
    snapshots.push(createdBySnapshot);

    const userEmailSnapshot = await readRecords(
      "userEmail",
      () => getDocs(query(collection(db, "records"), where("userEmail", "in", [...ALLOWED_EMAIL_LIST]))),
      { optional: true }
    );
    snapshots.push(userEmailSnapshot);

    if (!createdBySnapshot && !userEmailSnapshot) {
      const allSnapshot = await readRecords("all", () => getDocs(collection(db, "records")), {
        optional: true,
      });
      snapshots.push(allSnapshot);
    }
  }

  for (const snapshot of snapshots) {
    snapshot?.docs.forEach((recordDoc) => {
      const raw = recordDoc.data() as LegacyRecord;
      if (!matchesContextRecord(raw, context) || byId.has(recordDoc.id)) return;

      byId.set(recordDoc.id, raw);
    });
  }

  const loaded = Array.from(byId.entries())
    .map(([id, raw]) => ({
      raw,
      entry: normalizeRecord(id, raw, context),
    }))
    .filter(({ entry }) => entry.amount > 0 && Boolean(entry.monthKey));

  console.info(`[monthly-balance] records normalized ${APP_BUILD}`, {
    householdId: context.householdId,
    count: loaded.length,
    months: Array.from(new Set(loaded.map(({ entry }) => entry.monthKey))).sort(),
  });

  await Promise.all(loaded.map((item) => backfillLegacyRecord(item, context).catch(() => undefined)));

  return loaded;
}

export async function ensureFixedRealizationsForMonth(targetMonthKey: string): Promise<void> {
  const context = requireSessionContext();
  const templates = await loadFixedTemplates(context);

  if (!templates.length) {
    console.info(`[monthly-balance] fixed_realizations ${APP_BUILD}`, {
      targetMonthKey,
      templates: 0,
      created: 0,
    });
    return;
  }

  const batch = writeBatch(db);
  let writes = 0;
  let activeTemplates = 0;
  const createdAtBase = Date.now();
  const existingFixedRecordIds = new Set<string>();
  const existingFixedTemplateIds = new Set<string>();

  const monthSnapshot = await getDocs(
    query(
      collection(db, "records"),
      where("householdId", "==", context.householdId),
      where("monthKey", "==", targetMonthKey)
    )
  );

  monthSnapshot.forEach((recordDoc) => {
    const data = recordDoc.data() as Partial<EntryDoc>;
    if (data.subType !== "fixed_realization") return;

    existingFixedRecordIds.add(recordDoc.id);

    const templateId = String(data.templateId || "").trim();
    if (templateId) {
      existingFixedTemplateIds.add(templateId);
      return;
    }

    const legacyTemplateId = templateIdFromFixedRealizationRecordId(recordDoc.id, targetMonthKey);
    if (legacyTemplateId) {
      existingFixedTemplateIds.add(legacyTemplateId);
    }
  });

  for (const { template } of templates) {
    if (!template.isActive) continue;
    if (!shouldCreateRealizationForMonth(template.startDate, targetMonthKey)) continue;

    activeTemplates += 1;

    const existingIds = fixedRealizationIds(targetMonthKey, template.id);
    const alreadyExists =
      existingFixedTemplateIds.has(template.id) || existingIds.some((recordId) => existingFixedRecordIds.has(recordId));

    if (alreadyExists) continue;

    const recordRef = doc(db, "records", `fx__${targetMonthKey}__${template.id}`);

    batch.set(recordRef, {
      type: "expense",
      subType: "fixed_realization",
      monthKey: targetMonthKey,
      date: `${targetMonthKey}-${String(template.chargeDay).padStart(2, "0")}`,
      category: template.category,
      description: template.description,
      amount: template.amount,
      chargeDay: template.chargeDay,
      templateId: template.id,
      source: "fixed_template",
      createdBy: context.email,
      ownerUid: context.uid,
      householdId: context.householdId,
      userKey: context.userKey,
      createdAt: createdAtBase + writes,
    });

    existingFixedRecordIds.add(recordRef.id);
    existingFixedTemplateIds.add(template.id);
    writes += 1;
  }

  if (writes > 0) {
    await batch.commit();
  }

  console.info(`[monthly-balance] fixed_realizations ${APP_BUILD}`, {
    targetMonthKey,
    templates: templates.length,
    activeTemplates,
    created: writes,
  });
}

export async function listAvailableMonthKeys(): Promise<string[]> {
  const context = requireSessionContext();
  const loaded = await loadRecords(context);

  const monthKeys = new Set<string>();
  loaded.forEach(({ entry }) => {
    if (entry.monthKey) monthKeys.add(entry.monthKey);
  });

  return Array.from(monthKeys).sort((left, right) => right.localeCompare(left));
}

export async function listMonthEntries(monthKey: string): Promise<EntryDoc[]> {
  const context = requireSessionContext();
  await ensureFixedRealizationsForMonth(monthKey);
  const loaded = await loadRecords(context);
  const items = loaded
    .map(({ entry }) => entry)
    .filter((entry) => entry.monthKey === monthKey);

  console.info(`[monthly-balance] records month ${APP_BUILD}`, {
    monthKey,
    count: items.length,
    fixed: items.filter((entry) => entry.type === "expense" && entry.subType === "fixed_realization").length,
  });

  return sortEntriesByDisplayDate(items);
}

export async function listVariableExpenseTrend(monthKeys: string[]): Promise<Array<{ month: string; value: number }>> {
  if (!monthKeys.length) return [];

  const context = requireSessionContext();
  const totals = new Map<string, number>();
  monthKeys.forEach((monthKey) => totals.set(monthKey, 0));
  const loaded = await loadRecords(context);

  loaded.forEach(({ entry }) => {
    if (entry.type !== "expense" || !totals.has(entry.monthKey) || isFixedExpense(entry)) return;

    totals.set(entry.monthKey, (totals.get(entry.monthKey) || 0) + Number(entry.amount || 0));
  });

  return monthKeys.map((month) => ({ month, value: totals.get(month) || 0 }));
}

export async function listFixedTemplates(): Promise<FixedExpenseDoc[]> {
  const context = requireSessionContext();
  const loaded = await loadFixedTemplates(context);

  return loaded
    .map(({ template }) => template)
    .sort((left, right) => {
      if (left.isActive !== right.isActive) return Number(right.isActive) - Number(left.isActive);
      if (left.chargeDay !== right.chargeDay) return left.chargeDay - right.chargeDay;
      return left.category.localeCompare(right.category, "he");
    });
}

export async function saveFixedTemplate(input: FixedTemplateInput): Promise<string> {
  const context = requireSessionContext();
  const now = Date.now();
  const chargeDay = clampChargeDay(input.chargeDay);
  const category = String(input.category || "").trim();
  const description = String(input.description || "").trim();
  const startDate = normalizeISODate(input.startDate);
  const amount = Number(input.amount || 0);

  if (!category) throw new Error("׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ³׳’ג‚¬ג„¢׳³ג€™׳’ג€ֲ¬ײ²ֲ׳²ֲ²ײ²ֲ¢׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ²ײ²ֲ²׳²ֲ²ײ²ֲ© ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ²ײ²ֲ²׳²ֲ²ײ²ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ³׳’ג‚¬ג„¢׳³ג€™׳’ג‚¬ֲײ²ֲ¬׳²ֲ»ײ²ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ³׳’ג‚¬ג„¢׳³ג€™׳’ג‚¬ֲײ²ֲ¬׳³ג€™׳’ג€ֲ¬ײ²ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ³׳’ג‚¬ג„¢׳³ג€™׳’ג‚¬ֲײ²ֲ¬׳²ֲ²ײ²ֲ¢׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ²ײ²ֲ²׳²ֲ²ײ²ֲ¨ ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ²ײ²ֲ²׳²ֲ²ײ²ֲ§׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ²ײ²ֲ»׳²ֲ²ײ²ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ³׳’ג‚¬ג„¢׳³ג€™׳’ג‚¬ֲײ²ֲ¬׳³ג€™׳’ג‚¬ֲײ²ֲ¢׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ³׳’ג‚¬ג„¢׳³ג€™׳’ג‚¬ֲײ²ֲ¬׳²ֲ²ײ²ֲ¢׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ²ײ²ֲ²׳²ֲ²ײ²ֲ¨׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ³׳’ג‚¬ג„¢׳³ג€™׳’ג€ֲ¬ײ²ֲ׳²ֲ²ײ²ֲ¢׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ³׳’ג‚¬ג„¢׳³ג€™׳’ג‚¬ֲײ²ֲ¬׳²ֲ²ײ²ֲ ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ²ײ²ֲ²׳²ֲ²ײ²ֲ§׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ³׳’ג‚¬ג„¢׳³ג€™׳’ג‚¬ֲײ²ֲ¬׳²ֲ»ײ²ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ³׳’ג‚¬ג„¢׳³ג€™׳’ג‚¬ֲײ²ֲ¬׳²ֲ²ײ²ֲ¢׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ²ײ²ֲ²׳²ֲ²ײ²ֲ¢׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ³׳’ג‚¬ג„¢׳³ג€™׳’ג‚¬ֲײ²ֲ¬׳²ֲ²ײ²ֲ.");
  if (!startDate) throw new Error("׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ³׳’ג‚¬ג„¢׳³ג€™׳’ג€ֲ¬ײ²ֲ׳²ֲ²ײ²ֲ¢׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ²ײ²ֲ²׳²ֲ²ײ²ֲ© ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ²ײ²ֲ²׳²ֲ²ײ²ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ³׳’ג‚¬ג„¢׳³ג€™׳’ג‚¬ֲײ²ֲ¬׳²ֲ»ײ²ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ³׳’ג‚¬ג„¢׳³ג€™׳’ג‚¬ֲײ²ֲ¬׳³ג€™׳’ג€ֲ¬ײ²ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ³׳’ג‚¬ג„¢׳³ג€™׳’ג‚¬ֲײ²ֲ¬׳²ֲ²ײ²ֲ¢׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ²ײ²ֲ²׳²ֲ²ײ²ֲ¨ ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ²ײ²ֲ³׳³ג€™׳’ג€ֲ¬׳’ג‚¬ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ²ײ²ֲ²׳²ֲ²ײ²ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ²ײ²ֲ²׳²ֲ²ײ²ֲ¨׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ³׳’ג‚¬ג„¢׳³ג€™׳’ג€ֲ¬ײ²ֲ׳²ֲ²ײ²ֲ¢׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ²ײ²ֲ²׳²ֲ²ײ²ֲ ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ³׳’ג‚¬ג„¢׳³ג€™׳’ג‚¬ֲײ²ֲ¬׳²ֲ²ײ²ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ²ײ²ֲ³׳³ג€™׳’ג€ֲ¬׳’ג‚¬ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ³׳’ג‚¬ג„¢׳³ג€™׳’ג‚¬ֲײ²ֲ¬׳³ג€™׳’ג€ֲ¬ײ²ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ²ײ²ֲ²׳²ֲ²ײ²ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ³׳’ג‚¬ג„¢׳³ג€™׳’ג‚¬ֲײ²ֲ¬׳²ֲ²ײ²ֲ.");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ³׳’ג‚¬ג„¢׳³ג€™׳’ג€ֲ¬ײ²ֲ׳²ֲ²ײ²ֲ¢׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ²ײ²ֲ²׳²ֲ²ײ²ֲ© ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ²ײ²ֲ²׳²ֲ²ײ²ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ³׳’ג‚¬ג„¢׳³ג€™׳’ג‚¬ֲײ²ֲ¬׳²ֲ²ײ²ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ³׳’ג‚¬ג„¢׳³ג€™׳’ג‚¬ֲײ²ֲ¬׳³ג€™׳’ג€ֲ¬ײ²ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ³׳’ג‚¬ג„¢׳³ג€™׳’ג€ֲ¬ײ²ֲ׳²ֲ²ײ²ֲ¢׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ²ײ²ֲ²׳²ֲ²ײ²ֲ ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ²ײ²ֲ²׳²ֲ²ײ²ֲ¡׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ³׳’ג‚¬ג„¢׳³ג€™׳’ג‚¬ֲײ²ֲ¬׳²ֲ³ײ²ֲ·׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ³׳’ג‚¬ג„¢׳³ג€™׳’ג‚¬ֲײ²ֲ¬׳²ֲ²ײ²ֲ¢׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ²ײ²ֲ²׳²ֲ²ײ²ֲ ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ²ײ²ֲ³׳³ג€™׳’ג€ֲ¬׳’ג‚¬ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ²ײ²ֲ²׳²ֲ²ײ²ֲ§׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ³׳’ג‚¬ג„¢׳³ג€™׳’ג€ֲ¬ײ²ֲ׳²ֲ²ײ²ֲ¢׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ³׳³ֲ²ײ²ֲ²׳²ֲ²ײ²ֲ.");

  const reference = input.id ? doc(db, "fixed_templates", input.id) : doc(collection(db, "fixed_templates"));
  const existingSnapshot = input.id ? await getDoc(reference) : null;
  const existingTemplate = existingSnapshot?.exists()
    ? normalizeFixedTemplate(reference.id, existingSnapshot.data() as LegacyFixedTemplateRecord, context)
    : null;

  await setDoc(reference, {
    category,
    description,
    amount,
    chargeDay,
    startDate,
    isActive: input.isActive,
    householdId: context.householdId,
    createdAt: Number(existingTemplate?.createdAt || now),
    createdBy: String(existingTemplate?.createdBy || context.email),
    updatedAt: now,
    updatedBy: context.email,
  });

  console.info(`[monthly-balance] fixed_template saved ${APP_BUILD}`, {
    id: reference.id,
    category,
    amount,
    startDate,
    isActive: input.isActive,
  });

  if (input.isActive) {
    const monthsToEnsure = Array.from(new Set([currentMonthKey(), monthKeyFromISO(startDate)]));
    for (const monthKey of monthsToEnsure) {
      await ensureFixedRealizationsForMonth(monthKey);
    }
  }

  return reference.id;
}

export async function deleteFixedTemplate(templateId: string): Promise<void> {
  requireSessionContext();
  await deleteDoc(doc(db, "fixed_templates", templateId));
  console.info(`[monthly-balance] fixed_template deleted ${APP_BUILD}`, { templateId });
}

export async function updateEntryRecord(
  entryId: string,
  patch: Pick<EntryDoc, "date" | "category" | "description" | "amount">
): Promise<void> {
  const context = requireSessionContext();

  await updateDoc(doc(db, "records", entryId), {
    date: patch.date,
    monthKey: monthKeyFromISO(patch.date),
    category: patch.category,
    description: patch.description,
    amount: patch.amount,
    updatedAt: Date.now(),
    updatedBy: context.email,
  });
}

export async function deleteEntryRecord(entryId: string): Promise<void> {
  requireSessionContext();
  await deleteDoc(doc(db, "records", entryId));
}