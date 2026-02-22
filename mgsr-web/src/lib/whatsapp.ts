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
