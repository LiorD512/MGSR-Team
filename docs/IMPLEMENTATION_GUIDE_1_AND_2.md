# מדריך יישום — 1. הרחבת FBref enrichment | 2. Percentiles לפי עמדה

מסמך זה מסביר **בדיוק** איך ליישם את שתי המשימות הראשונות מתוך ה-roadmap.

---

## 1. הרחבת FBref Enrichment

### מה המצב היום?

**זרימת העבודה הנוכחית:**

1. **`server.py`** — endpoint `/enrich_fbref` (או `/enrich_fbref_cached`)
   - עובר על כל הליגות ב־`FBREF_LEAGUES` (מ־`markets.py`)
   - לכל ליגה: קורא ל־`scrape_fbref_league(comp_id, slug)` או `scrape_fbref_league_from_cache(slug)`
   - מקבל רשימת שחקנים מ־FBref (שם, מועדון, סטטיסטיקות)
   - קורא ל־`enrich_database_with_fbref(db, fbref_players)` ומשמר את ה־DB

2. **`fbref_scraper.py`** — `enrich_database_with_fbref(db_players, fbref_players)`
   - בונה lookup של כל שמות השחקנים מ־FBref
   - **לכל שחקן ב־TM**: עושה fuzzy match (rapidfuzz, token_sort_ratio) על **השם בלבד**
   - אם similarity ≥ 75% — מחבר את הסטטיסטיקות לשחקן (prefix `fbref_`)
   - **בעיה**: אין שימוש בליגה או במועדון — "יוסי כהן" מליגת העל יכול להתאים ל־"יוסי כהן" מהצ'מפיונשיפ

3. **`markets.py`** — `FBREF_LEAGUES`
   - מפה: מפתח (למשל `POL-Ekstraklasa`) → `(comp_id, slug)` של FBref
   - TM שומר `league` בשחקן (למשל "Ekstraklasa") — נלקח מ־URL הליגה

### מה צריך לשנות?

#### שלב א׳: Matching מודע ליגה

**מטרה:** כשמעשירים ליגת FBref מסוימת, להתאים רק לשחקני TM מאותה ליגה.

**שינויים:**

1. **`markets.py`** — הוספת מיפוי ליגת TM לכל ליגת FBref:

```python
# הוסף אחרי FBREF_LEAGUES:
# מפתח FBref -> רשימת מחרוזות שמזהות את ליגת TM (case-insensitive)
FBREF_TO_TM_LEAGUE = {
    "POL-Ekstraklasa": ["ekstraklasa"],
    "ENG-Championship": ["championship"],
    "GER-Bundesliga": ["bundesliga"],
    "GER-2-Bundesliga": ["2 bundesliga", "2-bundesliga"],
    "ISR-Ligat-Haal": ["ligat", "haal", "israel"],
    # ... לכל ליגה ב-FBREF_LEAGUES
}
```

2. **`fbref_scraper.py`** — עדכון `enrich_database_with_fbref`:

```python
def enrich_database_with_fbref(db_players, fbref_players, tm_league_filter=None):
    # tm_league_filter: רשימת מחרוזות (או None = אין סינון)
    # אם מועבר — נשקול רק שחקני TM whose league matches
    ...
    for player in db_players:
        if tm_league_filter:
            league = (player.get("league") or "").lower()
            if not any(sub in league for sub in tm_league_filter):
                continue  # דלג — שחקן מליגה אחרת
        # המשך matching כרגיל...
```

3. **`server.py`** — העברת `tm_league_filter`:

```python
# בתוך run(), כשקוראים ל-enrich_database_with_fbref:
tm_filter = FBREF_TO_TM_LEAGUE.get(name, None)  # name = מפתח הליגה
enriched = enrich_database_with_fbref(db, fbref_players, tm_league_filter=tm_filter)
```

**תוצאה:** התאמות מדויקות יותר — שחקן מ־Ekstraklasa יתאים רק לשחקנים מליגת Ekstraklasa ב־TM.

---

#### שלב ב׳: Matching לפי שם + מועדון (אופציונלי, חזק יותר)

**מטרה:** להקטין טעויות כששני שחקנים עם אותו שם בליגות שונות.

**דרישה:** שדה `club` בשחקן TM. כרגע `player_profile.py` לא מחלץ מועדון.

**שינויים:**

1. **`player_profile.py`** — חילוץ מועדון:
   - בדף פרופיל TM יש בדרך כלל את המועדון הנוכחי (למשל ב־breadcrumb או ב־info table)
   - להוסיף `_get_club(soup)` ולהחזיר את שם המועדון
   - להוסיף `data["club"] = _get_club(soup)` ב־`parse_player`

2. **`scraper.py`** — העברת מועדון:
   - בדף squad, כל שחקן שייך למועדון אחד — אפשר להעביר את שם המועדון כ־`club` לכל שחקן שנשלף מאותו squad

3. **`fbref_scraper.py`** — matching משופר:
   - במקום `process.extractOne(tm_name, fbref_names)` — לבנות key `name|club` או `name|team`
   - FBref יש `team` — להשוות גם team (fuzzy) כשמועדון קיים
   - לדוגמה: `match = process.extractOne(f"{tm_name}|{tm_club}", fbref_keys, ...)`

---

#### שלב ג׳: ליגות נוספות

**מיקום:** `markets.py` → `FBREF_LEAGUES`

**תהליך:**

