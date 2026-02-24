# מדריך בדיקה – AI Scout (תוצאות אמיתיות)

## מה צריך להריץ

יש **שתי דרכים** לקבל תוצאות אמיתיות מהמאגר:

| אפשרות | מה מריצים | יתרון |
|--------|-----------|-------|
| **א' – פשוטה** | רק mgsr-web | בלי Python, בלי proxy |
| **ב' – עם freesearch** | mgsr-web + freesearch proxy | פרסור מתקדם יותר (Python) |

---

## אפשרות א' – הדרך הפשוטה (מומלצת להתחלה)

### שלב 1: הפעל את mgsr-web

```bash
cd /Users/lior.dahan/AndroidStudioProjects/MGSRTeam/mgsr-web
npm run dev
```

המתן עד שתופיע הודעה: `Ready` (בדרך כלל על `http://localhost:3000`).

### שלב 2: התחבר למערכת

1. פתח בדפדפן: **http://localhost:3000**
2. התחבר עם חשבון (אם צריך – צור משתמש חדש)
3. עבור ל־**AI Scout** בתפריט

### שלב 3: בצע חיפוש אמיתי

1. **כבה** את תיבת הסימון "מצב דמו" (Demo mode) – חשוב מאוד.
2. הקלד שאילתה, למשל:
   - `תמצא לי 5 חלוצים עד גיל 26 שכבשו לפחות 5 שערים`
   - `young strikers under 25 with pace`
3. לחץ **חיפוש**.

### שלב 4: המתן (חשוב)

- **חיפוש ראשון:** יכול לקחת **60–90 שניות** – שרת Render מתעורר מ־sleep.
- **חיפוש שני:** בדרך כלל 5–15 שניות.
- אם יש timeout – לחץ "חימום שרת" או "נסה שוב".

---

## אפשרות ב' – עם Freesearch Proxy (פרסור Python)

### שלב 1: הוסף משתנה סביבה

צור או ערוך את הקובץ `mgsr-web/.env.local` והוסף:

```
SCOUT_FREESEARCH_URL=http://localhost:8001
```

(אם יש כבר שורות אחרות – הוסף את השורה הזו.)

### שלב 2: הפעל שני טרמינלים

**טרמינל 1 – mgsr-web:**
```bash
cd /Users/lior.dahan/AndroidStudioProjects/MGSRTeam/mgsr-web
npm run dev
```

**טרמינל 2 – freesearch proxy:**
```bash
cd /Users/lior.dahan/AndroidStudioProjects/MGSRTeam/mgsr-web
npm run freesearch
```

אמור להופיע: `Freesearch proxy: http://localhost:8001/freesearch`

### שלב 3: התחבר ובצע חיפוש

כמו באפשרות א' – התחבר, עבור ל־AI Scout, כבה Demo mode, והקלד שאילתה.

---

## דף בדיקה (ללא התחברות)

אם אתה רוצה לבדוק רק את ה־API בלי UI:

1. הרץ `npm run dev` בתיקיית mgsr-web.
2. פתח: **http://localhost:3000/ai-scout-test.html**
3. לחץ:
   - **1. Ping** – בדיקה שהשרת מגיב.
   - **2. דמו** – תוצאות מזויפות מיידיות.
   - **3. חיפוש אמיתי** – תוצאות אמיתיות (עד ~2 דקות).

---

## שאילתות לדוגמה

| עברית | English |
|-------|---------|
| תמצא לי 10 חלוצים עד גיל 23 שכבשו לפחות 5 שערים | find me 10 strikers under 23 with at least 5 goals |
| כנפיים שמאליות צעירות מתחת ל־23 | young left wingers under 23 |
| בלמים מנוסים מעל 28 | experienced center backs over 28 |
| 4 חלוצים שוק ישראלי | 4 strikers Israeli market |

---

## פתרון בעיות

| בעיה | פתרון |
|------|-------|
| "Address already in use" | `kill $(lsof -t -i:8001)` – סיום תהליך על פורט 8001 |
| Timeout / אין תוצאות | לחץ "חימום שרת" או "בדוק חיבור" – Render מתעורר לאט |
| תוצאות דמו בלבד | וודא ש־Demo mode **מסומן כבוי** |
| צריך להתחבר | דף AI Scout דורש התחברות – השתמש ב־/ai-scout-test.html לבדיקה בלי התחברות |

---

## סיכום זרימה

```
[דפדפן] → mgsr-web (localhost:3000)
              ↓
         /api/scout/search
              ↓
    ┌─────────┴─────────┐
    │ SCOUT_FREESEARCH_URL? │
    └─────────┬─────────┘
         כן ↙     ↘ לא
    localhost:8001    parseFreeQuery (TS)
    (freesearch)           │
         │                 │
         └────────┬────────┘
                  ↓
    Render: football-scout-server (17k שחקנים)
```
