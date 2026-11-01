'use client';

import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Transfer Radar UI strings (EN + HE). Kept local to the feature so it does not touch the 4,000-line shared dictionary.
 * NOTE: article/report text is English only by owner decision; only the interface chrome is bilingual.
 */
const EN = {
  nav: 'Transfer Radar', nav_sources: 'Radar Sources', crumb: 'Signals', kicker: 'Signals · Transfer Radar', title_a: 'Morning', title_b: 'Brief',
  subtitle: 'Players who may become available - sorted by what changed. Reports are in English with the original headline beside them.',
  window: 'Window', last_run: 'Last pipeline run', never: 'No run yet',
  kpi_sources: 'Active sources', kpi_attention: 'need attention', kpi_articles: 'Articles, 30 days', kpi_reports: 'Evidence reports', kpi_opps: 'Players listed', kpi_monitor: 'Monitor and above', kpi_new: 'New this week', kpi_queue: 'Waiting for AI',
  f_country: 'Country', f_all: 'All', f_show: 'Show', f_monitor: 'Monitor +', f_loan: 'Loan', f_transfer: 'Transfer', f_low: 'Low', f_closed: 'Closed', f_age: 'Age of info', f_sort: 'Sort',
  s_score: 'Highest score', s_new: 'Newest', s_reliable: 'Most reliable', s_urgent: 'Most urgent', search: 'Search player or club...',
  c_score: 'Score', c_player: 'Player', c_country: 'Country', c_signal: 'Signal type', c_what: 'What happened', c_sources: 'Sources', c_status: 'Status', c_urgency: 'Urgency',
  reports: 'reports', report: 'report', origins: 'independent origins', origin: 'independent origin', none: 'No players match these filters yet.',
  loading: 'Loading...', retry: 'Retry',
  p_leads: 'Leads needing a name', p_leads_note: 'The headline does not name the player - the article is read next.', p_countries: 'Opportunities by country', p_recent: 'Recently updated', p_removed: 'Removed by rules', p_removed_note: 'The AI suggested these; the rules dropped them (stars, national teams, other sports, coaches, completed transfers).', p_new_sources: 'New sources',
  budget: 'AI budget this month', of: 'of',
  not_configured_title: 'Transfer Radar is not connected yet', not_configured_text: 'The database is not configured on the server. Add TURSO_URL and TURSO_TOKEN to the Vercel environment variables, then run the pipeline once.',
  forbidden_title: 'Transfer Radar is in private testing', forbidden_text: 'Your account does not have access yet. Ask the administrator to add your email.',
  empty_title: 'No data yet', empty_text: 'The pipeline has not produced results. Run the "Transfer Radar pipeline" workflow once on GitHub.',
  lvl_Exceptional: 'Exceptional', 'lvl_High priority': 'High priority', lvl_Potential: 'Potential', lvl_Monitor: 'Monitor', 'lvl_Low priority': 'Low priority', lvl_Closed: 'Closed',
  urg_High: 'High', urg_Medium: 'Medium', urg_Low: 'Low', urg_Closed: 'Closed',
  v_CONFIRMED: 'Confirmed', v_REPORTED: 'Reported', v_RUMOR: 'Rumor', ai_label: 'AI',
  cat_Transfer_availability: 'Transfer availability', cat_Sporting_status: 'Sporting status', cat_Relationship_issues: 'Relationship issues', cat_Financial: 'Financial', cat_Opportunity_indicators: 'Opportunity indicators',
  back: 'Back to Morning Brief', profile_kicker: 'Player intelligence profile', why_score: 'Why this score', timeline: 'Intelligence timeline - newest first', facts: 'Facts', reported_rumor: 'Reported / rumor',
  ai_assessment: 'AI assessment - generated, not a source fact', next_action: 'Recommended next action - rule-based', confirmed: 'Confirmed', reported: 'Reported', rumor: 'Rumor', unknown: 'Unknown', unknown_unverified: 'Unknown (not verified)',
  age_dob: 'Age / DOB', nationality: 'Nationality', position: 'Position', contract: 'Contract expiry', minutes: 'Minutes', nothing_confirmed: 'Nothing confirmed by an official source yet.',
  comp_availability: 'Transfer availability', comp_exclusion: 'Sporting status', comp_playingTime: 'Playing time', comp_relationship: 'Relationship issues', comp_financial: 'Club finance', comp_replacement: 'Replacement signing', comp_other: 'Other signals',
  comp_contract: 'Contract situation', comp_independence: 'Independent sources', conf: 'confidence', rec: 'recency', status_change: 'STATUS CHANGE', original: 'Original', open_source: 'Open source', claim: 'claim',
  headline_only: 'headline only', feedback: 'Was this right?', fb_correct: 'Correct', fb_incorrect: 'Wrong', fb_outdated: 'Outdated', fb_thanks: 'Thanks - noted',
  share_whatsapp: 'Share on WhatsApp', btn_back_list: 'Back',
  ai_text_closed: 'Earlier reports (club open to sell, player out of the squad) were followed by statements that a transfer is confirmed or announced. Treat it as likely moved.',
  ai_text_multi: 'Signals from more than one category point the same way.', ai_text_origins: 'independent origins report it.', ai_text_single: 'Only one independent origin so far - not enough to treat as established.',
  ai_text_contract: 'Contract expiry is unknown; if it ends within 6 months this would move up.', ai_text_unconfirmed: 'Not confirmed by the club.',
  src_title_a: 'Source', src_title_b: 'Center', src_sub: 'Every outlet the radar reads, its health and what it produced. New and manually added sources start on probation.',
  src_name: 'Source', src_country: 'Country', src_access: 'Access', src_tier: 'Tier', src_items: 'Items', src_reports: 'Evidence', src_status: 'Status', src_last: 'Last scan', src_every: 'Every',
  src_approve: 'Approve', src_disable: 'Disable', src_enable: 'Enable', src_remove: 'Remove', src_add: 'Add source', src_add_url: 'Website address (https://...)', src_add_name: 'Name (optional)', src_add_country: 'Country (optional)',
  src_admin_only: 'Only admins can change sources.', src_headline_only: 'Headline-only (search)', src_failures: 'failures', src_confirm_remove: 'Remove this source?',
  alerts: 'Alerts', alerts_none: 'No alerts yet.', min: 'min',
};
type Key = keyof typeof EN;