1. להיכנס ל־[FBref Competitions](https://fbref.com/en/comps/)
2. לבחור ליגה (למשל Ligat HaAl) — ה־URL: `https://fbref.com/en/comps/206/...`
3. `206` = `comp_id`
4. ה־slug בדף הסטטיסטיקות (למשל `Ligat-ha-Al-Stats`)
5. להוסיף:

```python
"ISR-Ligat-Haal": ("206", "Ligat-ha-Al"),
```

6. להוסיף גם ל־`FBREF_TO_TM_LEAGUE` (אם הוספת את שלב א׳)

**ליגות שכדאי להוסיף (דוגמאות):**
- ליגות אפריקה (Botola, PSL)
- ליגות אסיה (J1, K-League)
- ליגות דרום אמריקה (Uruguay, Colombia)

---

#### שלב ד׳: נורמליזציה של שמות

**מיקום:** `fbref_scraper.py` — לפני ה־matching

```python
def _normalize_name(name):
    if not name:
        return ""
    # הסרת דיאקריטיקה (é -> e, ü -> u)
    import unicodedata
    n = unicodedata.normalize("NFD", name)
    n = "".join(c for c in n if unicodedata.category(c) != "Mn")
    return n.strip().lower()
```

להשתמש ב־`_normalize_name` גם על שמות TM וגם על שמות FBref לפני ה־fuzzy match — משפר התאמה לשמות עם תגים.

---

### סיכום תהליך #1

| שלב | קובץ | פעולה |
|-----|------|--------|
| 1 | `markets.py` | הוספת `FBREF_TO_TM_LEAGUE` |
| 2 | `fbref_scraper.py` | פרמטר `tm_league_filter` ב־`enrich_database_with_fbref` |
| 3 | `server.py` | העברת `tm_league_filter` מ־`FBREF_TO_TM_LEAGUE` |
| 4 | `markets.py` | הוספת ליגות ל־`FBREF_LEAGUES` |
| 5 | (אופציונלי) | חילוץ `club` ב־TM + matching לפי שם+מועדון |
| 6 | (אופציונלי) | נורמליזציה של שמות |

---

## 2. Percentiles לפי עמדה

### מה המצב היום?

**מיקום:** `similarity.py` — פונקציה `_build_match_explanation` (בערך שורות 1606–1631)

**הלוגיקה הנוכחית:**

```python
qualified = [p for p in all_players if _has_stats(p) and _has_enough_minutes(p)]
# qualified = כל השחקנים עם סטטיסטיקות FBref ומספיק דקות
if len(qualified) >= 10:
    for stat_key in check_keys:
        all_vals = sorted([_safe_float(p.get(stat_key, 0)) for p in qualified])
        below = sum(1 for v in all_vals if v < val)
        pct = round(100 * below / len(all_vals))  # percentile מול כולם
```

**בעיה:** ה־percentile מחושב מול **כל** השחקנים — חלוץ מושווה גם למגנים. חלוץ עם 2 tackles/90 יכול להיחשב "נמוך" כי מגנים עושים הרבה יותר.

---

### מה צריך לשנות?

**רעיון:** לחשב percentile **רק מול שחקנים באותה קבוצת עמדה** (FWD, WING, DM, FB, וכו׳).

**קבוצות העמדה הקיימות** (מ־`_position_group`):

- `GK` — שוערים
- `DEF` — centre-back
- `FB` — fullbacks
- `DM` — defensive midfield
- `CM` — central midfield
- `AM` — attacking midfield
- `WING` — כנפיים
- `FWD` — חלוצים

---

### שינוי נדרש

**מיקום:** `similarity.py` — בתוך `_build_match_explanation`, בלוק חישוב ה־percentiles

**לפני:**

```python
qualified = [p for p in all_players if _has_stats(p) and _has_enough_minutes(p)]
```

**אחרי:**

```python
group = _position_group(position)
qualified = [
    p for p in all_players
    if _has_stats(p) and _has_enough_minutes(p)
    and _position_group(p.get("position", "")) == group
]
# אם יש פחות מ־10 באותה עמדה — fallback לכל השחקנים (כמו היום)
if len(qualified) < 10:
    qualified = [p for p in all_players if _has_stats(p) and _has_enough_minutes(p)]
```

**הסבר:**
- `qualified` עכשיו = רק שחקנים באותה `group` (למשל רק FWD)
- percentile מחושב מול חלוצים בלבד — חלוץ עם 0.5 goals/90 יקבל percentile רלוונטי
- אם יש פחות מ־10 שחקנים באותה עמדה — חוזרים להתנהגות הישנה (כל השחקנים) כדי לא לקבל percentiles לא יציבים

---

### מקומות נוספים לעדכון (אם רוצים אחידות)

1. **`_compute_note_fit_score`** (שורות 1544–1585)  
   - גם שם יש חישוב percentile ל־`note_stat_keys`  
   - אותו שינוי: `qualified` לפי `_position_group`

2. **פונקציות שמחזירות percentiles ל־API**  
   - לחפש `qualified =` או `all_vals = sorted` ב־`similarity.py`  
   - לוודא שבכל מקום שמחשב percentile — משתמשים ב־`qualified` לפי עמדה

---

### סיכום תהליך #2

| שלב | קובץ | שורה (בערך) | פעולה |
|-----|------|--------------|--------|
| 1 | `similarity.py` | 1608–1610 | סינון `qualified` לפי `_position_group(position)` |
| 2 | `similarity.py` | 1610 | Fallback: אם `len(qualified) < 10` → השתמש בכל השחקנים |
| 3 | `similarity.py` | 1555–1556 | אותו שינוי ב־`_compute_note_fit_score` (אופציונלי) |

---

## סדר ביצוע מומלץ

1. **#2 (Percentiles לפי עמדה)** — שינוי קטן, השפעה ברורה, סיכון נמוך.
2. **#1 (FBref)** — להתחיל משלב א׳ (matching מודע ליגה), ואז להוסיף ליגות ונורמליזציה.

---

*מסמך זה נוצר כהנחיה ליישום. ניתן לבצע את השינויים בהדרגה.*
