/**
 * Normalize phone number for WhatsApp URL.
 * Removes spaces, dashes, parentheses; ensures international format.
 * Israeli numbers starting with 0 become 972...
 */
export function toWhatsAppUrl(phone: string | null | undefined): string | null {
  if (!phone || typeof phone !== 'string') return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 9) return null;
  let normalized = digits;
  if (digits.startsWith('0') && digits.length >= 9) {
    normalized = '972' + digits.slice(1);
  }
  return `https://wa.me/${normalized}`;
}

/**
 * Open a WhatsApp share with pre-filled text.
 * Uses api.whatsapp.com/send (more reliable than wa.me/?text= which strips
 * the text param through redirect chains on many devices).
 *
 * On mobile: tries native Web Share API first, then navigates via
 * window.location.href to avoid popup-blocker issues (the window.open call
 * happens after async work, outside the original click context).
 *
 * On desktop: opens a new tab to WhatsApp Web.
 */
export function openWhatsAppShare(text: string): void {
  if (typeof window === 'undefined') return;

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;

  if (isMobile) {
    // On mobile, navigate the current tab — avoids popup-blocker issues
    window.location.href = waUrl;
  } else {
    // On desktop, open WhatsApp Web in a new tab (no noopener/noreferrer
    // which can strip URL params through the redirect chain)
    window.open(waUrl, '_blank');
  }
}

/**
 * Open WhatsApp conversation with a specific phone number and pre-filled message.
 * Combines toWhatsAppUrl() normalisation with a text param.
 */
export function openWhatsAppWithMessage(phone: string, message: string): void {
  if (typeof window === 'undefined') return;
  const base = toWhatsAppUrl(phone);
  if (!base) return;
  const url = `${base}?text=${encodeURIComponent(message)}`;
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  if (isMobile) {
    window.location.href = url;
  } else {
    window.open(url, '_blank');
  }
}
