"use strict";

const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

if (!admin.apps.length) admin.initializeApp();

const OPENAI_ENDPOINT = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-4.1-mini";
const DEFAULT_ALLOWED_EMAILS = ["k.wiaam@gmail.com", "boshra.kablawi@gmail.com"];
const ALLOWED_ORIGIN = String(process.env.APP_ORIGIN || "https://monthly-balance-548d1.web.app").trim();

function sendCors(res) {
  res.set("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
}

function allowedEmailsSet() {
  const raw = String(process.env.ALLOWED_EMAILS || "").trim();
  const list = raw
    ? raw.split(",").map((v) => v.trim().toLowerCase()).filter(Boolean)
    : DEFAULT_ALLOWED_EMAILS;
  return new Set(list);
}

// ─── GPT prompt ──────────────────────────────────────────────────────────────

const CATEGORIES = [
  "סופר ומזון",
  "מסעדות ובתי קפה",
  "תחבורה ודלק",
  "חשבונות בית",
  "ילדים וחינוך",
  "בריאות ופארם",
  "בילויים ופנאי",
  "קניות לבית",
  "אחר",
];

const SYSTEM_PROMPT = `You extract financial transactions from screenshots.
The screenshots may come from Israeli banking apps (Max, Isracard, Leumi, Hapoalim, Cal, etc.) or any other transaction table.
Text may be in Hebrew (right-to-left) or English.

Rules:
- Extract EVERY visible transaction row.
- Ignore: page headers, navigation tabs, section labels (like "עסקאות שאושרו"), action buttons (like "חלוקה לתשלומים"), icons, and decorative elements.
- date: normalize to YYYY-MM-DD. Two-digit years → 20YY. Format DD.MM.YY is common in Israeli apps.
- amount: always a positive number (absolute value).
- transactionType: "expense" for charges/debits/חיוב. "income" for credits/refunds/reversals/זיכוי/ביטול/החזר. "unknown" only when the row gives no signal at all.
- merchant: the business name exactly as shown, stripped of UI decoration only.
- category: assign the best matching category from this exact list based on the merchant name:
  ${CATEGORIES.join(", ")}
  Use "אחר" only when none of the others fit.
  Examples: supermarket/סופר/מינימרקט → "סופר ומזון", restaurant/cafe/pizza → "מסעדות ובתי קפה", fuel/parking/דלק/חניה → "תחבורה ודלק", pharmacy/clinic/קופת חולים → "בריאות ופארם", Netflix/cinema/sport → "בילויים ופנאי", electricity/water/gas/ועד בית → "חשבונות בית", school/kindergarten/tutor → "ילדים וחינוך", furniture/home goods/cleaning → "קניות לבית".`;

const USER_PROMPT = `Extract all transaction rows from this screenshot and return them as JSON.`;

function buildRequest(dataUrl) {
  return {
    model: String(process.env.OPENAI_OCR_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: SYSTEM_PROMPT }],
      },
      {
        role: "user",
        content: [
          { type: "input_text", text: USER_PROMPT },
          { type: "input_image", image_url: dataUrl },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "transaction_import",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            transactions: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  date: { type: "string" },
                  merchant: { type: "string" },
                  category: { type: "string" },
                  transactionType: {
                    type: "string",
                    enum: ["expense", "income", "unknown"],
                  },
                  amount: { type: "number" },
                },
                required: ["date", "merchant", "category", "transactionType", "amount"],
              },
            },
          },
          required: ["transactions"],
        },
      },
    },
  };
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function extractOutputText(responseJson) {
  if (typeof responseJson?.output_text === "string" && responseJson.output_text.trim()) {
    return responseJson.output_text.trim();
  }
  const chunks = [];
  for (const item of responseJson?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === "string" && content.text.trim()) {
        chunks.push(content.text.trim());
      }
    }
  }
  return chunks.join("\n").trim();
}

