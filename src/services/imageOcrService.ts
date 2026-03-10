import { auth } from "./firebase";

export type OcrWord = {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
};

export type OcrLine = {
  text: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
  words: OcrWord[];
};

export type ParsedImageExpense = {
  date: string;
  amount: number;
  description: string;
  category: string;
  rawCategory: string;
  rawType: string;
};

export type ParsedImageImport = {
  hash: string;
  sourceName: string;
  parsedText: string;
  overlayLines: OcrLine[];
  expenses: ParsedImageExpense[];
};

type OcrResponseJson = {
  parsedText?: string;
  overlayLines?: Array<{
    text?: string;
    left?: number;
    right?: number;
    top?: number;
    bottom?: number;
    words?: Array<{
      text?: string;
      left?: number;
      top?: number;
      width?: number;
      height?: number;
    }>;
  }>;
  error?: string;
};

const OCR_PARSE_ENDPOINT = String(import.meta.env.VITE_OCR_PARSE_ENDPOINT || "/api/ocr/parse").trim();

const SOURCE_TYPE_KEYWORDS = [
  "רגילה",
  "עסקה רגילה",
  "בתשלומים",
  "קרדיט",
  "זיכוי",
  "חיוב",
  "הוראת קבע",
  "משיכה",
];

const CATEGORY_KEYWORDS: Array<{ category: string; keywords: string[] }> = [
  { category: "מזון", keywords: ["מזון", "צריכה", "מסעד", "קפה", "מכולת", "סופר", "מאפ", "food", "market"] },
  { category: "רכב", keywords: ["רכב", "דלק", "פז", "סונול", "חניה", "כביש", "fuel", "parking"] },
  { category: "חשבונות", keywords: ["חשמל", "מים", "ארנונה", "גז", "חשבון", "bill", "utility"] },
  { category: "תקשורת", keywords: ["תקשורת", "סלולר", "אינטרנט", "טלפון", "פרטנר", "סלקום", "פלאפון"] },
  { category: "בריאות", keywords: ["בריאות", "מרקחת", "פארם", "קופת", "רופא", "clinic", "pharm"] },
  { category: "בילויים", keywords: ["בילוי", "קולנוע", "פנאי", "מסעד", "netflix", "spotify", "game"] },
  { category: "דיור", keywords: ["דיור", "שכירות", "משכנת", "ועד בית", "home", "rent"] },
  { category: "חינוך", keywords: ["חינוך", "לימוד", "בית ספר", "גן", "school"] },
];

const MERCHANT_CATEGORY_OVERRIDES: Array<{ pattern: RegExp; category: string }> = [
  { pattern: /max\s*stock|מקס\s*סטוק/iu, category: "אחר" },
  { pattern: /מאפ|bakery|boulanger/i, category: "מזון" },
];

const HEADER_PATTERNS = [/ת\.?\s*עסקה/u, /שם\s+בית\s+העסק/u, /קטגוריה/u, /סוג\s+עסקה/u, /סכום/u];
const NOISE_PATTERNS = [/חלקו/u, /לתשלומים/u, /לתשלום/u];

export async function parseImageFileToExpenses(file: File): Promise<ParsedImageImport> {
  const hash = await fileSha256(file);
  const ocr = await extractOcrFromImage(file);
  const expenses = parseExpensesFromOverlay(ocr.overlayLines);
  const fallbackExpenses = expenses.length ? expenses : parseExpensesFromOCRText(ocr.parsedText);

  if (!fallbackExpenses.length) {
    throw new Error("לא זוהו עסקאות תקינות בתמונה.");
  }

  return {
    hash,
    sourceName: file.name,
    parsedText: ocr.parsedText,
    overlayLines: ocr.overlayLines,
    expenses: dedupeExpenses(fallbackExpenses),
  };
}

export async function fileSha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function dedupeExpenses(expenses: ParsedImageExpense[]): ParsedImageExpense[] {
  const seen = new Set<string>();
  const unique: ParsedImageExpense[] = [];

  for (const expense of expenses) {
    const fingerprint = [expense.date, expense.amount.toFixed(2), normalizeFingerprintText(expense.description)].join("|");
    if (seen.has(fingerprint)) continue;

    seen.add(fingerprint);
    unique.push(expense);
  }

  return unique;
}