const HE: Record<Key, string> = {
  nav: 'רדאר העברות', nav_sources: 'מקורות הרדאר', crumb: 'אותות', kicker: 'אותות · רדאר העברות', title_a: 'תדריך', title_b: 'בוקר',
  subtitle: 'שחקנים שעשויים להתפנות - ממוינים לפי מה ששונה. הדיווחים באנגלית, וכותרת המקור לצידם.',
  window: 'חלון זמן', last_run: 'ריצה אחרונה', never: 'טרם רץ',
  kpi_sources: 'מקורות פעילים', kpi_attention: 'דורשים טיפול', kpi_articles: 'כתבות, 30 יום', kpi_reports: 'דיווחי הוכחה', kpi_opps: 'שחקנים ברשימה', kpi_monitor: 'מעקב ומעלה', kpi_new: 'חדשים השבוע', kpi_queue: 'ממתינים ל-AI',
  f_country: 'מדינה', f_all: 'הכול', f_show: 'הצג', f_monitor: 'מעקב +', f_loan: 'השאלה', f_transfer: 'העברה', f_low: 'נמוך', f_closed: 'נסגרו', f_age: 'גיל המידע', f_sort: 'מיון',
  s_score: 'ציון גבוה', s_new: 'החדשים ביותר', s_reliable: 'האמינים ביותר', s_urgent: 'הדחופים ביותר', search: 'חיפוש שחקן או קבוצה...',
  c_score: 'ציון', c_player: 'שחקן', c_country: 'מדינה', c_signal: 'סוג אות', c_what: 'מה קרה', c_sources: 'מקורות', c_status: 'סטטוס', c_urgency: 'דחיפות',
  reports: 'דיווחים', report: 'דיווח', origins: 'מקורות עצמאיים', origin: 'מקור עצמאי', none: 'אין עדיין שחקנים התואמים לסינון.',
  loading: 'טוען...', retry: 'נסה שוב',
  p_leads: 'לידים שדורשים שם', p_leads_note: 'הכותרת לא מציינת את שם השחקן - הכתבה תיקרא בהמשך.', p_countries: 'הזדמנויות לפי מדינה', p_recent: 'עודכנו לאחרונה', p_removed: 'הוסרו לפי כללים', p_removed_note: 'ה-AI הציע אותם והכללים דחו (כוכבים, נבחרות, ענפי ספורט אחרים, מאמנים, העברות שהושלמו).', p_new_sources: 'מקורות חדשים',
  budget: 'תקציב AI החודש', of: 'מתוך',
  not_configured_title: 'רדאר ההעברות עדיין לא מחובר', not_configured_text: 'מסד הנתונים לא מוגדר בשרת. יש להוסיף TURSO_URL ו-TURSO_TOKEN למשתני הסביבה של Vercel ולהריץ את התהליך פעם אחת.',
  forbidden_title: 'רדאר ההעברות בשלב בדיקות פרטי', forbidden_text: 'לחשבון שלך אין עדיין גישה. יש לבקש מהמנהל להוסיף את האימייל שלך.',
  empty_title: 'אין נתונים עדיין', empty_text: 'התהליך עדיין לא הפיק תוצאות. יש להריץ פעם אחת את ה-workflow "Transfer Radar pipeline" ב-GitHub.',
  lvl_Exceptional: 'יוצא דופן', 'lvl_High priority': 'עדיפות גבוהה', lvl_Potential: 'פוטנציאל', lvl_Monitor: 'מעקב', 'lvl_Low priority': 'עדיפות נמוכה', lvl_Closed: 'נסגר',
  urg_High: 'גבוהה', urg_Medium: 'בינונית', urg_Low: 'נמוכה', urg_Closed: 'סגור',
  v_CONFIRMED: 'מאומת', v_REPORTED: 'דווח', v_RUMOR: 'שמועה', ai_label: 'AI',
  cat_Transfer_availability: 'זמינות להעברה', cat_Sporting_status: 'מצב ספורטיבי', cat_Relationship_issues: 'בעיות יחסים', cat_Financial: 'פיננסי', cat_Opportunity_indicators: 'אינדיקטורים להזדמנות',
  back: 'חזרה לתדריך הבוקר', profile_kicker: 'פרופיל מודיעין שחקן', why_score: 'למה הציון הזה', timeline: 'ציר זמן מודיעיני - מהחדש לישן', facts: 'עובדות', reported_rumor: 'דיווחים / שמועות',
  ai_assessment: 'הערכת AI - נוצרה אוטומטית, לא עובדה ממקור', next_action: 'פעולה מומלצת - מבוססת כללים', confirmed: 'מאומת', reported: 'דווח', rumor: 'שמועה', unknown: 'לא ידוע', unknown_unverified: 'לא ידוע (לא אומת)',
  age_dob: 'גיל / תאריך לידה', nationality: 'אזרחות', position: 'עמדה', contract: 'סיום חוזה', minutes: 'דקות משחק', nothing_confirmed: 'עדיין לא אושר דבר ממקור רשמי.',
  comp_availability: 'זמינות להעברה', comp_exclusion: 'מצב ספורטיבי', comp_playingTime: 'זמן משחק', comp_relationship: 'בעיות יחסים', comp_financial: 'מצב כלכלי של המועדון', comp_replacement: 'חיזוק בעמדה', comp_other: 'אותות אחרים',
  comp_contract: 'מצב החוזה', comp_independence: 'מקורות עצמאיים', conf: 'ביטחון', rec: 'עדכניות', status_change: 'שינוי סטטוס', original: 'מקור', open_source: 'פתח מקור', claim: 'סוג טענה',
  headline_only: 'כותרת בלבד', feedback: 'האם זה נכון?', fb_correct: 'נכון', fb_incorrect: 'שגוי', fb_outdated: 'לא עדכני', fb_thanks: 'תודה - נרשם',
  share_whatsapp: 'שיתוף בוואטסאפ', btn_back_list: 'חזרה',
  ai_text_closed: 'דיווחים קודמים (המועדון פתוח למכירה, השחקן מחוץ לסגל) הלכו אחריהם הודעות שהעברה אושרה או הוכרזה. יש להתייחס אליו כשחקן שכנראה עבר.',
  ai_text_multi: 'אותות ביותר מקטגוריה אחת מצביעים לאותו כיוון.', ai_text_origins: 'מקורות עצמאיים מדווחים על כך.', ai_text_single: 'עד כה מקור עצמאי אחד בלבד - לא מספיק כדי להתייחס לכך כמבוסס.',
  ai_text_contract: 'מועד סיום החוזה לא ידוע; אם הוא בתוך 6 חודשים, העדיפות תעלה.', ai_text_unconfirmed: 'לא אושר על ידי המועדון.',
  src_title_a: 'מרכז', src_title_b: 'המקורות', src_sub: 'כל אתר שהרדאר קורא, מצבו ומה שהפיק. מקורות חדשים ומקורות שהוספו ידנית מתחילים בתקופת ניסיון.',
  src_name: 'מקור', src_country: 'מדינה', src_access: 'גישה', src_tier: 'דירוג', src_items: 'פריטים', src_reports: 'הוכחות', src_status: 'סטטוס', src_last: 'סריקה אחרונה', src_every: 'כל',
  src_approve: 'אשר', src_disable: 'השבת', src_enable: 'הפעל', src_remove: 'הסר', src_add: 'הוסף מקור', src_add_url: 'כתובת האתר (https://...)', src_add_name: 'שם (לא חובה)', src_add_country: 'מדינה (לא חובה)',
  src_admin_only: 'רק מנהלים יכולים לשנות מקורות.', src_headline_only: 'כותרות בלבד (חיפוש)', src_failures: 'כשלים', src_confirm_remove: 'להסיר את המקור?',
  alerts: 'התראות', alerts_none: 'אין התראות עדיין.', min: 'דק׳',
};

export function useRadarT() {
  const { lang, isRtl } = useLanguage();
  const dict = lang === 'he' ? HE : EN;
  const tr = (k: Key | string): string => (dict as Record<string, string>)[k] ?? (EN as Record<string, string>)[k] ?? String(k);
  return { tr, lang, isRtl };
}
export const levelKey = (l: string) => `lvl_${l}`;
export const catKey = (c: string) => `cat_${c.replace(/\s+/g, '_')}`;
