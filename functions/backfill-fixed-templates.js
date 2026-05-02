/**
 * Backfill script: adds householdId, isActive, startDate to all fixed_templates
 * that are missing these fields.
 *
 * Run from the functions/ directory:
 *   node backfill-fixed-templates.js
 */

const admin = require("firebase-admin");
const serviceAccount = require("./service-account.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const HOUSEHOLD_ID = "household_wb";
const START_DATE = "2024-01-01";

async function run() {
  const snapshot = await db.collection("fixed_templates").get();
  console.log(`נמצאו ${snapshot.size} תבניות`);

  const batch = db.batch();
  let count = 0;

  snapshot.forEach((doc) => {
    const data = doc.data();
    const updates = {};

    if (!data.householdId) updates.householdId = HOUSEHOLD_ID;
    if (typeof data.isActive !== "boolean") updates.isActive = true;
    if (!data.startDate) updates.startDate = START_DATE;

    if (Object.keys(updates).length > 0) {
      console.log(`מעדכן ${doc.id} (${data.description || data.category}):`, updates);
      batch.update(doc.ref, { ...updates, updatedAt: Date.now(), updatedBy: "backfill-script" });
      count++;
    }
  });

  if (count === 0) {
    console.log("אין תבניות לעדכון.");
    return;
  }

  await batch.commit();
  console.log(`✅ עודכנו ${count} תבניות בהצלחה.`);
}

run().catch((err) => {
  console.error("שגיאה:", err);
  process.exit(1);
});