async function extractOcrFromImage(file: File): Promise<{ parsedText: string; overlayLines: OcrLine[] }> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("יש להתחבר מחדש כדי לנתח תמונה.");
  }

  const idToken = await user.getIdToken();
  const imageBase64 = await fileToDataUrl(file);

  const response = await fetch(OCR_PARSE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      imageBase64,
      language: "auto",
      ocrEngine: 3,
      isOverlayRequired: false,
      detectOrientation: true,
      scale: true,
      isTable: true,
    }),
  });

  let json: OcrResponseJson | null = null;
  try {
    json = (await response.json()) as OcrResponseJson;
  } catch {
    json = null;
  }

  if (!response.ok) {
    const errorCode = String(json?.error || "");
    if (errorCode === "UNAUTHORIZED") throw new Error("נדרש להתחבר מחדש כדי לבצע OCR.");
    if (errorCode === "FORBIDDEN") throw new Error("החשבון הנוכחי אינו מורשה לניתוח OCR.");
    if (errorCode === "NO_TEXT_DETECTED") throw new Error("לא זוהה טקסט בתמונה שנבחרה.");
    if (errorCode === "OCR_CONFIG_MISSING") throw new Error("שירות OCR לא מוגדר בשרת. יש להגדיר OCR_SPACE_API_KEY בפונקציית Firebase.");
    if (errorCode === "OCR_UPSTREAM_FAILED") throw new Error("שירות OCR החיצוני נכשל. אפשר לנסות שוב בעוד רגע.");
    if (errorCode === "OCR_UPSTREAM_TIMEOUT") throw new Error("שירות OCR לקח יותר מדי זמן. כדאי לנסות צילום קטן יותר או לנסות שוב.");
    throw new Error("שירות OCR אינו זמין כרגע.");
  }

  const parsedText = String(json?.parsedText || "").trim();
  const overlayLines = normalizeOverlayLines(json?.overlayLines || []);

  if (!parsedText && !overlayLines.length) {
    throw new Error("לא זוהה טקסט בתמונה שנבחרה.");
  }

  return { parsedText, overlayLines };
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("שגיאה בקריאת קובץ התמונה."));
    reader.readAsDataURL(file);
  });
}

function normalizeOverlayLines(rawLines: OcrResponseJson["overlayLines"]): OcrLine[] {
  return (rawLines || [])
    .map((line) => {
      const words = (line?.words || [])
        .map((word) => {
          const text = String(word?.text || "").trim();
          const left = Number(word?.left || 0);
          const top = Number(word?.top || 0);
          const width = Number(word?.width || 0);
          const height = Number(word?.height || 0);

          if (!text) return null;

          return {
            text,
            left,
            top,
            width,
            height,
            right: left + Math.max(width, 0),
            bottom: top + Math.max(height, 0),
          } satisfies OcrWord;
        })
        .filter((word): word is OcrWord => Boolean(word));

      const text = String(line?.text || words.map((word) => word.text).join(" ")).trim();
      const hasLeft = typeof line?.left === "number" && Number.isFinite(line.left);
      const hasRight = typeof line?.right === "number" && Number.isFinite(line.right);
      const hasTop = typeof line?.top === "number" && Number.isFinite(line.top);
      const hasBottom = typeof line?.bottom === "number" && Number.isFinite(line.bottom);
      const left = hasLeft ? Number(line?.left) : words.length ? Math.min(...words.map((word) => word.left)) : 0;
      const right = hasRight ? Number(line?.right) : words.length ? Math.max(...words.map((word) => word.right)) : left;
      const top = hasTop ? Number(line?.top) : words.length ? Math.min(...words.map((word) => word.top)) : 0;
      const bottom = hasBottom ? Number(line?.bottom) : words.length ? Math.max(...words.map((word) => word.bottom)) : top;

      if (!text) return null;

      return {
        text,
        left,
        right,
        top,
        bottom,
        words,
      } satisfies OcrLine;
    })
    .filter((line): line is OcrLine => Boolean(line));
}

function parseExpensesFromOverlay(lines: OcrLine[]): ParsedImageExpense[] {
  const relevantLines = lines
    .map((line) => ({
      ...line,
      text: normalizeInlineText(line.text),
    }))
    .filter((line) => !isNoiseLine(line.text));

  if (!relevantLines.length) return [];

  const rows = clusterLinesToRows(relevantLines);
  return rows.map(extractExpenseFromRow).filter((expense): expense is ParsedImageExpense => Boolean(expense));
}

