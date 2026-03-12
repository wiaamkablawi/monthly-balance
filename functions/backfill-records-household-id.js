"use strict";

const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const HOUSEHOLD_ID = "household_wb";
const ALLOWED_EMAILS = new Set(["k.wiaam@gmail.com", "boshra.kablawi@gmail.com"]);
const ALLOWED_USER_KEYS = new Set(["W", "B", "SYSTEM"]);
const BATCH_LIMIT = 400;

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return "";
}

function shouldBackfillRecord(data) {
  const householdId = firstString(data.householdId);
  if (householdId) return false;

  const email = firstString(data.userEmail, data.createdBy, data.ownerEmail, data.email).toLowerCase();
  if (email && ALLOWED_EMAILS.has(email)) return true;

  const createdBy = firstString(data.createdBy).toLowerCase();
  if (createdBy === "system") return true;

  const userKey = firstString(data.userKey).toUpperCase();
  if (userKey && ALLOWED_USER_KEYS.has(userKey)) return true;

  return false;
}

async function commitBatch(batch, pendingWrites) {
  if (!pendingWrites.count) return;
  await batch.commit();
  pendingWrites.count = 0;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const snapshot = await db.collection("records").get();

  let batch = db.batch();
  const pendingWrites = { count: 0 };
  let scanned = 0;
  let matched = 0;
  let updated = 0;
  let skipped = 0;

  for (const doc of snapshot.docs) {
    scanned += 1;
    const data = doc.data() || {};

    if (!shouldBackfillRecord(data)) {
      skipped += 1;
      continue;
    }

    matched += 1;

    if (!dryRun) {
      batch.set(doc.ref, { householdId: HOUSEHOLD_ID }, { merge: true });
      pendingWrites.count += 1;
      updated += 1;

      if (pendingWrites.count >= BATCH_LIMIT) {
        await commitBatch(batch, pendingWrites);
        batch = db.batch();
      }
    }
  }

  if (!dryRun) {
    await commitBatch(batch, pendingWrites);
  }

  console.log(JSON.stringify({ scanned, matched, updated: dryRun ? 0 : updated, skipped, dryRun, householdId: HOUSEHOLD_ID }, null, 2));
}

main().catch((error) => {
  console.error("records householdId backfill failed.");
  console.error(error);
  process.exitCode = 1;
});
