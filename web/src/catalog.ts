/*
 * What a seller picks from when listing produce — a port of the Android app's own catalogues, so a
 * listing written on the web is field-for-field what the app writes and reads back identically:
 *   MEASUREMENT_TYPES / UNITS / Measurement keys  ← data/Measurement.kt
 *   measurementLabel / pluralizeUnit             ← Measurement.label (+ pluralizeUnit, Models.kt)
 *   MAX_LISTING_IMAGES, LISTING_DAYS             ← Models.kt / AppViewModel.createListing
 *   expiresLabel                                 ← Listing.remainingDays / expiresLabel (Models.kt)
 * Categories, islands and their currencies come from /api/meta (functions/web/catalog.js), which is
 * the server's port of the same Kotlin files.
 *
 * Dependency-free on purpose: web/test/catalog.test.mjs runs it directly under Node.
 */

export type MeasurementType = 'WEIGHT' | 'VOLUME' | 'LENGTH' | 'AREA' | 'COUNT' | 'BUNDLE' | 'CONTAINER';

export const MEASUREMENT_TYPES: { key: MeasurementType; label: string }[] = [
  { key: 'WEIGHT', label: 'Weight' },
  { key: 'VOLUME', label: 'Volume' },
  { key: 'LENGTH', label: 'Length' },
  { key: 'AREA', label: 'Area' },
  { key: 'COUNT', label: 'Count' },
  { key: 'BUNDLE', label: 'Bundle' },
  { key: 'CONTAINER', label: 'Container' },
];

export interface Unit {
  key: string;
  type: MeasurementType;
  /** Full name in the unit dropdown ("Kilogram (kg)"). */
  label: string;
  /** Compact label beside a price / quantity ("kg", "Crate"). */
  short: string;
  pluralizes: boolean;
}

const u = (key: string, type: MeasurementType, label: string, short: string, pluralizes: boolean): Unit =>
  ({ key, type, label, short, pluralizes });

/** MeasurementUnit, in the app's display order. */
export const UNITS: Unit[] = [
  u('KILOGRAM', 'WEIGHT', 'Kilogram (kg)', 'kg', false),
  u('GRAM', 'WEIGHT', 'Gram (g)', 'g', false),
  u('POUND', 'WEIGHT', 'Pound (lb)', 'lb', false),
  u('OUNCE', 'WEIGHT', 'Ounce (oz)', 'oz', false),
  u('TONNE', 'WEIGHT', 'Tonne', 'Tonne', true),
  u('LITRE', 'VOLUME', 'Litre (L)', 'L', false),
  u('MILLILITRE', 'VOLUME', 'Millilitre (mL)', 'mL', false),
  u('GALLON', 'VOLUME', 'Gallon', 'Gallon', true),
  u('METRE', 'LENGTH', 'Metre (m)', 'm', false),
  u('CENTIMETRE', 'LENGTH', 'Centimetre (cm)', 'cm', false),
  u('FOOT', 'LENGTH', 'Foot (ft)', 'ft', false),
  u('ACRE', 'AREA', 'Acre', 'Acre', true),
  u('HECTARE', 'AREA', 'Hectare', 'Hectare', true),
  u('SQUARE_FOOT', 'AREA', 'Square Foot', 'Square Foot', true),
  u('SQUARE_METRE', 'AREA', 'Square Metre', 'Square Metre', true),
  u('EACH', 'COUNT', 'Each', 'Each', false),
  u('PAIR', 'COUNT', 'Pair', 'Pair', true),
  u('HALF_DOZEN', 'COUNT', 'Half Dozen', 'Half Dozen', false),
  u('DOZEN', 'COUNT', 'Dozen', 'Dozen', false),
  u('TRAY', 'COUNT', 'Tray', 'Tray', true),
  u('BUNCH', 'BUNDLE', 'Bunch', 'Bunch', true),
  u('BALE', 'BUNDLE', 'Bale', 'Bale', true),
  u('BUNDLE', 'BUNDLE', 'Bundle', 'Bundle', true),
  u('BAG', 'CONTAINER', 'Bag', 'Bag', true),
  u('SACK', 'CONTAINER', 'Sack', 'Sack', true),
  u('BUCKET', 'CONTAINER', 'Bucket', 'Bucket', true),
  u('CRATE', 'CONTAINER', 'Crate', 'Crate', true),
  u('BOX', 'CONTAINER', 'Box', 'Box', true),
  u('CARTON', 'CONTAINER', 'Carton', 'Carton', true),
  u('DRUM', 'CONTAINER', 'Drum', 'Drum', true),
  u('PALLET', 'CONTAINER', 'Pallet', 'Pallet', true),
];

/** Reserved `unit` value meaning "the seller typed their own unit" (CUSTOM_UNIT_KEY). */
export const CUSTOM_UNIT_KEY = 'Custom';
export const CUSTOM_UNIT_MENU_LABEL = 'Custom Unit';

