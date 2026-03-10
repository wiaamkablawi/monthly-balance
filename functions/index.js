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

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeOverlayLines(rawLines) {
  if (!Array.isArray(rawLines)) return [];

  return rawLines
    .map((line) => {
      const words = Array.isArray(line?.Words)
        ? line.Words.map((word) => {
            const text = String(word?.WordText || "").trim();
            const left = toFiniteNumber(word?.Left);
            const top = toFiniteNumber(word?.Top);
            const width = Math.max(0, toFiniteNumber(word?.Width));
            const height = Math.max(0, toFiniteNumber(word?.Height));

            if (!text) return null;

            return {
              text,
              left,
              top,
              width,
              height,
            };
          }).filter(Boolean)
        : [];

      const text = String(line?.LineText || words.map((word) => word.text).join(" ")).trim();
      if (!text) return null;

      const left = words.length ? Math.min(...words.map((word) => word.left)) : toFiniteNumber(line?.MinTop);
      const right = words.length ? Math.max(...words.map((word) => word.left + word.width)) : left;
      const top = words.length ? Math.min(...words.map((word) => word.top)) : toFiniteNumber(line?.MinTop);
      const bottom = words.length ? Math.max(...words.map((word) => word.top + word.height)) : top + toFiniteNumber(line?.MaxHeight);

      return {
        text,
        left,
        right,
        top,
        bottom,
        words: words.map((word) => ({
          text: word.text,
          left: word.left,
          top: word.top,
          width: word.width,
          height: word.height,
        })),
      };
    })
    .filter(Boolean);
}

function buildOcrPayload(params) {
  return new URLSearchParams({
    apikey: params.apikey,
    language: params.language,
    OCREngine: params.ocrEngine,
    isOverlayRequired: params.isOverlayRequired ? "true" : "false",
    detectOrientation: params.detectOrientation ? "true" : "false",
    scale: params.scale ? "true" : "false",
    isTable: params.isTable ? "true" : "false",
    base64Image: params.base64Image,
  });
}

async function runOcrAttempt(params) {
  const payload = buildOcrPayload(params);
  const upstream = await fetch(OCR_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: payload.toString(),
  });

  const upstreamJson = await upstream.json().catch(() => null);
  return { upstream, upstreamJson };
}

function extractParsedOutput(upstreamJson) {
  const parsedResult = upstreamJson?.ParsedResults?.[0] || null;
  const parsedText = String(parsedResult?.ParsedText || "").trim();
  const overlayLines = normalizeOverlayLines(parsedResult?.TextOverlay?.Lines);

  return { parsedText, overlayLines, parsedResult };
}

exports.ocrParse = onRequest(
  { region: "us-central1", timeoutSeconds: 90, memory: "256MiB", invoker: "public", secrets: ["OCR_SPACE_API_KEY"] },
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
    const language = String(req.body?.language || "auto").trim() || "auto";
    const ocrEngine = String(req.body?.ocrEngine || "3").trim() || "3";
    const isOverlayRequired = String(req.body?.isOverlayRequired || "false").trim().toLowerCase() === "true";
    const detectOrientation = String(req.body?.detectOrientation || "true").trim().toLowerCase() === "true";
    const scale = String(req.body?.scale || "true").trim().toLowerCase() === "true";
    const isTable = String(req.body?.isTable || "true").trim().toLowerCase() === "true";

    if (!imageBase64 || imageBase64.length > 14_000_000) {
      res.status(400).json({ error: "INVALID_IMAGE_PAYLOAD" });
      return;
    }

    const normalizedImage = imageBase64.startsWith("data:")
      ? imageBase64
      : `data:image/png;base64,${imageBase64}`;

    try {
      const attempts = [
        {
          label: "engine3-table",
          apikey: ocrApiKey,
          language,
          ocrEngine,
          isOverlayRequired,
          detectOrientation,
          scale,
          isTable,
          base64Image: normalizedImage,
        },
        {
          label: "engine3-layout",
          apikey: ocrApiKey,
          language,
          ocrEngine,
          isOverlayRequired: false,
          detectOrientation,
          scale,
          isTable: false,
          base64Image: normalizedImage,
        },
        {
          label: "engine3-fast",
          apikey: ocrApiKey,
          language,
          ocrEngine,
          isOverlayRequired: false,
          detectOrientation: true,
          scale: false,
          isTable: false,
          base64Image: normalizedImage,
        },
      ];

      let lastParsedText = "";
      let lastOverlayLines = [];

      for (const attempt of attempts) {
        const { upstream, upstreamJson } = await runOcrAttempt(attempt);
        if (!upstream.ok) {
          logger.error("OCR upstream failed", { label: attempt.label, status: upstream.status, upstreamJson });
          if (upstream.status === 504) {
            res.status(504).json({ error: "OCR_UPSTREAM_TIMEOUT" });
            return;
          }
          continue;
        }

        const { parsedText, overlayLines, parsedResult } = extractParsedOutput(upstreamJson);
        if (parsedText || overlayLines.length) {
          res.status(200).json({ parsedText, overlayLines });
          return;
        }

        lastParsedText = parsedText;
        lastOverlayLines = overlayLines;
        logger.warn("OCR attempt produced no text", {
          label: attempt.label,
          ocrExitCode: parsedResult?.OCRExitCode,
          errorMessage: parsedResult?.ErrorMessage,
          errorDetails: parsedResult?.ErrorDetails,
          processingTimeMs: parsedResult?.ProcessingTimeInMilliseconds,
        });
      }

      if (!lastParsedText && !lastOverlayLines.length) {
        res.status(422).json({ error: "NO_TEXT_DETECTED" });
        return;
      }

      res.status(200).json({ parsedText: lastParsedText, overlayLines: lastOverlayLines });
    } catch (err) {
      logger.error("OCR parse request failed", err);
      res.status(500).json({ error: "OCR_INTERNAL_ERROR" });
    }
  }
);
