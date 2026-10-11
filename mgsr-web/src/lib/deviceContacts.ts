/**
 * Device (phone) address-book access via the Contact Picker API.
 *
 * This reads the user's OWN phone contacts — NOT the app's Contacts database.
 * The browser shows the native OS contact picker; the user chooses one contact
 * and only the selected fields are returned (no bulk/background read).
 *
 * SUPPORT (important): this is Android-Chromium-over-HTTPS only. iOS (all
 * iPhone/iPad browsers) and most desktop browsers do NOT implement it. Always
 * gate the UI with `isContactPickerSupported()` and hide the entry point when
 * it returns false, so unsupported devices just type the number manually.
 */

// Minimal typings for the (still non-standard) Contact Picker API.
interface ContactInfo {
  name?: string[];
  tel?: string[];
  email?: string[];
}
interface ContactsManagerLike {
  select: (props: string[], opts?: { multiple?: boolean }) => Promise<ContactInfo[]>;
  getProperties?: () => Promise<string[]>;
}

function getContactsManager(): ContactsManagerLike | null {
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as Navigator & { contacts?: ContactsManagerLike };
  const cm = nav.contacts;
  if (cm && typeof cm.select === 'function') return cm;
  return null;
}

/** True when the device/browser can open the native contact picker. */
export function isContactPickerSupported(): boolean {
  const cm = getContactsManager();
  // ContactsManager also lives behind `ContactsManager` in `window`; the
  // presence of navigator.contacts.select is the reliable runtime check.
  return !!cm && typeof window !== 'undefined' && 'ContactsManager' in window;
}

export interface PickedContact {
  name: string | null;
  phone: string | null;
}

/**
 * Opens the native phone contact picker and returns the chosen contact's name
 * + first phone number. Returns null if unsupported or if the user cancels.
 * MUST be called from a user gesture (e.g. a click handler).
 */
export async function pickPhoneFromDevice(): Promise<PickedContact | null> {
  const cm = getContactsManager();
  if (!cm) return null;
  try {
    const results = await cm.select(['name', 'tel'], { multiple: false });
    if (!results || results.length === 0) return null; // user cancelled
    const c = results[0];
    const phone = (c.tel ?? []).map((t) => (t || '').trim()).filter(Boolean)[0] ?? null;
    const name = (c.name ?? []).map((n) => (n || '').trim()).filter(Boolean)[0] ?? null;
    return { name, phone };
  } catch {
    // AbortError (cancel) or NotAllowedError (permission) — treat as no pick.
    return null;
  }
}
