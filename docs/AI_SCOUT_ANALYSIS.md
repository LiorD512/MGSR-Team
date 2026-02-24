# AI Scout – ארכיטקטורה

## זרימת העבודה (מעודכן)

1. **Gemini** – מתרגם את הבקשה החופשית (עברית/אנגלית) לפרמטרים מובנים:
   - position, ageMin, ageMax, notes, transferFee, limit
   - לא מציע שמות שחקנים – רק מפרסר את הבקשה

2. **Scout Server** – מבצע את החיפוש האמיתי:
   - `/recruitment` עם הפרמטרים המפוענחים
   - חיפוש במאגר של ~17,000 שחקנים (נתוני FBref)
   - מחזיר תוצאות מהמאגר

3. **תוצאות** – מהמאגר, לא מ־Gemini

## קבצים

- `mgsr-web/src/lib/aiQueryParser.ts` – `parseScoutQueryWithGemini` – מפרסר בקשה
- `mgsr-web/src/app/api/scout/search/route.ts` – קורא ל־Gemini (פרסור) + Scout Server (חיפוש)
- `football-scout-server` – `/recruitment` – חיפוש במאגר

## פרמטרים ל־Scout Server

- position, age_min, age_max, notes, transfer_fee, limit
- notes כולל: "5+ goals last season", "Israeli market fit", "fast, good dribbling" וכו' מתוך ה־DB