function clusterLinesToRows(lines: OcrLine[]): OcrLine[][] {
  const sorted = [...lines].sort((left, right) => lineCenterY(left) - lineCenterY(right));
  const heights = sorted.map((line) => Math.max(12, line.bottom - line.top)).sort((left, right) => left - right);
  const medianHeight = heights.length ? heights[Math.floor(heights.length / 2)] : 18;
  const threshold = Math.max(14, Math.round(medianHeight * 0.75));
  const rows: OcrLine[][] = [];

  for (const line of sorted) {
    const currentCenter = lineCenterY(line);
    const lastRow = rows[rows.length - 1];

    if (!lastRow) {
      rows.push([line]);
      continue;
    }

    const lastCenter = average(lastRow.map(lineCenterY));
    if (Math.abs(currentCenter - lastCenter) <= threshold) {
      lastRow.push(line);
      continue;
    }

    rows.push([line]);
  }

  return rows;
}

function extractExpenseFromRow(rowLines: OcrLine[]): ParsedImageExpense | null {
  const lines = rowLines
    .map((line) => ({ ...line, text: normalizeInlineText(line.text) }))
    .filter((line) => line.text)
    .sort((left, right) => left.left - right.left);

  if (!lines.length) return null;

  const dateLine = findBestLine(lines, (line) => Boolean(parseDateFromText(line.text)), "right");
  const amountLine = findBestLine(lines, (line) => Boolean(parseAmountFromText(line.text)), "left");
  if (!dateLine || !amountLine) return null;

  const date = parseDateFromText(dateLine.text);
  const amount = parseAmountFromText(amountLine.text);
  if (!date || !amount || amount <= 0) return null;

  const excluded = new Set([dateLine, amountLine]);
  const typeLine = findBestLine(lines, (line) => looksLikeSourceType(line.text), "left", excluded);
  if (typeLine) excluded.add(typeLine);

  const remaining = lines.filter((line) => !excluded.has(line));
  if (!remaining.length) return null;

  const merchantLine =
    [...remaining]
      .sort((left, right) => {
        const lengthDelta = right.text.length - left.text.length;
        if (lengthDelta !== 0) return lengthDelta;
        return right.right - left.right;
      })[0] || null;

  if (!merchantLine) return null;

  const rawCategory =
    remaining
      .filter((line) => line !== merchantLine)
      .sort((left, right) => right.right - left.right)
      .map((line) => line.text)
      .join(" ")
      .trim() || "";

  const description = normalizeMerchantText(merchantLine.text);
  if (!description) return null;

  return {
    date,
    amount,
    description,
    category: detectCategory([rawCategory, description, typeLine?.text || ""].filter(Boolean).join(" ")),
    rawCategory,
    rawType: typeLine?.text || "",
  };
}