export const MAX_LISTING_IMAGES = 3;
/** createListing / renewListing: every listing runs for 30 days from its last write. */
export const LISTING_DAYS = 30;
const DAY_MS = 86_400_000;

export function unitsFor(type: MeasurementType): Unit[] {
  return UNITS.filter((x) => x.type === type);
}

export function unitByKey(key: string | null | undefined): Unit | null {
  return UNITS.find((x) => x.key === key) ?? null;
}

/** A resolved measurement: a built-in unit, or (unit null) the seller's own wording. */
export interface Measurement {
  type: MeasurementType;
  unit: string | null;
  custom: string | null;
}

export const DEFAULT_MEASUREMENT: Measurement = { type: 'WEIGHT', unit: 'KILOGRAM', custom: null };

/**
 * Measurement.fromStored for documents the seller edits. Web-written and current-app listings always
 * carry a measurementType; anything else (a pre-measurement listing) opens as the default and is
 * saved in the structured form, exactly as the app's editor would.
 */
export function measurementFromStored(type: unknown, unit: unknown, custom: unknown): Measurement {
  const t = MEASUREMENT_TYPES.find((m) => m.key === type)?.key;
  if (!t) return DEFAULT_MEASUREMENT;
  const customText = typeof custom === 'string' && custom.trim() ? custom.trim() : null;
  if (unit === CUSTOM_UNIT_KEY || typeof unit !== 'string' || !unit.trim()) return { type: t, unit: null, custom: customText };
  const known = unitByKey(unit);
  if (known && known.type === t) return { type: t, unit: known.key, custom: null };
  return { type: t, unit: null, custom: customText ?? unit.trim() };
}

/** The three stored fields (Measurement.typeKey / unitKey / storedCustom). */
export function measurementFields(m: Measurement): { measurementType: MeasurementType; unit: string; customUnit: string | null } {
  return {
    measurementType: m.type,
    unit: m.unit ?? CUSTOM_UNIT_KEY,
    customUnit: m.unit ? null : (m.custom?.trim() || null),
  };
}

/** pluralizeUnit (Models.kt). */
export function pluralizeUnit(unit: string, count: number): string {
  if (count === 1) return unit;
  const s = unit.toLowerCase();
  if (s === 'lb') return 'lbs';
  if (s === 'each') return 'each';
  if (/(ch|sh|s|x|z)$/.test(s)) return unit + 'es';
  if (s.length > 1 && s.endsWith('y') && !'aeiou'.includes(s[s.length - 2])) return unit.slice(0, -1) + 'ies';
  return unit + 's';
}

/** Measurement.label(count): "kg", "Crates", "Dozen", or the custom wording (never pluralized). */
export function measurementLabel(m: Measurement, count = 1): string {
  const known = unitByKey(m.unit);
  if (!known) return m.custom?.trim() ?? '';
  return known.pluralizes ? pluralizeUnit(known.short, count) : known.short;
}

/**
 * Listing.expiresLabel — the "Expires in …" line on a My Listings card. updatedAt is the last write
 * (ms); the server's sendExpiryReminders uses the same formula.
 */
export function expiresLabel(updatedAt: number | null, expiresInDays: number, now = Date.now()): string {
  if (updatedAt == null) return `Expires in ${expiresInDays}d`;
  const days = Math.ceil((updatedAt + expiresInDays * DAY_MS - now) / DAY_MS);
  if (days <= -1) return 'Expired';
  if (days === 0) return 'Expires today';
  if (days === 1) return 'Expires tomorrow';
  return `Expires in ${days} days`;
}

// ---- Form limits ----
// The app sets no length limits of its own; the web caps what a seller can type so one listing can't
// fill a buyer's screen (or a Firestore document). Generous enough for any real listing.
export const LIMITS = { title: 80, description: 1000, customUnit: 30, phone: 32, maxPrice: 1_000_000, maxQuantity: 1_000_000 };

/** A price as typed ("15", "8.50") → a number with at most 2 decimals, or null when it isn't one. */
export function parsePrice(raw: string): number | null {
  const s = raw.trim().replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return n > 0 && n <= LIMITS.maxPrice ? n : null;
}

/** A whole-number quantity, 1 or more. */
export function parseQuantity(raw: string): number | null {
  const s = raw.trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 && n <= LIMITS.maxQuantity ? n : null;
}

/**
 * The seller's WhatsApp / SMS number as stored (sellers/{uid}/private/contact). Empty clears it.
 * Returns null when it can't be a phone number: only digits, spaces, + - ( ) . allowed, 7–15 digits
 * (E.164's maximum), and at most 32 characters (the rules' cap).
 */
export function normalisePhone(raw: string): string | null {
  const s = raw.trim().replace(/\s+/g, ' ');
  if (!s) return '';
  if (s.length > LIMITS.phone || !/^\+?[\d ()\-.]+$/.test(s)) return null;
  const digits = s.replace(/\D/g, '').length;
  return digits >= 7 && digits <= 15 ? s : null;
}
