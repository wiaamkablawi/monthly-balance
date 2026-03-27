import { auth } from "./firebase";

export type ParsedImageExpense = {
  date: string;
  amount: number;
  description: string;
  category: string;
  rawCategory: string;
  rawType: string;
  sourceText: string;
};

export type ParsedImageImport = {
  hash: string;
  sourceName: string;
  expenses: ParsedImageExpense[];
};

type OcrTransaction = {
  date: string;
  merchant: string;
  category: string;
  transactionType: "expense" | "income" | "unknown";
  amount: number;
};

type OcrResponse = {
  transactions?: OcrTransaction[];
  error?: string;
};

const OCR_PARSE_ENDPOINT = String(import.meta.env.VITE_OCR_PARSE_ENDPOINT || "/api/ocr/parse").trim();

// Resize to at most this dimension on the long side (preserves color — no binarization).
const MAX_IMAGE_DIMENSION = 1440;

// ─── Public API ───────────────────────────────────────────────────────────────

export async function parseImageFileToExpenses(file: File): Promise<ParsedImageImport> {
  const hash = await fileSha256(file);

  const user = auth.currentUser;
  if (!user) throw new Error("יש להתחבר מחדש כדי לנתח תמונה.");

  const idToken = await user.getIdToken();
  const imageBase64 = await prepareImage(file);

  const response = await fetch(OCR_PARSE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ imageBase64 }),
  });

  let json: OcrResponse | null = null;
  try {
    json = (await response.json()) as OcrResponse;
  } catch {
    json = null;
  }

  if (!response.ok) {
    const code = String(json?.error ?? "");
    const messages: Record<string, string> = {
      UNAUTHORIZED: "נדרש להתחבר מחדש כדי לבצע OCR.",
      FORBIDDEN: "החשבון הנוכחי אינו מורשה לניתוח OCR.",
      NO_TEXT_DETECTED: "לא זוהו עסקאות בתמונה שנבחרה.",
      OCR_CONFIG_MISSING: "שירות OCR לא מוגדר. יש להגדיר OPENAI_API_KEY בפונקציית Firebase.",
    };
    const error = new Error(messages[code] ?? "שירות OCR אינו זמין כרגע.") as Error & { code?: string };
    error.code = code || "OCR_REQUEST_FAILED";
    throw error;
  }

  const rawTransactions = Array.isArray(json?.transactions) ? json.transactions : [];
  const expenses: ParsedImageExpense[] = rawTransactions.flatMap((t) => {
    const amount = Math.abs(Number(t?.amount ?? 0));
    const date = String(t?.date ?? "").trim();
    const merchant = String(t?.merchant ?? "").trim();
    if (!date || !merchant || !Number.isFinite(amount) || amount <= 0) return [];
    return [
      {
        date,
        amount,
        description: merchant,
        category: String(t?.category ?? "").trim() || "אחר",
        rawCategory: String(t?.category ?? "").trim(),
        rawType: String(t?.transactionType ?? "expense"),
        sourceText: merchant,
      },
    ];
  });

  if (!expenses.length) throw new Error("לא זוהו עסקאות תקינות בתמונה.");

  return { hash, sourceName: file.name, expenses };
}

export async function fileSha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Image preparation ────────────────────────────────────────────────────────

async function prepareImage(file: File): Promise<string> {
  const dataUrl = await readFileAsDataUrl(file);
  const img = await loadImage(dataUrl);

  if (img.width <= MAX_IMAGE_DIMENSION && img.height <= MAX_IMAGE_DIMENSION) {
    return dataUrl;
  }

  const scale = MAX_IMAGE_DIMENSION / Math.max(img.width, img.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.88);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("שגיאה בקריאת קובץ התמונה."));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("שגיאה בטעינת התמונה לניתוח OCR."));
    img.src = dataUrl;
  });
}
