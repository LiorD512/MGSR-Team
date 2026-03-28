#!/usr/bin/env node
/**
 * Seed / update the Firestore Config collection with remotely configurable data.
 *
 * Usage:
 *   cd functions && NODE_PATH=./node_modules node ../scripts/seed-remote-config.js
 *
 * Documents created/merged:
 *   Config/positions       — filter list + EN/HE display names
 *   Config/euCountries     — EU member-state names (already exists from web)
 *   Config/countryNames    — EN→HE country translations
 *   Config/salaryRanges    — salary dropdown options
 *   Config/transferFees    — transfer-fee dropdown options
 *   Config/taskTemplates   — predefined player-task templates
 */

const admin = require("firebase-admin");
if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

// ─── Positions ──────────────────────────────────────────────────────────

const POSITIONS_DOC = {
  // The canonical filter list shown on Players / Shortlist screens
  filterList: ["GK", "CB", "RB", "LB", "DM", "CM", "AM", "LW", "RW", "CF", "SS"],

  // Long display names (used in request headers, etc.)
  displayEN: {
    GK: "GOALKEEPER",
    CB: "CENTER BACK",
    RB: "RIGHT BACK",
    LB: "LEFT BACK",
    DM: "DEFENSIVE MIDFIELDER",
    CM: "CENTRAL MIDFIELDER",
    AM: "ATTACKING MIDFIELDER",
    LM: "LEFT MIDFIELDER",
    RM: "RIGHT MIDFIELDER",
    LW: "LEFT WINGER",
    RW: "RIGHT WINGER",
    CF: "CENTER FORWARD",
    ST: "STRIKER",
    SS: "SECOND STRIKER",
    CDM: "DEFENSIVE MIDFIELDER",
    LWB: "LEFT WING BACK",
    RWB: "RIGHT WING BACK",
    DEF: "DEFENDER",
    MID: "MIDFIELDER",
    FWD: "FORWARD",
  },

  displayHE: {
    GK: "שוער",
    CB: "בלם",
    RB: "מגן ימני",
    LB: "מגן שמאלי",
    DM: "קשר אחורי",
    CM: "קשר מרכזי",
    AM: "קשר התקפי",
    LM: "קשר שמאלי",
    RM: "קשר ימני",
    LW: "כנף שמאל",
    RW: "כנף ימין",
    CF: "חלוץ מרכזי",
    ST: "חלוץ",
    SS: "חלוץ שני",
    CDM: "קשר 50/50",
    LWB: "כנף אחורי שמאלי",
    RWB: "כנף אחורי ימני",
    DEF: "מגן",
    MID: "קשר",
    FWD: "חלוץ",
  },

  updatedAt: Date.now(),
};

// ─── EU Countries ───────────────────────────────────────────────────────

const EU_COUNTRIES_DOC = {
  countries: [
    "Austria", "Belgium", "Bulgaria", "Croatia", "Cyprus",
    "Czech Republic", "Czechia", "Denmark", "Estonia", "Finland",
    "France", "Germany", "Greece", "Hungary", "Ireland",
    "Italy", "Latvia", "Lithuania", "Luxembourg", "Malta",
    "Netherlands", "Poland", "Portugal", "Romania", "Slovakia",
    "Slovenia", "Spain", "Sweden",
  ],
  updatedAt: Date.now(),
};

// ─── Country Translations ───────────────────────────────────────────────

