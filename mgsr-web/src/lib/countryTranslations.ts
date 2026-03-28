/**
 * Country name translations for Hebrew display.
 * Data is fetched from Firestore remote config (with hardcoded fallbacks).
 * Re-exports from the centralized appConfig module.
 */
import { appConfig, getCountryDisplayName } from '@/lib/appConfig';

export const COUNTRY_EN_TO_HE: Record<string, string> = new Proxy({} as Record<string, string>, {
  get(_target, prop: string) {
    return appConfig.countryEnToHe[prop];
  },
  has(_target, prop: string) {
    return prop in appConfig.countryEnToHe;
  },
  ownKeys() {
    return Object.keys(appConfig.countryEnToHe);
  },
  getOwnPropertyDescriptor(_target, prop: string) {
    if (prop in appConfig.countryEnToHe) {
      return { configurable: true, enumerable: true, value: appConfig.countryEnToHe[prop] };
    }
    return undefined;
  },
});

export { getCountryDisplayName };
