# Monthly Balance

## פרסום אוטומטי לאתר אחרי כל push ל-GitHub

הפרויקט מוגדר כעת עם GitHub Actions כך שכל `push` לענף `main` יבצע אוטומטית:

1. התקנת תלויות (`npm ci`)
2. בנייה (`npm run build`)
3. פריסה ל-Firebase Hosting

קובץ ה-workflow נמצא בנתיב:

- `.github/workflows/deploy-firebase.yml`

### מה צריך להגדיר פעם אחת ב-GitHub

1. היכנס ל־**Repo → Settings → Secrets and variables → Actions**.
2. צור Secret חדש בשם:
   - `FIREBASE_SERVICE_ACCOUNT_MONTHLY_BALANCE_548D1`
3. הערך של ה-secret צריך להיות JSON של Service Account מ-Firebase עם הרשאות Hosting Admin.

### איך להוציא Service Account מ-Firebase

1. פתח את Google Cloud Console של הפרויקט `monthly-balance-548d1`.
2. עבור ל-**IAM & Admin → Service Accounts**.
3. צור חשבון שירות חדש (או השתמש בקיים), תן לו הרשאת **Firebase Hosting Admin**.
4. צור מפתח JSON והעתק את כל התוכן ל-secret ב-GitHub.

### בדיקה מהירה

לאחר שמירת ה-secret:

- בצע commit + push לענף `main`.
- עבור לטאב **Actions** ב-GitHub וודא שה-workflow עבר בהצלחה.
- בסיום, האתר יתעדכן אוטומטית.
