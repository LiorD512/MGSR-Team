# Scout Server – Free Search Integration

## סטטוס נוכחי

- **mgsr-web** – משתמש ב־`parseFreeQuery` (TypeScript) – **מוכן**
- **Scout server** – יש קוד Python ב־`scout-server-freesearch.py` – **להעתקה**

## זרימה

1. משתמש מקליד חיפוש חופשי (עברית/אנגלית)
2. `parseFreeQuery` מפרסר לפרמטרים: position, age_max, notes, transfer_fee, limit
3. קריאה ל־`/recruitment` עם הפרמטרים
4. Scout server מחזיר תוצאות מהמאגר

## הוספת /freesearch ל־Scout Server

אם תרצה שהפרסור יקרה ב־scout server (במקום ב־mgsr-web):

1. העתק את `scout-server-freesearch.py` לתיקיית הפרויקט של football-scout-server
2. הוסף endpoint:

```python
from freesearch import parse_free_query

@app.get("/freesearch")
async def freesearch(q: str, lang: str = "en"):
    params = parse_free_query(q, lang)
    # Call your existing recruitment logic
    results = await your_recruitment_search(**params)
    return {"results": results, "interpretation": "..."}
```

3. עדכן את mgsr-web לקרוא ל־`/freesearch?q=...` במקום לפרסר + `/recruitment`

## שיפור הפרסור

להוסיף דפוסים ב־`parseFreeQuery.ts` (או ב־Python):

- עמדות נוספות
- ביטויים חדשים לגיל (למשל "בני 20–25")
- דרישות שערים מורכבות
- שוק פולני/יווני (transfer_fee שונה)