function sanitizeJson(raw) {
  return String(raw || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function parseDate(raw) {
  const s = String(raw || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[./\-](\d{1,2})[./\-](\d{2,4})$/);
  if (!m) return null;
  const day = m[1].padStart(2, "0");
  const month = m[2].padStart(2, "0");
  const year = m[3].length === 2 ? `20${m[3]}` : m[3];
  if (Number(day) < 1 || Number(day) > 31 || Number(month) < 1 || Number(month) > 12) return null;
  return `${year}-${month}-${day}`;
}

function normalizeTransactions(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  return raw.flatMap((t) => {
    const date = parseDate(String(t?.date ?? ""));
    const merchant = String(t?.merchant ?? "").trim();
    const amount = Math.abs(Number(t?.amount ?? 0));
    const type = ["expense", "income", "unknown"].includes(t?.transactionType)
      ? t.transactionType
      : "unknown";
    const category = String(t?.category ?? "").trim();

    if (!date || !merchant || !Number.isFinite(amount) || amount <= 0) return [];

    const key = `${date}|${amount.toFixed(2)}|${merchant.toLowerCase()}`;
    if (seen.has(key)) return [];
    seen.add(key);

    return [{ date, merchant, category, transactionType: type, amount }];
  });
}

// ─── GPT call ────────────────────────────────────────────────────────────────

async function extractWithGpt(apiKey, dataUrl, label) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 28_000);

  try {
    const res = await fetch(OPENAI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(buildRequest(dataUrl)),
      signal: controller.signal,
    });

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      logger.warn("GPT request failed", {
        label,
        status: res.status,
        error: json?.error?.message ?? json?.error ?? null,
      });
      return { errorCode: "OCR_UPSTREAM_FAILED" };
    }

    const text = sanitizeJson(extractOutputText(json));
    if (!text) {
      logger.warn("GPT returned empty output", { label });
      return { errorCode: "NO_TEXT_DETECTED" };
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      logger.warn("GPT returned invalid JSON", { label, message: err?.message });
      return { errorCode: "OCR_UPSTREAM_FAILED" };
    }

    const transactions = normalizeTransactions(parsed?.transactions);
    if (!transactions.length) {
      logger.warn("GPT found no transactions", { label });
      return { errorCode: "NO_TEXT_DETECTED" };
    }

    logger.info("GPT extracted transactions", { label, count: transactions.length });
    return { transactions };
  } catch (err) {
    if (err?.name === "AbortError") {
      logger.warn("GPT timed out", { label });
      return { errorCode: "OCR_UPSTREAM_TIMEOUT" };
    }
    logger.warn("GPT call failed", { label, message: err?.message });
    return { errorCode: "OCR_UPSTREAM_FAILED" };
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Cloud Function ───────────────────────────────────────────────────────────

exports.ocrParse = onRequest(
  {
    region: "us-central1",
    timeoutSeconds: 90,
    memory: "256MiB",
    invoker: "public",
    secrets: ["OPENAI_API_KEY"],
  },
  async (req, res) => {
    sendCors(res);

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
      return;
    }

    // Auth
    const authHeader = String(req.headers.authorization || "");
    if (!authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "UNAUTHORIZED" });
      return;
    }
    const idToken = authHeader.slice(7).trim();
    if (!idToken) {
      res.status(401).json({ error: "UNAUTHORIZED" });
      return;
    }

    let decoded;
    try {
      decoded = await admin.auth().verifyIdToken(idToken);
    } catch {
      res.status(401).json({ error: "UNAUTHORIZED" });
      return;
    }

    const email = String(decoded?.email ?? "").toLowerCase().trim();
    if (!email || !allowedEmailsSet().has(email)) {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }

    // API key
    const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
    if (!apiKey) {
      res.status(422).json({ error: "OCR_CONFIG_MISSING" });
      return;
    }

    // Image
    const rawImage = String(req.body?.imageBase64 ?? "").trim();
    if (!rawImage || rawImage.length > 14_000_000) {
      res.status(400).json({ error: "INVALID_IMAGE_PAYLOAD" });
      return;
    }
    const dataUrl = rawImage.startsWith("data:") ? rawImage : `data:image/jpeg;base64,${rawImage}`;

    // Extract
    try {
      const result = await extractWithGpt(apiKey, dataUrl, "main");
      if (result.transactions?.length) {
        res.status(200).json({ transactions: result.transactions });
        return;
      }

      res.status(422).json({ error: result.errorCode || "NO_TEXT_DETECTED" });
    } catch (err) {
      logger.error("OCR parse failed", { message: err?.message, stack: err?.stack });
      res.status(500).json({ error: "OCR_INTERNAL_ERROR" });
    }
  }
);
