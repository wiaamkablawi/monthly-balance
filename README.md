# Monthly Balance

## פרסום אוטומטי לאתר אחרי כל push ל-GitHub

הפרויקט מוגדר עם GitHub Actions כך שכל `push` לענף `main` יבצע אוטומטית:

1. התקנת תלויות (`npm ci`)
2. בנייה (`npm run build`)
3. פריסה ל-Firebase Hosting

קובץ ה-workflow נמצא בנתיב:

- `.github/workflows/deploy-firebase.yml`

## מה עושים במסך ששלחת (Secrets)

בצילום המסך שלך כבר קיים secret בשם `FIREBASE_TOKEN` — וזה בדיוק מה שה-workflow משתמש בו עכשיו.

מה שנשאר לבצע:

1. ודאי שהשם של ה-secret הוא בדיוק `FIREBASE_TOKEN`.
2. ודאי שהערך הוא Firebase CI Token תקין (מטוקן של `firebase login:ci`).
3. שמרי והמשיכי ל-push לענף `main`.

## איך מייצרים FIREBASE_TOKEN (אם צריך חדש)

במחשב מקומי עם Firebase CLI מותקן:

```bash
firebase login:ci
```

להעתיק את הטוקן שמתקבל ולהדביק אותו ב-GitHub Secret בשם `FIREBASE_TOKEN`.

## בדיקה מהירה

1. בצעי commit + push לענף `main`.
2. היכנסי ל-**Actions** ב-GitHub.
3. ודאי שה-workflow "Deploy to Firebase Hosting" עבר בהצלחה.
4. בסיום, האתר יתעדכן אוטומטית.
