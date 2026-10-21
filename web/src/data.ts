/*
 * Firestore access for SIGNED-IN web users — the same documents, fields and security rules as the
 * Android app (FirebaseRepository / FirestoreMappers). Anything a visitor can see without signing in
 * comes from the public /api/* instead; this module only covers what Android also gates behind
 * sign-in: who the seller is and how to contact them, favourites, the user's own profile, and the
 * engagement events that feed seller analytics.
 *
 * Lazily imported, like auth.ts. Firestore Lite (no live listeners) — a quarter of the full SDK.
 */
import {
  addDoc,
  connectFirestoreEmulator,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  runTransaction,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore/lite';
import { USE_EMULATORS, app } from './firebase.ts';
import { slugify } from './format.ts';
import type { Verification } from './types.ts';

const db = getFirestore(app);
if (USE_EMULATORS) connectFirestoreEmulator(db, location.hostname, 8080);

export interface UserProfile {
  displayName: string;
  island: string;
  townId: string;
  isSeller: boolean;
}

export interface ListingSeller {
  id: string;
  name: string;
  contactPhone: string;
  verification: Verification;
  photoUrl: string | null;
  yearsOnPlatform: number;
  path: string;
}

/**
 * users/{uid}, or null when this account has never set up a profile (on any platform). A failed read
 * THROWS — callers must never mistake "couldn't load" for "has no profile" (see createProfile).
 */
export async function loadProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  const d = snap.data();
  if (!snap.exists() || !d || typeof d.displayName !== 'string') return null; // toUserProfileOrNull
  return {
    displayName: d.displayName,
    island: d.island ?? '',
    townId: d.townId ?? '',
    isSeller: d.isSeller === true,
  };
}

/**
 * First-time profile — the same full document Android's ProfileSetupScreen writes
 * (UserProfile(...).toFirestoreMap() with every other field at its default), so the account opens
 * normally in the app afterwards. Rules: owner-only create, isAdmin false, verification UNVERIFIED.
 *
 * Transactional, and it never overwrites: if a profile already exists (set up on another device, or
 * a read failed and sent the user here by mistake) it resolves 'exists' and writes nothing — a
 * blind set() would wipe isSeller, consent records and the rest of a real profile. A doc that exists
 * without a displayName (which Android also treats as "no profile") only gets the identity fields
 * merged in, keeping everything else.
 */
export async function createProfile(
  uid: string,
  p: { displayName: string; island: string; townId: string; recoveryEmail: string },
): Promise<'created' | 'exists'> {
  const ref = doc(db, 'users', uid);
  const identity = {
    displayName: p.displayName.trim() || 'FarmFlow User',
    parish: '',
    island: p.island,
    townId: p.townId,
    recoveryEmail: p.recoveryEmail.trim(),
    updatedAt: serverTimestamp(),
  };
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists() && typeof snap.data()?.displayName === 'string') return 'exists';
    if (snap.exists()) {
      tx.set(ref, identity, { merge: true });
      return 'created';
    }
    tx.set(ref, {
      ...identity,
      farmDescription: '',
      contactPhone: '',
      verification: 'UNVERIFIED',
      sellerId: null,
      photoUrl: null,
      photoUpdatedAt: null,
      isAdmin: false,
      isSeller: false,
      preferredCurrency: null,
      showPriceEstimates: true,
      notifyFavourites: true,
      notifyExpiry: true,
      notifyAnnouncements: true,
      marketingConsent: false,
      marketingConsentAt: null,
      marketingEmail: '',
      sellerAgreementAccepted: false,
      sellerAgreementAcceptedAt: null,
    });
    return 'created';
  });
}

/** The seller behind a listing — listings/{id}.sellerId → sellers/{sellerId}. Null if unresolvable. */
export async function loadListingSeller(listingId: string): Promise<ListingSeller | null> {
  const listing = await getDoc(doc(db, 'listings', listingId));
  const sellerId = listing.data()?.sellerId;
  if (typeof sellerId !== 'string' || !sellerId) return null;
  const snap = await getDoc(doc(db, 'sellers', sellerId));
  const s = snap.data();
  if (!s) return null;
  const name = typeof s.name === 'string' ? s.name : '';
  const verification = ['VERIFIED', 'COMMERCIAL'].includes(s.verification) ? s.verification : 'UNVERIFIED';
  return {
    id: sellerId,
    name,
    contactPhone: typeof s.contactPhone === 'string' ? s.contactPhone : '',
    verification,
    photoUrl: typeof s.photoUrl === 'string' && s.photoUrl ? s.photoUrl : null,
    yearsOnPlatform: Number(s.yearsOnPlatform) || 0,
    path: `/seller/${slugify(name, 'stall')}?id=${encodeURIComponent(sellerId)}`,
  };
}

export type AnalyticsEventType = 'LISTING_VIEW' | 'PROFILE_VIEW' | 'CONTACT_WHATSAPP' | 'CONTACT_SMS';

/** FirebaseRepository.logAnalyticsEvent — append-only; aggregateAnalyticsEvent does the counting. */
export async function logEvent(type: AnalyticsEventType, sellerId: string, listingId: string | null, uid: string): Promise<void> {
  await addDoc(collection(db, 'analytics_events'), {
    type, sellerId, listingId, uid, createdAt: serverTimestamp(),
  });
}

export async function favouriteListingIds(uid: string): Promise<string[]> {
  const snap = await getDocs(collection(db, 'users', uid, 'favouriteListings'));
  return snap.docs.map((d) => d.id);
}

export async function setFavouriteListing(uid: string, listingId: string, on: boolean): Promise<void> {
  const ref = doc(db, 'users', uid, 'favouriteListings', listingId);
  if (on) await setDoc(ref, { listingId });
  else await deleteDoc(ref);
}

/** The two shared ad switches in config/ads — the same fields the app's AdsConfig reads. */
export type AdSwitch = 'searchNativeEnabled' | 'detailGridEnabled';

/** Live values of the shared ad switches (admins; any signed-in user may read config/ads). */
export async function loadAdSwitches(): Promise<Record<AdSwitch, boolean>> {
  const d = (await getDoc(doc(db, 'config', 'ads'))).data() ?? {};
  return { searchNativeEnabled: d.searchNativeEnabled === true, detailGridEnabled: d.detailGridEnabled === true };
}

/** FirebaseRepository.setAdEnabled, field for field: admin-only by firestore.rules. */
export async function setAdSwitch(field: AdSwitch, enabled: boolean, adminUid: string): Promise<void> {
  await setDoc(doc(db, 'config', 'ads'), { [field]: enabled, updatedAt: serverTimestamp(), updatedBy: adminUid }, { merge: true });
}
