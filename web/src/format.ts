/** listingSlug / stockSheetSlug (Android) — accents stripped, non-alphanumerics → '-', max 60. */
export function slugify(text: string, fallback: string): string {
  const slug = text
    .normalize('NFD')
    .replace(/\p{Mn}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

/** BuyerScreens.contactDigits. */
export function contactDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}

/** openWhatsApp — same pre-filled message as the app. */
export function whatsAppUrl(phone: string, title: string, priceLabel: string): string {
  const msg = `Hi! I'm interested in your FarmFlow listing: ${title} (${priceLabel}).`;
  return `https://wa.me/${contactDigits(phone)}?text=${encodeURIComponent(msg)}`;
}

/** openSms — `sms:+N?&body=` is the form both iOS and Android Messages accept. */
export function smsUrl(phone: string, title: string): string {
  const msg = `Hi! I'm interested in your FarmFlow listing: ${title}.`;
  return `sms:+${contactDigits(phone)}?&body=${encodeURIComponent(msg)}`;
}

export const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.civildigital.farmflow';

export function isIos(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isAndroid(): boolean {
  return /Android/i.test(navigator.userAgent);
}

export function isStandalone(): boolean {
  return matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** localStorage that never throws (private mode, blocked storage). */
export const store = {
  get(key: string): string | null {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key: string, value: string | null): void {
    try {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch { /* ignore */ }
  },
};