const COUNTRY_NAMES_DOC = {
  enToHe: {
    Afghanistan: "אפגניסטן",
    Albania: "אלבניה",
    Algeria: "אלג'יריה",
    Andorra: "אנדורה",
    Angola: "אנגולה",
    Argentina: "ארגנטינה",
    Armenia: "ארמניה",
    Australia: "אוסטרליה",
    Austria: "אוסטריה",
    Azerbaijan: "אזרבייג'ן",
    Bahrain: "בחריין",
    Bangladesh: "בנגלדש",
    Belarus: "בלארוס",
    Belgium: "בלגיה",
    Belize: "בליז",
    Bosnia: "בוסניה",
    "Bosnia and Herzegovina": "בוסניה והרצגובינה",
    "Bosnia-Herzegovina": "בוסניה והרצגובינה",
    Botswana: "בוטסואנה",
    Brazil: "ברזיל",
    Bulgaria: "בולגריה",
    Cameroon: "קמרון",
    Canada: "קנדה",
    Chile: "צ'ילה",
    China: "סין",
    Colombia: "קולומביה",
    Congo: "קונגו",
    "Congo DR": "קונגו הדמוקרטית",
    "DR Congo": "קונגו הדמוקרטית",
    "Democratic Republic of the Congo": "קונגו הדמוקרטית",
    "Republic of the Congo": "קונגו",
    Curaçao: "קוראסאו",
    Curacao: "קוראסאו",
    "Costa Rica": "קוסטה ריקה",
    Croatia: "קרואטיה",
    Cuba: "קובה",
    Cyprus: "קפריסין",
    "Czech Republic": "צ'כיה",
    Czechia: "צ'כיה",
    Denmark: "דנמרק",
    Ecuador: "אקוואדור",
    Egypt: "מצרים",
    England: "אנגליה",
    Estonia: "אסטוניה",
    Ethiopia: "אתיופיה",
    Finland: "פינלנד",
    France: "צרפת",
    Georgia: "גאורגיה",
    Germany: "גרמניה",
    Guadeloupe: "גוואדלופ",
    "French Guiana": "גיאנה הצרפתית",
    Ghana: "גאנה",
    Greece: "יוון",
    Hungary: "הונגריה",
    Iceland: "איסלנד",
    India: "הודו",
    Indonesia: "אינדונזיה",
    Iran: "איראן",
    Iraq: "עיראק",
    Ireland: "אירלנד",
    Israel: "ישראל",
    Italy: "איטליה",
    "Ivory Coast": "חוף השנהב",
    "Côte d'Ivoire": "חוף השנהב",
    "Cote d'Ivoire": "חוף השנהב",
    "Cote D'Ivoire": "חוף השנהב",
    Japan: "יפן",
    Jordan: "ירדן",
    Kazakhstan: "קזחסטן",
    Kenya: "קניה",
    Kosovo: "קוסובו",
    Kuwait: "כווית",
    Latvia: "לטביה",
    Lebanon: "לבנון",
    Libya: "לוב",
    Liechtenstein: "ליכטנשטיין",
    Lithuania: "ליטא",
    Luxembourg: "לוקסמבורג",
    Malaysia: "מלזיה",
    Malta: "מלטה",
    Martinique: "מרטיניק",
    Mexico: "מקסיקו",
    Moldova: "מולדובה",
    Monaco: "מונאקו",
    Montenegro: "מונטנגרו",
    Morocco: "מרוקו",
    Netherlands: "הולנד",
    "New Zealand": "ניו זילנד",
    Nigeria: "ניגריה",
    "North Korea": "קוריאה הצפונית",
    "North Macedonia": "מקדוניה הצפונית",
    "Northern Ireland": "צפון אירלנד",
    Norway: "נורווגיה",
    Oman: "עומאן",
    Réunion: "ראוניון",
    Reunion: "ראוניון",
    Other: "אחר",
    Pakistan: "פקיסטן",
    Panama: "פנמה",
    Paraguay: "פרגוואי",
    Peru: "פרו",
    Philippines: "הפיליפינים",
    Poland: "פולין",
    Portugal: "פורטוגל",
    Qatar: "קטאר",
    Romania: "רומניה",
    Russia: "רוסיה",
    "Saudi Arabia": "ערב הסעודית",
    Scotland: "סקוטלנד",
    Senegal: "סנגל",
    Serbia: "סרביה",
    Singapore: "סינגפור",
    Slovakia: "סלובקיה",
    Slovenia: "סלובניה",
    "South Africa": "דרום אפריקה",
    "South Korea": "דרום קוריאה",
    "Korea Republic": "דרום קוריאה",
    Spain: "ספרד",
    "Sri Lanka": "סרי לנקה",
    Sweden: "שוודיה",
    Switzerland: "שווייץ",
    Syria: "סוריה",
    Tunisia: "תוניסיה",
    Turkey: "טורקיה",
    Türkiye: "טורקיה",
    Ukraine: "אוקראינה",
    "United Arab Emirates": "איחוד האמירויות",
    UAE: "איחוד האמירויות",
    "United Kingdom": "הממלכה המאוחדת",
    UK: "הממלכה המאוחדת",
    "United States": "ארצות הברית",
    "United States of America": "ארצות הברית",
    USA: "ארצות הברית",
    Uruguay: "אורוגוואי",
    Uzbekistan: "אוזבקיסטן",
    Venezuela: "ונצואלה",
    Vietnam: "וייטנאם",
    Wales: "ויילס",
    Yemen: "תימן",
    Zambia: "זמביה",
    Zimbabwe: "זימבבואה",
  },
  updatedAt: Date.now(),
};