function parseExpensesFromOCRText(text: string): ParsedImageExpense[] {
  const tableExpenses = parseExpensesFromMarkdownTable(text);
  if (tableExpenses.length) return tableExpenses;

  const expenses: ParsedImageExpense[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((line) => normalizeInlineText(line))
    .filter(Boolean)
    .filter((line) => !isNoiseLine(line));

  for (const line of lines) {
    const date = parseDateFromText(line);
    if (!date) continue;

    const amount = parseAmountFromText(line);
    if (!amount || amount <= 0) continue;

    const amountMatch = line.match(/₪?\s*-?\d[\d,]*(?:[.]\d{2})?/u);
    const description = normalizeMerchantText(
      amountMatch ? line.slice(0, Math.max(0, line.lastIndexOf(amountMatch[0]))).trim() : line
    );

    if (!description) continue;

    expenses.push({
      date,
      amount,
      description,
      category: detectCategory(description),
      rawCategory: "",
      rawType: "",
    });
  }

  return expenses;
}

function parseExpensesFromMarkdownTable(text: string): ParsedImageExpense[] {
  const expenses: ParsedImageExpense[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((line) => normalizeInlineText(line))
    .filter(Boolean)
    .filter((line) => line.includes("|"));

  for (const line of lines) {
    const cells = line
      .split("|")
      .map((cell) => normalizeInlineText(cell.replace(/[:\-]+/g, " ")))
      .filter(Boolean);

    const expense = extractExpenseFromCells(cells);
    if (expense) expenses.push(expense);
  }

  return expenses;
}

function extractExpenseFromCells(cells: string[]): ParsedImageExpense | null {
  if (!cells.length) return null;

  const dateIndex = cells.findIndex((cell) => Boolean(parseDateFromText(cell)));
  const amountIndex = cells.findIndex((cell) => Boolean(parseAmountFromText(cell)));
  if (dateIndex === -1 || amountIndex === -1) return null;

  const date = parseDateFromText(cells[dateIndex]);
  const amount = parseAmountFromText(cells[amountIndex]);
  if (!date || !amount || amount <= 0) return null;

  const excluded = new Set<number>([dateIndex, amountIndex]);
  const typeIndex = cells.findIndex((cell, index) => !excluded.has(index) && looksLikeSourceType(cell));
  if (typeIndex >= 0) excluded.add(typeIndex);

  const remaining = cells.filter((_, index) => !excluded.has(index) && !isNoiseLine(cells[index]));
  if (!remaining.length) return null;

  const merchant = [...remaining].sort((left, right) => right.length - left.length)[0] || "";
  const description = normalizeMerchantText(merchant);
  if (!description) return null;

  const rawCategory = remaining.filter((cell) => cell !== merchant).join(" ").trim();

  return {
    date,
    amount,
    description,
    category: detectCategory([rawCategory, description].filter(Boolean).join(" ")),
    rawCategory,
    rawType: typeIndex >= 0 ? cells[typeIndex] : "",
  };
}

function normalizeMerchantText(raw: string): string {
  return normalizeInlineText(raw)
    .replace(/\s*•\s*/gu, " ")
    .replace(/\b(?:חלקו|לתשלומים|לתשלום)\b/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeInlineText(raw: string): string {
  return String(raw || "")
    .replace(/\u200f|\u200e/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDateFromText(raw: string): string | null {
  const match = normalizeInlineText(raw).match(/(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2,4}))?/u);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = Number(match[3]);

  if (!year) year = new Date().getFullYear();
  else if (year < 100) year += 2000;

  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseAmountFromText(raw: string): number | null {
  const matches = normalizeInlineText(raw).match(/₪?\s*-?\d[\d,]*(?:[.]\d{2})?/gu);
  if (!matches?.length) return null;

  const amountRaw = matches[matches.length - 1];
  const cleaned = amountRaw.replace(/[^\d.-]/g, "");
  const amount = Number(cleaned);
  if (!Number.isFinite(amount)) return null;
  return Math.abs(amount);
}

function detectCategory(raw: string): string {
  const normalized = normalizeFingerprintText(raw);

  for (const override of MERCHANT_CATEGORY_OVERRIDES) {
    if (override.pattern.test(raw)) return override.category;
  }

  for (const entry of CATEGORY_KEYWORDS) {
    if (entry.keywords.some((keyword) => normalized.includes(keyword))) return entry.category;
  }

  return "אחר";
}

function looksLikeSourceType(raw: string): boolean {
  const normalized = normalizeInlineText(raw);
  return SOURCE_TYPE_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function isNoiseLine(raw: string): boolean {
  const text = normalizeInlineText(raw);
  if (!text) return true;
  if (HEADER_PATTERNS.some((pattern) => pattern.test(text))) return true;
  if (NOISE_PATTERNS.some((pattern) => pattern.test(text))) return true;
  if (/^[•.\-]+$/u.test(text)) return true;
  return false;
}

function findBestLine(
  lines: OcrLine[],
  predicate: (line: OcrLine) => boolean,
  side: "left" | "right",
  excluded: Set<OcrLine> = new Set()
): OcrLine | null {
  const candidates = lines.filter((line) => !excluded.has(line) && predicate(line));
  if (!candidates.length) return null;

  return [...candidates].sort((left, right) => (side === "left" ? left.left - right.left : right.right - left.right))[0] || null;
}

function lineCenterY(line: OcrLine): number {
  return (line.top + line.bottom) / 2;
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function normalizeFingerprintText(raw: string): string {
  return normalizeInlineText(raw).toLowerCase();
}




