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

ודאי שקיים Secret בשם `FIREBASE_TOKEN`.

## איך מייצרים FIREBASE_TOKEN (אם צריך חדש)

ב-Codespaces terminal או במחשב מקומי עם Firebase CLI:

```bash
firebase login:ci
```

להעתיק את הטוקן שמתקבל ולהדביק אותו ב-GitHub Secret בשם `FIREBASE_TOKEN`.

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
3. ודאי ש-`FIREBASE_TOKEN` לא פג תוקף (אפשר לייצר חדש עם `firebase login:ci`).
4. ודאי שלמשתמש שהפיק את ה-token יש הרשאות לפרויקט `monthly-balance-548d1`.