// ─── Salary & Transfer Fee Options ──────────────────────────────────────

const SALARY_RANGES_DOC = {
  options: [">5", "6-10", "11-15", "16-20", "20-25", "26-30", "30+"],
  updatedAt: Date.now(),
};

const TRANSFER_FEES_DOC = {
  options: ["Free/Free loan", "<200", "300-600", "700-900", "1m+"],
  updatedAt: Date.now(),
};

// ─── Task Templates ─────────────────────────────────────────────────────

const TASK_TEMPLATES_DOC = {
  templates: [
    { id: "talk_month_status", titleEn: "Talk in {month} to check status", titleHe: "לדבר בחודש {month} לבדוק סטטוס", hasMonthPlaceholder: true },
    { id: "call_agent", titleEn: "Call player's agent", titleHe: "להתקשר לסוכן השחקן", titleEnWomen: "Call athlete's agent", titleHeWomen: "להתקשר לסוכן השחקנית" },
    { id: "check_contract", titleEn: "Check contract / expiry date", titleHe: "לבדוק חוזה / תאריך סיום" },
    { id: "send_documents", titleEn: "Send documents (mandate, etc.)", titleHe: "לשלוח מסמכים (מנדט וכו')" },
    { id: "meeting_player", titleEn: "Meeting / call with player", titleHe: "פגישה / שיחה עם השחקן", titleEnWomen: "Meeting / call with athlete", titleHeWomen: "פגישה / שיחה עם השחקנית" },
    { id: "follow_match", titleEn: "Follow match / performance", titleHe: "מעקב אחרי משחק / ביצועים" },
  ],
  monthsEN: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  monthsHE: ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"],
  updatedAt: Date.now(),
};

// ═══════════════════════════════════════════════════════════════════════
// Seed
// ═══════════════════════════════════════════════════════════════════════

async function seed() {
  console.log("Seeding Config collection...\n");

  const writes = [
    { id: "positions",     data: POSITIONS_DOC },
    { id: "euCountries",   data: EU_COUNTRIES_DOC },
    { id: "countryNames",  data: COUNTRY_NAMES_DOC },
    { id: "salaryRanges",  data: SALARY_RANGES_DOC },
    { id: "transferFees",  data: TRANSFER_FEES_DOC },
    { id: "taskTemplates", data: TASK_TEMPLATES_DOC },
  ];

  for (const { id, data } of writes) {
    await db.collection("Config").doc(id).set(data, { merge: true });
    console.log("  ✅ Config/" + id);
  }

  console.log("\nDone — " + writes.length + " docs written.\n");
}

seed().then(() => process.exit(0));
