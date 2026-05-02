/**
 * Seed script: writes all fixed expense templates to Firestore.
 * Uses Firebase CLI Application Default Credentials (no service-account.json needed).
 *
 * Run from the functions/ directory:
 *   node seed-fixed-templates.js
 */

const admin = require("firebase-admin");

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: "monthly-balance-548d1",
});

const db = admin.firestore();

const HOUSEHOLD_ID = "household_wb";
const CREATED_BY = "k.wiaam@gmail.com";
const START_DATE = "2024-01-01";
const CHARGE_DAY = 1;
const NOW = Date.now();

const TEMPLATES = [
  { category: "ביטוחים ובריאות",   description: "שירותי בריאות כללית",              amount: 275  },
  { category: "ביטוחים ובריאות",   description: "ביטוח ישיר חיים",                  amount: 76   },
  { category: "ביטוחים ובריאות",   description: "סעוד הראל כללית",                  amount: 71   },
  { category: "הלוואות ודיור",      description: "משכנתא מרכנתיל",                   amount: 4350 },
  { category: "הלוואות ודיור",      description: "הלוואה מנורה מבטחים - פנסיונית",   amount: 3000 },
  { category: "הלוואות ודיור",      description: "הלוואה 15600145456",               amount: 1132 },
  { category: "הלוואות ודיור",      description: "הלוואה 15600145464",               amount: 777  },
  { category: "תקשורת ואינטרנט",   description: "פלאפון - תשלומים",                 amount: 550  },
  { category: "תקשורת ואינטרנט",   description: "אינטרנט - חיוב מרוכז",             amount: 468  },
  { category: "תקשורת ואינטרנט",   description: "בזק",                              amount: 195  },
  { category: "תקשורת ואינטרנט",   description: "בזק בינלאומי",                     amount: 9    },
  { category: "תשתיות ותחבורה",    description: "מעיינות זיו",                      amount: 356  },
  { category: "תשתיות ותחבורה",    description: "דרך ארץ",                          amount: 90   },
  { category: "תשתיות ותחבורה",    description: "שטראוס מים",                       amount: 72   },
  { category: "תשתיות ותחבורה",    description: "מנהרות הכרמל",                     amount: 47   },
  { category: "תשתיות ותחבורה",    description: "פנגו",                             amount: 28   },
  { category: "מנויים דיגיטליים",   description: "Netflix",                          amount: 87   },
  { category: "מנויים דיגיטליים",   description: "ChatGPT Plus",                     amount: 70   },
  { category: "מנויים דיגיטליים",   description: "YouTube Premium",                  amount: 46   },
  { category: "מנויים דיגיטליים",   description: "Apple / iTunes",                   amount: 40   },
  { category: "מנויים דיגיטליים",   description: "Gamma.app",                        amount: 35   },
  { category: "מנויים דיגיטליים",   description: "SpeakPal",                         amount: 31   },
];

async function run() {
  const colRef = db.collection("fixed_templates");

  // Check existing docs to avoid duplicates
  const existing = await colRef.where("householdId", "==", HOUSEHOLD_ID).get();
  const existingDescriptions = new Set(existing.docs.map((d) => d.data().description));
  console.log(`קיימות כבר ${existing.size} תבניות עם householdId.`);

  const batch = db.batch();
  let count = 0;

  for (const tmpl of TEMPLATES) {
    if (existingDescriptions.has(tmpl.description)) {
      console.log(`  דולג (קיים): ${tmpl.description}`);
      continue;
    }

    const ref = colRef.doc(); // auto-id
    batch.set(ref, {
      category: tmpl.category,
      description: tmpl.description,
      amount: tmpl.amount,
      chargeDay: CHARGE_DAY,
      startDate: START_DATE,
      isActive: true,
      householdId: HOUSEHOLD_ID,
      createdBy: CREATED_BY,
      updatedBy: CREATED_BY,
      createdAt: NOW + count,
      updatedAt: NOW + count,
      userKey: "W",
      userEmail: CREATED_BY,
    });

    console.log(`  מוסיף: ${tmpl.description} (${tmpl.category}) — ₪${tmpl.amount}`);
    count++;
  }

  if (count === 0) {
    console.log("כל התבניות כבר קיימות, אין מה להוסיף.");
    return;
  }

  await batch.commit();
  console.log(`\n✅ נוספו ${count} תבניות חדשות ל-Firestore.`);
  console.log("כעת פתח את הדשבורד וחודש מאי — ההוצאות הקבועות ייווצרו אוטומטית.");
}

run().catch((err) => {
  console.error("שגיאה:", err.message || err);
  process.exit(1);
});
