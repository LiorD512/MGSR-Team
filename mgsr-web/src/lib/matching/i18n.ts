/** EN / HE labels for the matching engine (kept local to the feature, like the Press Room strings). */
import type { Bucket, ReasonCode } from './engine';

const REASONS: Record<ReasonCode, [string, string]> = {
  primary_position: ['Main position', 'עמדה ראשית'],
  secondary_position: ['Secondary position', 'עמדה משנית'],
  adjacent_position: ['Adjacent position', 'עמדה סמוכה'],
  budget_in_band: ['In budget', 'בתקציב'],
  budget_below: ['Below budget', 'מתחת לתקציב'],
  budget_stretch: ['Slightly over budget', 'מעט מעל התקציב'],
  budget_over: ['Over budget', 'מעל התקציב'],
  budget_unknown: ['Price unknown', 'מחיר לא ידוע'],
  free_agent: ['Free agent', 'שחקן חופשי'],
  contract_6m: ['Contract ends ≤6m', 'חוזה מסתיים ≤6 ח׳'],
  contract_12m: ['Contract ends ≤12m', 'חוזה מסתיים ≤12 ח׳'],
  on_loan: ['On loan', 'בהשאלה'],
  contract_long: ['Long contract', 'חוזה ארוך'],
  contract_unknown: ['Contract unknown', 'חוזה לא ידוע'],
  level_fit: ['Right level for club', 'רמה מתאימה למועדון'],
  level_above: ['Far above what the club signs', 'הרבה מעל מה שהמועדון מחתים'],
  level_below: ['Below club level', 'מתחת לרמת המועדון'],
  level_low: ['Well below club level', 'הרבה מתחת לרמת המועדון'],
  level_unknown: ['Club level unknown', 'רמת מועדון לא ידועה'],
  inactive: ['No game in 6+ months', 'ללא משחק 6+ חודשים'],
  inactive_long: ['No game in 12+ months', 'ללא משחק 12+ חודשים'],
  regular_starter: ['Regular starter', 'פותח קבוע'],
  rotation: ['Rotation player', 'שחקן רוטציה'],
  low_minutes: ['Few minutes lately', 'מעט דקות לאחרונה'],
  hot_form: ['In form', 'בכושר'],
  cold_form: ['Poor form', 'כושר ירוד'],
  benched: ['Benched / out of squad', 'ספסל / מחוץ לסגל'],
  form_unknown: ['No recent games data', 'אין נתוני משחקים'],
  age_in_range: ['Age fits', 'גיל מתאים'],
  age_near: ['Age just outside range', 'גיל מעט מחוץ לטווח'],
  age_unknown: ['Age unknown', 'גיל לא ידוע'],
  salary_in_band: ['Salary fits', 'שכר מתאים'],
  salary_stretch: ['Salary slightly high', 'שכר מעט גבוה'],
  salary_over: ['Salary too high', 'שכר גבוה מדי'],
  salary_unknown: ['Salary unknown', 'שכר לא ידוע'],
  foot_match: ['Foot fits', 'רגל מתאימה'],
  foot_both: ['Two-footed', 'דו-רגלי'],
  foot_unknown: ['Foot unknown', 'רגל לא ידועה'],
  eu_unknown: ['EU status unknown', 'סטטוס EU לא ידוע'],
  mandate: ['Mandate', 'מנדט'],
  interested_israel: ['Interested in Israel', 'מעוניין בישראל'],
};

const BUCKETS: Record<Bucket, [string, string]> = {
  strong: ['Strong', 'חזק'],
  good: ['Good', 'טוב'],
  stretch: ['Stretch', 'גבולי'],
};

const UI = {
  score: ['Fit', 'התאמה'],
  confidence: ['data', 'נתונים'],
  show_stretch: ['Show stretch matches ({n})', 'הצג התאמות גבוליות ({n})'],
  hide_stretch: ['Hide stretch matches', 'הסתר התאמות גבוליות'],
  offered_group: ['Already offered for this request', 'כבר הוצעו לדרישה זו'],
  dismissed_group: ['Marked "not a fit" ({n})', 'סומנו "לא מתאים" ({n})'],
  offered_club: ['Offered to club', 'הוצע למועדון'],
  offered_request: ['Offered', 'הוצע'],
  good_fit: ['Good fit', 'מתאים'],
  not_fit: ['Not a fit', 'לא מתאים'],
  undo: ['Undo', 'בטל'],
  marked_fit: ['Marked as a good fit', 'סומן כמתאים'],
  none: ['No roster player fits this request yet', 'אין עדיין שחקן בסגל שמתאים לדרישה'],
  loading_levels: ['Checking club levels…', 'בודק רמות מועדונים…'],
  matches: ['matches', 'התאמות'],
  level_line: ['{club} signs players worth {lo}–{hi}', '{club} מחתימה שחקנים בשווי {lo}–{hi}'],
  level_player: ['he is {mv}', 'הוא {mv}'],
  level_from: ['his club {club} {m}', 'המועדון שלו {club} {m}'],
  level_score: ['Level fit {n}', 'התאמת רמה {n}'],
  inactive_months: ['last game {n} months ago', 'משחק אחרון לפני {n} חודשים'],
  ai_button: ['AI scout check (top {n})', 'בדיקת סקאוט AI ({n} מובילים)'],
  ai_running: ['Asking the AI scout…', 'שואל את סקאוט ה-AI…'],
  ai_realistic: ['AI: realistic', 'AI: ריאלי'],
  ai_unlikely: ['AI: unlikely', 'AI: לא סביר'],
  ai_budget: ['AI check limit reached for this month', 'הגעתם למכסת בדיקות ה-AI החודש'],
  ai_error: ['AI check failed — try again later', 'בדיקת ה-AI נכשלה — נסו שוב מאוחר יותר'],
  ai_note: ['AI notes are advice only — they never hide players', 'הערות ה-AI הן המלצה בלבד — הן לא מסתירות שחקנים'],
} as const;

export type MatchingUiKey = keyof typeof UI;

export function reasonLabel(code: ReasonCode, isHebrew: boolean): string {
  return REASONS[code]?.[isHebrew ? 1 : 0] ?? code;
}
export function bucketLabel(b: Bucket, isHebrew: boolean): string {
  return BUCKETS[b][isHebrew ? 1 : 0];
}
export function mt(key: MatchingUiKey, isHebrew: boolean, n?: number | Record<string, string | number>): string {
  let s: string = UI[key][isHebrew ? 1 : 0];
  if (n == null) return s;
  const vars = typeof n === 'number' ? { n } : n;
  for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}
