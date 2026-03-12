"use strict";

const fs = require("fs/promises");
const path = require("path");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

function serializeFirestoreValue(value) {
  if (value === null || value === undefined) {
    return value;
  }

  if (value instanceof admin.firestore.Timestamp) {
    return {
      _type: "timestamp",
      value: value.toDate().toISOString(),
    };
  }

  if (value instanceof admin.firestore.GeoPoint) {
    return {
      _type: "geopoint",
      latitude: value.latitude,
      longitude: value.longitude,
    };
  }

  if (value instanceof admin.firestore.DocumentReference) {
    return {
      _type: "reference",
      path: value.path,
    };
  }

  if (typeof value?.toBase64 === "function") {
    return {
      _type: "bytes",
      value: value.toBase64(),
    };
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(serializeFirestoreValue);
  }

  if (typeof value === "object") {
    const output = {};

    for (const [key, nestedValue] of Object.entries(value)) {
      output[key] = serializeFirestoreValue(nestedValue);
    }

    return output;
  }

  return value;
}

async function exportCollection(collectionRef) {
  const snapshot = await collectionRef.get();
  const documents = [];

  for (const docSnapshot of snapshot.docs) {
    const subcollections = await docSnapshot.ref.listCollections();
    const nestedCollections = {};

    for (const subcollectionRef of subcollections) {
      nestedCollections[subcollectionRef.id] = await exportCollection(subcollectionRef);
    }

    documents.push({
      id: docSnapshot.id,
      path: docSnapshot.ref.path,
      data: serializeFirestoreValue(docSnapshot.data()),
      subcollections: nestedCollections,
    });
  }

  return documents;
}

async function exportFirestore() {
  const rootCollections = await db.listCollections();
  const exportedCollections = {};

  for (const collectionRef of rootCollections) {
    exportedCollections[collectionRef.id] = await exportCollection(collectionRef);
  }

  return {
    exportedAt: new Date().toISOString(),
    projectId: admin.app().options.projectId || process.env.GCLOUD_PROJECT || null,
    collections: exportedCollections,
  };
}

async function main() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputPath = process.argv[2]
    ? path.resolve(process.cwd(), process.argv[2])
    : path.join(__dirname, `firestore-export-${timestamp}.json`);

  const payload = await exportFirestore();
  await fs.writeFile(outputPath, JSON.stringify(payload, null, 2), "utf8");

  console.log(`Firestore export completed: ${outputPath}`);
}

main().catch((error) => {
  console.error("Firestore export failed.");
  console.error(error);
  process.exitCode = 1;
});

