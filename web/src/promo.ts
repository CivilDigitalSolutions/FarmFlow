/** Helpers for the "Get the FarmFlow app" card (components.tsx AppPromo). */

const OPENED_FROM_APP = 'ff-opened-from-app'; // same key as assets/app-promo.js

/**
 * True when this tab was opened from the FarmFlow Android app (a Chrome Custom Tab reports the app as
 * `android-app://com.civildigital.farmflow`): don't offer the app to someone already using it.
 * Remembered for the tab, since the referrer is gone after the first in-site navigation.
 */
export function openedFromApp(referrer: string = document.referrer): boolean {
  const fromApp = /^android-app:\/\/com\.civildigital\.farmflow/.test(referrer);
  try {
    if (fromApp) sessionStorage.setItem(OPENED_FROM_APP, '1');
    return fromApp || sessionStorage.getItem(OPENED_FROM_APP) === '1';
  } catch {
    return fromApp;
  }
}
