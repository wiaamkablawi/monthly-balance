"use strict";

const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

const OCR_ENDPOINT = "https://api.ocr.space/parse/image";
const DEFAULT_ALLOWED_EMAILS = ["k.wiaam@gmail.com", "boshra.kablawi@gmail.com"];

function allowedEmailsSet() {
  const raw = String(process.env.ALLOWED_EMAILS || "").trim();
  const parsed = raw
    ? raw
        .split(",")
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean)
    : DEFAULT_ALLOWED_EMAILS;

  return new Set(parsed);
}

function sendCors(res) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
}

exports.ocrParse = onRequest({ region: "us-central1", timeoutSeconds: 30, memory: "256MiB" }, async (req, res) => {
  sendCors(res);

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    return;
  }

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
  } catch (err) {
    logger.warn("Invalid auth token for OCR request", err);
    res.status(401).json({ error: "UNAUTHORIZED" });
    return;
  }

  const email = String(decoded.email || "").toLowerCase().trim();
  if (!email || !allowedEmailsSet().has(email)) {
    res.status(403).json({ error: "FORBIDDEN" });
    return;
  }

  const ocrApiKey = String(process.env.OCR_SPACE_API_KEY || "").trim();
  if (!ocrApiKey) {
    logger.error("OCR_SPACE_API_KEY is missing");
    res.status(500).json({ error: "OCR_CONFIG_MISSING" });
    return;
  }

  const imageBase64 = String(req.body?.imageBase64 || "").trim();
  const language = String(req.body?.language || "heb").trim() || "heb";

  if (!imageBase64 || imageBase64.length > 14_000_000) {
    res.status(400).json({ error: "INVALID_IMAGE_PAYLOAD" });
    return;
  }

  const normalizedImage = imageBase64.startsWith("data:")
    ? imageBase64
    : `data:image/png;base64,${imageBase64}`;

  try {
    const payload = new URLSearchParams({
      apikey: ocrApiKey,
      language,
      isOverlayRequired: "false",
      base64Image: normalizedImage,
    });

    const upstream = await fetch(OCR_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: payload.toString(),
    });

    const upstreamJson = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      logger.error("OCR upstream failed", { status: upstream.status });
      res.status(502).json({ error: "OCR_UPSTREAM_FAILED" });
      return;
    }

    const parsedText = String(upstreamJson?.ParsedResults?.[0]?.ParsedText || "").trim();
    if (!parsedText) {
      res.status(422).json({ error: "NO_TEXT_DETECTED" });
      return;
    }

    res.status(200).json({ parsedText });
  } catch (err) {
    logger.error("OCR parse request failed", err);
    res.status(500).json({ error: "OCR_INTERNAL_ERROR" });
  }
});
