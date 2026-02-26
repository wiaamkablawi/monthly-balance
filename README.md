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

כך אפשר לראות ריצות גם כשעובדים בפועל על `dev`.

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
4. אם דחפת ל-`dev` תראי פריסה לערוץ `dev`; אם ל-`main` תראי פריסה לערוץ `live`.
