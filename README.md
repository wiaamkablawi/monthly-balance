# Monthly Balance

## פרסום אוטומטי לאתר אחרי כל push ל-GitHub

הפרויקט מוגדר עם GitHub Actions כך שכל `push` לענפים `main` או `dev` יבצע אוטומטית:

1. התקנת תלויות (`npm ci`)
2. בנייה (`npm run build`)
3. פריסה ל-Firebase Hosting

קובץ ה-workflow נמצא בנתיב:

- `.github/workflows/deploy-firebase.yml`

## תמיכה ב-main וב-dev

- `main` נפרס לערוץ `live`
- `dev` נפרס לערוץ `dev`

## מה עושים במסך Secrets

ודאי שקיים Service Account תקין בשם:

- `FIREBASE_SERVICE_ACCOUNT_MONTHLY_BALANCE`

בנוסף, יש להגדיר גם את כל משתני ה-Web SDK (לשלב build ב-GitHub Actions):

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_OCR_SPACE_API_KEY` (אופציונלי, נדרש עבור ניתוח תמונת OCR במסך הוספה)

אם אחד מהם חסר, האפליקציה תעלה אבל התחברות Google תישאר מושבתת.

## הערה לגבי אימות ל-Firebase Deploy

ה-workflow משתמש ב־GitHub Secret של Service Account:

- `FIREBASE_SERVICE_ACCOUNT_MONTHLY_BALANCE`

ולא ב-`FIREBASE_TOKEN`.

## בדיקה מהירה (Codespaces)

1. בדקי על איזה ענף את נמצאת:

```bash
git branch --show-current
```

2. בצעי commit + push:

```bash
git add .
git commit -m "Trigger Firebase deploy workflow"
git push
```

3. היכנסי ל-**Actions** ב-GitHub וודאי שה-workflow "Deploy to Firebase Hosting" רץ.

## פתרון תקלות מהיר

אם הריצה נכשלת:

1. פתחי את ה-run האחרון ב-Actions.
2. בדקי את הלוגים של השלב "Deploy to Firebase Hosting".
3. ודאי שה-Secret `FIREBASE_SERVICE_ACCOUNT_MONTHLY_BALANCE` תקין ולא הוסר.
4. ודאי שכל `VITE_FIREBASE_*` מוגדרים ב-Secrets כדי שה-build יקבל קונפיגורציית Firebase מלאה.
