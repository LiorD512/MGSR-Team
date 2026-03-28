/**
 * Predefined task templates for player-related tasks.
 * Data is fetched from Firestore remote config (with hardcoded fallbacks).
 */
import { appConfig, type TaskTemplate } from '@/lib/appConfig';

export type PlayerTaskTemplate = TaskTemplate;

export const PLAYER_TASK_TEMPLATES: PlayerTaskTemplate[] = new Proxy([] as PlayerTaskTemplate[], {
  get(target, prop) {
    const templates = appConfig.taskTemplates.templates;
    if (prop === 'length') return templates.length;
    if (prop === Symbol.iterator) return templates[Symbol.iterator].bind(templates);
    if (typeof prop === 'string' && !isNaN(Number(prop))) return templates[Number(prop)];
    // Proxy array methods like map, forEach, etc.
    const val = (templates as any)[prop];
    return typeof val === 'function' ? val.bind(templates) : val;
  },
});

export function getTemplateTitle(template: PlayerTaskTemplate, lang: 'en' | 'he', month?: number, isWomen?: boolean): string {
  const monthsEN = appConfig.taskTemplates.monthsEN;
  const monthsHE = appConfig.taskTemplates.monthsHE;
  const useWomen = isWomen && (lang === 'he' ? template.titleHeWomen : template.titleEnWomen);
  const title = lang === 'he'
    ? (useWomen ? template.titleHeWomen! : template.titleHe)
    : (useWomen ? template.titleEnWomen! : template.titleEn);
  if (template.hasMonthPlaceholder && month != null) {
    const monthName = lang === 'he' ? monthsHE[month] : monthsEN[month];
    return title.replace('{month}', monthName);
  }
  if (template.hasMonthPlaceholder) {
    return title.replace('{month}', 'X');
  }
  return title;
}
