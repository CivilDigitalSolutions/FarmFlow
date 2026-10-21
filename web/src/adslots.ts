/*
 * Where search-result ads go — a port of the app's NativeAds.kt so both platforms place them alike:
 * after the first 4 listings, then every 8 (display positions 5, 13, 21, … 1-based), at most
 * SEARCH_AD_COUNT of them (the app's batch size), and only where a real listing still follows (never
 * trailing, none in a short list). Ads never change which listings appear or their order.
 * Dependency-free: web/test/adslots.test.mjs runs it directly under Node.
 */
export const SEARCH_AD_FIRST_POSITION = 4;
export const SEARCH_AD_INTERVAL = 8;
export const SEARCH_AD_COUNT = 5;

/** adSlotPositions (NativeAds.kt): 0-based display positions over the combined list. */
export function adSlotPositions(itemCount: number, adCount: number): number[] {
  if (adCount <= 0 || itemCount === 0) return [];
  const positions: number[] = [];
  const total = itemCount + adCount;
  let placed = 0;
  let itemsBefore = 0;
  for (let pos = 0; placed < adCount && itemsBefore < itemCount && pos < total; pos++) {
    const isSlot = pos >= SEARCH_AD_FIRST_POSITION && (pos - SEARCH_AD_FIRST_POSITION) % SEARCH_AD_INTERVAL === 0;
    if (isSlot) {
      positions.push(pos);
      placed++;
    } else {
      itemsBefore++;
    }
  }
  return positions;
}

export type WithAds<T> = { kind: 'item'; value: T } | { kind: 'ad'; slot: number };

/** interleaveAds: [items] in order, with ad markers at the slot positions (none when adCount is 0). */
export function interleaveAds<T>(items: T[], adCount: number): WithAds<T>[] {
  const slots = new Set(adSlotPositions(items.length, adCount));
  const out: WithAds<T>[] = [];
  let next = 0;
  let slot = 0;
  for (let pos = 0; next < items.length; pos++) {
    if (slots.has(pos)) out.push({ kind: 'ad', slot: slot++ });
    else out.push({ kind: 'item', value: items[next++] });
  }
  return out;
}
