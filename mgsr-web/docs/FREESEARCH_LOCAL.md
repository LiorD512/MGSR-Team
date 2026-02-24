# בדיקת Freesearch לוקאלית

הפרסור מתבצע ב־**Python** (scout-server-freesearch) דרך proxy מקומי.

## טרמינל 1 – הפעלת proxy

```bash
cd mgsr-web
npm run freesearch
```

הפלט ייראה: `Freesearch proxy: http://localhost:8001/freesearch`

## טרמינל 2 – הפעלת mgsr-web

```bash
cd mgsr-web
```

ב־`.env.local` הוסף:

```
SCOUT_FREESEARCH_URL=http://localhost:8001
```

ואז:

```bash
npm run dev
```

## בדיקה

1. פתח: http://localhost:3000/ai-scout
2. הקלד: `4 חלוצים עד גיל 28 שוק ישראלי`
3. לחץ חפש

## זרימה

1. משתמש מקליד חיפוש חופשי
2. mgsr-web שולח ל־`localhost:8001/freesearch?q=...`
3. ה־proxy (Python) מפרסר את הטקסט
4. ה־proxy קורא ל־Render scout server `/recruitment`
5. ה־proxy מסנן לפי `min_goals` (אם צריך)
6. התוצאות חוזרות ל־mgsr-web

## דרישות

- Python 3
- חיבור לאינטרנט (ה־proxy מתחבר ל־Render)
