# תוכנית מימוש: פרופילים מוואטסאפ → War Room

## 1. סקירה

**מטרה:** אוטומציה שתזהה הודעות וואטסאפ שמכילות לינקי Transfermarkt, תחלץ את הפרופילים, תאמת אותם מול mgsr-backend, ותוסיף אותם לטאב ייעודי ב-War Room.

**זרימה:**
```
הודעה בוואטסאפ → Webhook (Meta) → חילוץ URL → קריאה ל-mgsr-backend → שמירה ב-Firestore → טאב "התקבלו בוואטסאפ"
```

---

## 2. דרישות מקדימות

### 2.1 Meta Business + WhatsApp Business API

| שלב | פעולה | הערות |
|-----|-------|-------|
| 1 | חשבון Meta Business | [business.facebook.com](https://business.facebook.com) |
| 2 | אפליקציה ב-Meta for Developers | [developers.facebook.com](https://developers.facebook.com) → Create App → Business |
| 3 | הוספת מוצר WhatsApp | App Dashboard → Add Product → WhatsApp |
| 4 | מספר טלפון | העברת מספר קיים ל-Business או מספר חדש (לא ניתן להשתמש במספר אישי רגיל) |
| 5 | אימות Webhook | Meta שולחת GET עם `hub.verify_token` – צריך להחזיר `hub.challenge` |

### 2.2 מגבלות

- **קבוצות:** הודעות בקבוצות לא תמיד נשלחות ל-Webhook (תלוי בהגדרות Meta)
- **מספר אישי:** API עובד רק עם מספר Business
- **עלות:** קבלת הודעות חינמית; תשלום על הודעות יוצאות (לפי שיחות)

---

## 3. ארכיטקטורה

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│  WhatsApp       │     │  mgsr-web        │     │  mgsr-backend       │
│  (Meta Cloud)   │────▶│  /api/whatsapp/  │────▶│  /api/transfermarkt/ │
│                 │     │  webhook         │     │  player?url=...      │
└─────────────────┘     └────────┬─────────┘     └─────────────────────┘
                                 │
                                 ▼
                        ┌──────────────────┐
                        │  Firestore       │
                        │  WhatsAppProfiles│
                        └────────┬─────────┘
                                 │
                                 ▼
                        ┌──────────────────┐
                        │  War Room UI     │
                        │  טאב "התקבלו"   │
                        └──────────────────┘
```

---

## 4. מודל נתונים (Firestore)

### קולקציה: `WhatsAppProfiles`

| שדה | סוג | תיאור |
|-----|-----|-------|
| `transfermarktUrl` | string | URL מנורמל (מפתח לוגי) |
| `playerId` | string | ID מ-URL (לחילוץ תמונה) |
| `name` | string | שם מהפרופיל |
| `position` | string | עמדה |
| `age` | string | גיל |
| `marketValue` | string | שווי שוק |
| `club` | string | מועדון נוכחי |
| `league` | string | ליגה (אם קיים) |
| `nationality` | string | אזרחות |
| `profileImage` | string | URL לתמונה |
| `senderPhone` | string | מספר שולח (מנורמל) |
| `senderName` | string | שם שולח (אם קיים) |
| `messageId` | string | מזהה הודעה מ-Meta (למניעת כפילויות) |
| `receivedAt` | timestamp | מתי התקבל |
| `status` | string | `new` \| `viewed` \| `added_to_shortlist` \| `added_to_roster` \| `dismissed` |
| `rawMessageText` | string? | טקסט ההודעה המלא (אופציונלי, לדיבוג) |

### Firestore Rules (טיוטה)

```javascript
// WhatsAppProfiles – כתיבה רק מ-Cloud Function או API עם Admin
match /WhatsAppProfiles/{docId} {
  allow read: if request.auth != null;
  allow create: if false;  // רק שרת
  allow update, delete: if request.auth != null;
}
```

**הערה:** ה-Webhook רץ בשרת (Next.js API route) עם Firebase Admin – לא דרך Client SDK.

---

## 5. שלבי מימוש

### שלב 1: תשתית Meta + Webhook (1–2 ימים)

**משימות:**
1. יצירת אפליקציה ב-Meta for Developers
2. הוספת WhatsApp product
3. קבלת מספר Business (או העברת מספר קיים)
4. יצירת Webhook endpoint ב-mgsr-web

**קבצים:**
- `mgsr-web/src/app/api/whatsapp/webhook/route.ts`

**לוגיקה:**
- `GET` – אימות: בדיקת `hub.verify_token`, החזרת `hub.challenge`
- `POST` – קבלת הודעות: חילוץ `messages` מ-body, שליחה לעיבוד

### שלב 2: חילוץ URL ועיבוד (1 יום)

**משימות:**
1. פונקציה `extractTransfermarktPlayerUrl(text)` – פורט מ-Kotlin או כתיבה מחדש ב-TypeScript
2. קריאה ל-mgsr-backend: `GET /api/transfermarkt/player?url=...`
3. מניעת כפילויות: בדיקה לפי `messageId` או `transfermarktUrl` + `senderPhone` + חלון זמן

**קבצים:**
- `mgsr-web/src/lib/transfermarktUrl.ts` – חילוץ URL
- `mgsr-web/src/app/api/whatsapp/process/route.ts` או לוגיקה בתוך webhook

### שלב 3: שמירה ב-Firestore (0.5 יום)

**משימות:**
1. Firebase Admin ב-API route (כבר קיים ב-mgsr-web)
2. `addDoc(WhatsAppProfiles, {...})` עם כל השדות
3. טיפול בשגיאות (Transfermarkt לא זמין, URL לא תקין)

### שלב 4: טאב War Room (1–2 ימים)

**משימות:**
1. הוספת טאב "התקבלו בוואטסאפ" / "Received via WhatsApp" ל-source tabs
2. API או קריאה ישירה ל-Firestore: `collection('WhatsAppProfiles').orderBy('receivedAt','desc')`
3. הצגת כרטיסים באותו פורמט כמו Discovery (avatar, name, position, age, value, club)
4. Badge "WhatsApp" במקום Request Match / Hidden Gem
5. אפשרות: "הוסף לרשימת מעקב" / "הוסף לסגל" / "סמן כראיתי" / "התעלם"

**קבצים:**
- `mgsr-web/src/app/war-room/page.tsx` – הרחבת sourceFilter, fetch מ-Firestore
- `mgsr-web/src/app/api/war-room/whatsapp-profiles/route.ts` (אופציונלי – אם רוצים API במקום client-side)

### שלב 5: סנכרון סטטוס (0.5 יום)

**משימות:**
1. כשמוסיפים לרשימת מעקב/סגל – עדכון `status` ב-`WhatsAppProfiles`
2. (אופציונלי) Cloud Function שמאזין ל-`Shortlists`/`Players` ומעדכן `WhatsAppProfiles`

### שלב 6: אבטחה ובדיקות (1 יום)

**משימות:**
1. אימות חתימת Meta (X-Hub-Signature-256)
2. Rate limiting על Webhook
3. לוגים לדיבוג (ללא PII ב-production)
4. בדיקות: שליחת הודעה עם לינק Transfermarkt, וידוא שמופיע ב-War Room

---

## 6. API Endpoints

### 6.1 Webhook (חובה)

```
GET  /api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=XXX&hub.challenge=YYY
     → 200, body: hub.challenge

POST /api/whatsapp/webhook
     Body: Meta webhook payload (messages, contacts, etc.)
     → 200 (תמיד, כדי ש-Meta לא ינסה שוב)
```

### 6.2 קריאת פרופילים (אופציונלי)

אם לא רוצים client-side Firestore:

```
GET /api/war-room/whatsapp-profiles
    Headers: Authorization (Firebase ID token)
    → 200, { profiles: [...], count: N }
```

---

## 7. פירוט Webhook Payload (Meta)

דוגמה למבנה הודעה נכנסת:

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "PHONE_NUMBER_ID",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": { "display_phone_number": "...", "phone_number_id": "..." },
        "contacts": [{ "profile": { "name": "Sender Name" }, "wa_id": "972501234567" }],
        "messages": [{
          "from": "972501234567",
          "id": "wamid.xxx",
          "timestamp": "1234567890",
          "text": { "body": "https://www.transfermarkt.com/player-name/profil/spieler/12345" },
          "type": "text"
        }]
      },
      "field": "messages"
    }]
  }]
}
```

**חילוץ:**
- `entry[0].changes[0].value.messages` – מערך הודעות
- לכל הודעה: `messages[i].text.body` – טקסט
- `messages[i].id` – messageId
- `contacts[0].profile.name` – שם שולח
- `messages[i].from` – מספר טלפון

---

## 8. חילוץ URL (TypeScript)

```typescript
// mgsr-web/src/lib/transfermarktUrl.ts

const TM_URL_PATTERN = /https?:\/\/(?:www\.)?transfermarkt\.(?:com|co\.uk|de|es|fr|it|nl|pt|tr)\/[^\s<>"']+/gi;

function isPlayerProfileUrl(url: string): boolean {
  const lower = url.toLowerCase();
  if (!lower.includes('transfermarkt')) return false;
  return lower.includes('/profil/spieler/') || lower.includes('/profile/player/') || lower.includes('/spieler/');
}

function normalizeUrl(url: string): string {
  let u = url.trim().replace(/[.,;:!?)\]}\s]+$/, '');
  if (!u.startsWith('http')) u = 'https://' + u;
  if (u.includes('transfermarkt') && !u.startsWith('https://www.transfermarkt.com')) {
    const pathStart = u.indexOf('/', 8);
    const path = pathStart >= 0 ? u.slice(pathStart) : '';
    u = 'https://www.transfermarkt.com' + path;
  }
  return u;
}

export function extractTransfermarktPlayerUrls(text: string | null | undefined): string[] {
  if (!text?.trim()) return [];
  const matches = text.match(TM_URL_PATTERN) || [];
  const normalized = [...new Set(matches.filter(isPlayerProfileUrl).map(normalizeUrl))];
  return normalized;
}
```

---

## 9. Firestore Indexes

אם משתמשים ב-query עם `orderBy` + `where`:

```json
{
  "collectionGroup": "WhatsAppProfiles",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "receivedAt", "order": "DESCENDING" }
  ]
}
```

---

## 10. משתני סביבה

| משתנה | תיאור |
|-------|-------|
| `WHATSAPP_VERIFY_TOKEN` | ערך ל-`hub.verify_token` (בחר מחרוזת אקראית) |
| `WHATSAPP_APP_SECRET` | App Secret מ-Meta (לאימות חתימה) |
| `MGSR_BACKEND_URL` | כתובת mgsr-backend (כבר קיים) |

---

## 11. סיכום לוח זמנים

| שלב | משך | תלויות |
|-----|-----|--------|
| 1. תשתית Meta + Webhook | 1–2 ימים | חשבון Meta Business |
| 2. חילוץ URL ועיבוד | 1 יום | שלב 1 |
| 3. שמירה ב-Firestore | 0.5 יום | שלב 2 |
| 4. טאב War Room | 1–2 ימים | שלב 3 |
| 5. סנכרון סטטוס | 0.5 יום | שלב 4 |
| 6. אבטחה ובדיקות | 1 יום | כל השלבים |

**סה"כ משוער:** 5–7 ימי פיתוח (לא כולל המתנה לאישור Meta).

---

## 12. חלופות אם אין WhatsApp Business API

1. **העברה ידנית:** משתמש מעתיק לינק ומדביק בשדה באתר – פשוט אבל לא אוטומטי.
2. **בוט טלגרם:** אם יש גם קבוצת טלגרם – Telegram Bot API חינמי ופשוט יותר.
3. **אימייל:** העברה ל-address ייעודי, parsing של אימייל – אפשרי אבל פחות נוח מוואטסאפ.

---

## 13. צעדים הבאים

1. **החלטה:** האם יש/יהיה מספר WhatsApp Business?
2. **הרשמה:** יצירת אפליקציה ב-Meta for Developers
3. **פיתוח:** התחלה משלב 1 (Webhook) – אפשר לבדוק עם [webhook tester](https://webhook.site) לפני חיבור ל-Meta
