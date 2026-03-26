/**
 * Country names for mandate generation - common football markets.
 * Matches Android Countries.all (ISO countries in English).
 */
export const COUNTRIES = [
  'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Argentina', 'Armenia', 'Australia',
  'Austria', 'Azerbaijan', 'Bahrain', 'Belarus', 'Belgium', 'Belize', 'Benin', 'Bolivia',
  'Bosnia and Herzegovina', 'Botswana', 'Brazil', 'Bulgaria', 'Burkina Faso', 'Cameroon',
  'Canada', 'Chile', 'China', 'Colombia', 'Costa Rica', 'Croatia', 'Cuba', 'Cyprus',
  'Czech Republic', 'Denmark', 'Ecuador', 'Egypt', 'England', 'Estonia', 'Ethiopia',
  'Finland', 'France', 'Gabon', 'Georgia', 'Germany', 'Ghana', 'Greece', 'Guatemala',
  'Honduras', 'Hungary', 'Iceland', 'India', 'Indonesia', 'Iran', 'Iraq', 'Ireland',
  'Israel', 'Italy', 'Ivory Coast', 'Jamaica', 'Japan', 'Jordan', 'Kazakhstan', 'Kenya',
  'Kosovo', 'Kuwait', 'Kyrgyzstan', 'Latvia', 'Lebanon', 'Liberia', 'Libya', 'Lithuania',
  'Luxembourg', 'Malaysia', 'Mali', 'Malta', 'Mexico', 'Moldova', 'Montenegro', 'Morocco',
  'Mozambique', 'Netherlands', 'New Zealand', 'Nigeria', 'North Macedonia', 'Norway',
  'Oman', 'Pakistan', 'Palestine', 'Panama', 'Paraguay', 'Peru', 'Philippines', 'Poland',
  'Portugal', 'Qatar', 'Romania', 'Russia', 'Rwanda', 'Saudi Arabia', 'Scotland',
  'Senegal', 'Serbia', 'Singapore', 'Slovakia', 'Slovenia', 'South Africa', 'South Korea',
  'Spain', 'Sudan', 'Sweden', 'Switzerland', 'Syria', 'Tanzania', 'Thailand', 'Togo',
  'Tunisia', 'Turkey', 'Türkiye', 'Uganda', 'Ukraine', 'United Arab Emirates', 'United States',
  'Uruguay', 'Uzbekistan', 'Venezuela', 'Vietnam', 'Wales', 'Zambia', 'Zimbabwe',
].sort();

/** Normalize country names that have multiple spellings (e.g. Turkey / Türkiye). */
function normalizeCountry(name: string | null | undefined): string {
  const lower = (name ?? '').trim().toLowerCase();
  if (lower === 'türkiye' || lower === 'turkiye') return 'turkey';
  return lower;
}

/** Compare two country names, handling aliases like Turkey / Türkiye. */
export function matchCountry(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  return normalizeCountry(a) === normalizeCountry(b);
}
