/**
 * Predefined task templates for player-related tasks.
 * Used when adding a task from a player page for consistency and efficiency.
 */
export interface PlayerTaskTemplate {
  id: string;
  titleEn: string;
  titleHe: string;
  /** Optional: placeholder for month name, e.g. "March" */
  hasMonthPlaceholder?: boolean;
}

export const PLAYER_TASK_TEMPLATES: PlayerTaskTemplate[] = [
  { id: 'talk_month_status', titleEn: 'Talk in {month} to check status', titleHe: 'לדבר בחודש {month} לבדוק סטטוס', hasMonthPlaceholder: true },
  { id: 'call_agent', titleEn: 'Call player\'s agent', titleHe: 'להתקשר לסוכן השחקן' },
  { id: 'check_contract', titleEn: 'Check contract / expiry date', titleHe: 'לבדוק חוזה / תאריך סיום' },
  { id: 'send_documents', titleEn: 'Send documents (mandate, etc.)', titleHe: 'לשלוח מסמכים (מנדט וכו\')' },
  { id: 'meeting_player', titleEn: 'Meeting / call with player', titleHe: 'פגישה / שיחה עם השחקן' },
  { id: 'follow_match', titleEn: 'Follow match / performance', titleHe: 'מעקב אחרי משחק / ביצועים' },
];

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_HE = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

export function getTemplateTitle(template: PlayerTaskTemplate, lang: 'en' | 'he', month?: number): string {
  const title = lang === 'he' ? template.titleHe : template.titleEn;
  if (template.hasMonthPlaceholder && month != null) {
    const monthName = lang === 'he' ? MONTHS_HE[month] : MONTHS_EN[month];
    return title.replace('{month}', monthName);
  }
  if (template.hasMonthPlaceholder) {
    return title.replace('{month}', lang === 'he' ? 'X' : 'X');
  }
  return title;
}
