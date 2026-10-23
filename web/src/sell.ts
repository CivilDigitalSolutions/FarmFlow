/*
 * Selling on the web — the same Firestore documents, fields and Storage paths as the Android app,
 * so a listing made here is indistinguishable from one made in the app (and the app can edit it):
 *
 *   becomeSeller        ← AppViewModel.becomeSeller → FirebaseRepository.setSellerCapability
 *                         + upsertSellerProfile
 *   saveContactPhone    ← AppViewModel.updateContactPhone (users/{uid}.contactPhone + the private
 *                         sellers/{uid}/private/contact doc; NEVER the public sellers/{uid}.contactPhone —
 *                         the mirrorSellerContact function copies it there for older app versions)
 *   createListing       ← AppViewModel.createListing → saveListing (Listing.toFirestoreMap + ownerUid),
 *                         then updateListingImages (photos are uploaded after the document exists)
 *   updateListing       ← CreateListingScreen's edit path (updateListing + updateListingImages)
 *   setListingStatus    ← renewListing / markSoldOut → FirebaseRepository.setListingStatus
 *   softDeleteListing   ← FirebaseRepository.softDeleteListing + deleteAllListingImages
 *   photos              ← uploadListingImages / putImage: listing_images/{listingId}/{imageId}.jpg and
 *                         listing_thumbs/{listingId}/{imageId}.jpg, JPEG, 1-year immutable cache
 *
 * firestore.rules and storage.rules are the real boundary (seller capability, ownership, honest
 * status / views / verification, owner-only photo writes); nothing here is trusted by the server.
 *
 * Lazily imported (session.ts sellModule) — only seller pages load Storage.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
} from 'firebase/firestore/lite';
import {
  connectStorageEmulator,
  deleteObject,
  getDownloadURL,
  getStorage,
  ref,
  uploadBytes,
} from 'firebase/storage';
import { MAX_LISTING_IMAGES, LISTING_DAYS, measurementFields, measurementFromStored, type Measurement } from './catalog.ts';
import { db } from './data.ts';
import { USE_EMULATORS, app } from './firebase.ts';
import type { OptimisedImage, OptimisedPair } from './images.ts';
import type { ListingImage, Verification } from './types.ts';

const storage = getStorage(app);
if (USE_EMULATORS) connectStorageEmulator(storage, location.hostname, 9199);

/** The fields of users/{uid} the seller tools need (toUserProfileOrNull). */
export interface SellerProfile {
  displayName: string;
  parish: string;
  island: string;
  townId: string;
  farmDescription: string;
  photoUrl: string | null;
  contactPhone: string;
  verification: Verification;
  isSeller: boolean;
  /** AppViewModel.mySellerId: the profile's sellerId (seeded sellers), else the uid. */
  sellerId: string;
}

export type SellerStatus = 'ACTIVE' | 'UNDER_REVIEW' | 'SUSPENDED' | 'REMOVED';

/** sellers/{uid} moderation state, as Seller.effectiveStatus / canTrade read it. */
export interface SellerStanding {
  status: SellerStatus;
  reason: string | null;
  suspendedUntil: number | null;
  canTrade: boolean;
}

export type ListingStatus = 'ACTIVE' | 'EXPIRED' | 'SOLD_OUT' | 'UNDER_REVIEW' | 'REMOVED' | 'DELETED_BY_SELLER';

export interface MyListing {
  id: string;
  title: string;
  category: string;
  emoji: string;
  price: number;
  currency: string;
  measurement: Measurement;
  quantity: number;
  description: string;
  island: string;
  townId: string;
  status: ListingStatus;
  expiresInDays: number;
  updatedAt: number | null;
  images: ListingImage[];
}

/** What the listing form produces. */
export interface ListingInput {
  title: string;
  category: string;
  emoji: string;
  price: number;
  measurement: Measurement;
  quantity: number;
  description: string;
  island: string;
  townId: string;
}

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const VERIFICATIONS = ['UNVERIFIED', 'VERIFIED', 'COMMERCIAL'];
const STATUSES: ListingStatus[] = ['ACTIVE', 'EXPIRED', 'SOLD_OUT', 'UNDER_REVIEW', 'REMOVED', 'DELETED_BY_SELLER'];

/** users/{uid} plus the seller's private number (falling back to the profile copy). Null: no profile. */
export async function loadSellerProfile(uid: string): Promise<SellerProfile | null> {
  const [snap, contact] = await Promise.all([
    getDoc(doc(db, 'users', uid)),
    getDoc(doc(db, 'sellers', uid, 'private', 'contact')).catch(() => null),
  ]);
  const d = snap.data();
  if (!d || typeof d.displayName !== 'string') return null;
  const privatePhone = contact?.data()?.contactPhone;
  return {
    displayName: d.displayName,
    parish: str(d.parish),
    island: str(d.island),
    townId: str(d.townId),
    farmDescription: str(d.farmDescription),
    photoUrl: typeof d.photoUrl === 'string' && d.photoUrl ? d.photoUrl : null,
    contactPhone: typeof privatePhone === 'string' ? privatePhone : str(d.contactPhone),
    verification: VERIFICATIONS.includes(d.verification) ? d.verification : 'UNVERIFIED',
    isSeller: d.isSeller === true,
    sellerId: typeof d.sellerId === 'string' && d.sellerId ? d.sellerId : uid,
  };
}

/** sellers/{uid} status → Seller.effectiveStatus (a lapsed timed suspension reads ACTIVE). */
export async function loadStanding(uid: string): Promise<SellerStanding> {
  const d = (await getDoc(doc(db, 'sellers', uid))).data() ?? {};
  const raw = ['ACTIVE', 'UNDER_REVIEW', 'SUSPENDED', 'REMOVED'].includes(d.status) ? d.status as SellerStatus : 'ACTIVE';
  const until = typeof d.suspendedUntil === 'number' ? d.suspendedUntil : null;
  const status: SellerStatus = raw === 'SUSPENDED' && until != null && Date.now() >= until ? 'ACTIVE' : raw;
  return {
    status,
    reason: typeof d.moderationReason === 'string' && d.moderationReason ? d.moderationReason : null,
    suspendedUntil: until,
    canTrade: status === 'ACTIVE' || status === 'UNDER_REVIEW',
  };
}

/**
 * FirebaseRepository.upsertSellerProfile: the owner-safe public projection (merge — status,
 * verification and moderation are admin-only and never sent), then the private contact doc.
 */
async function upsertSellerProfile(uid: string, p: SellerProfile, contactPhone: string): Promise<void> {
  await setDoc(doc(db, 'sellers', uid), {
    name: p.displayName,
    parish: p.parish,
    island: p.island,
    townId: p.townId,
    about: p.farmDescription,
    photoUrl: p.photoUrl,
    ownerUid: uid,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  await setDoc(doc(db, 'sellers', uid, 'private', 'contact'), { contactPhone, updatedAt: serverTimestamp() });
}

/**
 * becomeSeller: setSellerCapability(uid, true) — isSeller plus the seller-agreement record, merged so
 * nothing else on the profile changes — then the public projection. The number the seller entered
 * is saved the way updateContactPhone saves it (profile copy + private doc).
 */
export async function becomeSeller(uid: string, p: SellerProfile, contactPhone: string): Promise<void> {
  await setDoc(doc(db, 'users', uid), {
    isSeller: true,
    sellerAgreementAccepted: true,
    sellerAgreementAcceptedAt: serverTimestamp(),
    contactPhone,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  await upsertSellerProfile(uid, { ...p, isSeller: true }, contactPhone);
}

/** updateContactPhone: the profile copy (which the app re-publishes from) and the private doc. */
export async function saveContactPhone(uid: string, p: SellerProfile, contactPhone: string): Promise<void> {
  await setDoc(doc(db, 'users', uid), { contactPhone, updatedAt: serverTimestamp() }, { merge: true });
  await upsertSellerProfile(uid, p, contactPhone);
}

// ---- Profile (the app's Profile screen) ----
// Every write merges: Android's saveProfile replaces the whole users/{uid} doc, which the web must
// not copy — it would wipe fields this page never loads. A seller's public stall follows each change.

/** updateProfileIdentity: display name, island and town (parish is left as it was, as in the app). */
export async function saveIdentity(uid: string, p: SellerProfile): Promise<void> {
  await setDoc(doc(db, 'users', uid), {
    displayName: p.displayName, parish: p.parish, island: p.island, townId: p.townId, updatedAt: serverTimestamp(),
  }, { merge: true });
  if (p.isSeller) await upsertSellerProfile(uid, p, p.contactPhone);
}

/** updateFarmDescription — the stall's "about" text. */
export async function saveFarmDescription(uid: string, p: SellerProfile): Promise<void> {
  await setDoc(doc(db, 'users', uid), { farmDescription: p.farmDescription, updatedAt: serverTimestamp() }, { merge: true });
  if (p.isSeller) await upsertSellerProfile(uid, p, p.contactPhone);
}

/**
 * uploadProfilePhoto: profile_photos/{uid}.jpg (the app's path, so the rules, the orphan sweeper and
 * account deletion all cover it), then photoUrl on the profile and the stall. Resolves to the new p.
 * The path is reused on every change, so unlike listing photos it gets a short cache — an
 * "immutable" year would keep showing the old face.
 */
export async function uploadProfilePhoto(uid: string, p: SellerProfile, image: OptimisedImage): Promise<SellerProfile> {
  const r = ref(storage, `profile_photos/${uid}.jpg`);
  await uploadBytes(r, image.blob, { contentType: 'image/jpeg', cacheControl: 'public, max-age=3600' });
  const photoUrl = await getDownloadURL(r);
  await setDoc(doc(db, 'users', uid), { photoUrl, photoUpdatedAt: Date.now(), updatedAt: serverTimestamp() }, { merge: true });
  const next = { ...p, photoUrl };
  if (p.isSeller) await upsertSellerProfile(uid, next, p.contactPhone);
  return next;
}

export interface EmailPrefs {
  recoveryEmail: string;
  marketingConsent: boolean;
}

export async function loadEmailPrefs(uid: string): Promise<EmailPrefs> {
  const d = (await getDoc(doc(db, 'users', uid))).data() ?? {};
  return { recoveryEmail: str(d.recoveryEmail), marketingConsent: d.marketingConsent === true };
}

/** setMarketingConsent — the consent record (time and address) the owner's mailing list reads. */
export async function setMarketingConsent(uid: string, on: boolean, email: string): Promise<void> {
  await setDoc(doc(db, 'users', uid), {
    marketingConsent: on, marketingConsentAt: serverTimestamp(), marketingEmail: on ? email : '', updatedAt: serverTimestamp(),
  }, { merge: true });
}

/** SellerProfile.canUploadPhoto: profile photos are for verified sellers, as in the app. */
export const canUploadPhoto = (p: SellerProfile) => p.verification === 'VERIFIED' || p.verification === 'COMMERCIAL';

function toMyListing(id: string, d: DocumentData): MyListing {
  const images: ListingImage[] = Array.isArray(d.images)
    ? d.images.filter((i: unknown) => typeof (i as ListingImage)?.imageUrl === 'string' && (i as ListingImage).imageUrl)
      .map((i: ListingImage) => ({ imageUrl: i.imageUrl, thumbnailUrl: typeof i.thumbnailUrl === 'string' && i.thumbnailUrl ? i.thumbnailUrl : null }))
      .slice(0, MAX_LISTING_IMAGES)
    : typeof d.imageUrl === 'string' && d.imageUrl
      ? [{ imageUrl: d.imageUrl, thumbnailUrl: typeof d.thumbnailUrl === 'string' && d.thumbnailUrl ? d.thumbnailUrl : null }]
      : [];
  return {
    id,
    title: str(d.title),
    category: str(d.category),
    emoji: str(d.emoji, '🌱'),
    price: Number(d.price) || 0,
    currency: str(d.currency, 'USD'),
    measurement: measurementFromStored(d.measurementType, d.unit, d.customUnit),
    quantity: Number(d.quantity) || 0,
    description: str(d.description),
    island: str(d.island),
    townId: str(d.townId),
    status: STATUSES.includes(d.status) ? d.status : 'ACTIVE',
    expiresInDays: typeof d.expiresInDays === 'number' ? d.expiresInDays : LISTING_DAYS,
    updatedAt: typeof d.updatedAt?.toMillis === 'function' ? d.updatedAt.toMillis() : null,
    images,
  };
}

/** fetchListingsBySeller — every status (the public API only ever returns ACTIVE ones). */
export async function myListings(sellerId: string): Promise<MyListing[]> {
  const snap = await getDocs(query(collection(db, 'listings'), where('sellerId', '==', sellerId)));
  return snap.docs.map((s) => toMyListing(s.id, s.data()))
    .sort((a, b) => (b.updatedAt ?? Number.MAX_SAFE_INTEGER) - (a.updatedAt ?? Number.MAX_SAFE_INTEGER));
}

/** One of the seller's own listings, for the edit form. Null when it isn't theirs (or is gone). */
export async function loadMyListing(id: string, uid: string): Promise<MyListing | null> {
  const snap = await getDoc(doc(db, 'listings', id));
  const d = snap.data();
  if (!d || d.ownerUid !== uid) return null;
  return toMyListing(snap.id, d);
}

// ---- Photos ----

/** putImage: optimised bytes only (never the picked file), long immutable cache like the app. */
async function putImage(path: string, image: OptimisedImage): Promise<string> {
  const r = ref(storage, path);
  await uploadBytes(r, image.blob, { contentType: 'image/jpeg', cacheControl: 'public, max-age=31536000, immutable' });
  return getDownloadURL(r);
}

/**
 * uploadListingImages: a fresh random id per photo, the full image and its thumbnail both uploaded
 * before either is kept. Stops at the first failure and returns what made it (never a half pair).
 */
async function uploadListingImages(listingId: string, photos: OptimisedPair[]): Promise<ListingImage[]> {
  const uploaded: ListingImage[] = [];
  for (const p of photos) {
    const imageId = crypto.randomUUID();
    try {
      const imageUrl = await putImage(`listing_images/${listingId}/${imageId}.jpg`, p.image);
      const thumbnailUrl = await putImage(`listing_thumbs/${listingId}/${imageId}.jpg`, p.thumbnail);
      uploaded.push({ imageUrl, thumbnailUrl });
    } catch {
      break;
    }
  }
  return uploaded;
}

/** deleteListingImages — best effort; purgeImagesOnListingDelete / sweepOrphanedImages back it up. */
async function deleteListingImages(images: ListingImage[]): Promise<void> {
  await Promise.all(images.flatMap((i) => [i.imageUrl, i.thumbnailUrl])
    .filter((u): u is string => !!u)
    .map((u) => deleteObject(ref(storage, u)).catch(() => undefined)));
}

/** The gallery fields: the `images` array plus the denormalised cover (always images[0]). */
function galleryFields(images: ListingImage[]) {
  const list = images.slice(0, MAX_LISTING_IMAGES);
  return {
    images: list.map((i) => ({ imageUrl: i.imageUrl, thumbnailUrl: i.thumbnailUrl })),
    imageUrl: list[0]?.imageUrl ?? null,
    thumbnailUrl: list[0]?.thumbnailUrl ?? null,
  };
}

function editableFields(input: ListingInput) {
  return {
    title: input.title,
    category: input.category,
    price: input.price,
    ...measurementFields(input.measurement),
    quantity: input.quantity,
    description: input.description,
    emoji: input.emoji,
    townId: input.townId,
    island: input.island,
  };
}

export interface SaveResult {
  id: string;
  /** False when some new photos couldn't be uploaded (the listing itself was saved). */
  allPhotosUploaded: boolean;
}

/**
 * createListing: Listing.toFirestoreMap() field for field, plus ownerUid. Status ACTIVE for 30 days,
 * views 0, the seller's own verification, currency from the seller's island (passed in), no precise
 * location (the web never collects one). Then the photos, then the gallery written onto the doc.
 */
export async function createListing(
  uid: string, p: SellerProfile, currency: string, input: ListingInput, photos: OptimisedPair[],
): Promise<SaveResult> {
  const id = `l_${crypto.randomUUID()}`;
  const listingRef = doc(db, 'listings', id);
  await setDoc(listingRef, {
    ...editableFields(input),
    parish: '',
    location: null,
    sellerId: p.sellerId,
    verification: p.verification,
    status: 'ACTIVE',
    expiresInDays: LISTING_DAYS,
    views: 0,
    ...galleryFields([]),
    currency,
    updatedAt: serverTimestamp(),
    ownerUid: uid,
  });
  if (!photos.length) return { id, allPhotosUploaded: true };
  const uploaded = await uploadListingImages(id, photos);
  if (uploaded.length) await updateDoc(listingRef, { ...galleryFields(uploaded), updatedAt: serverTimestamp() });
  return { id, allPhotosUploaded: uploaded.length === photos.length };
}

/**
 * The edit path: the form's fields (a moved listing drops any precise point it had, as the app's
 * location picker does), then the gallery — kept photos untouched, new ones uploaded — and only
 * after the document stops referencing them, the removed photos are deleted.
 */
export async function updateListing(
  id: string, before: MyListing, input: ListingInput, kept: ListingImage[], photos: OptimisedPair[],
): Promise<SaveResult> {
  const listingRef = doc(db, 'listings', id);
  const moved = before.townId !== input.townId || before.island !== input.island;
  await updateDoc(listingRef, { ...editableFields(input), ...(moved ? { location: null } : {}), updatedAt: serverTimestamp() });
  const removed = before.images.filter((b) => !kept.some((k) => k.imageUrl === b.imageUrl));
  if (!photos.length && !removed.length) return { id, allPhotosUploaded: true };
  const uploaded = photos.length ? await uploadListingImages(id, photos) : [];
  await updateDoc(listingRef, { ...galleryFields([...kept, ...uploaded]), updatedAt: serverTimestamp() });
  await deleteListingImages(removed);
  return { id, allPhotosUploaded: uploaded.length === photos.length };
}

/** setListingStatus: renew (ACTIVE, 30) or mark sold (SOLD_OUT, 0); restarts the expiry clock. */
export async function setListingStatus(id: string, status: 'ACTIVE' | 'SOLD_OUT'): Promise<void> {
  await updateDoc(doc(db, 'listings', id), {
    status,
    expiresInDays: status === 'ACTIVE' ? LISTING_DAYS : 0,
    updatedAt: serverTimestamp(),
  });
}

/** softDeleteListing + deleteAllListingImages: the document stays (DELETED_BY_SELLER), photos go. */
export async function softDeleteListing(id: string, uid: string, images: ListingImage[]): Promise<void> {
  await updateDoc(doc(db, 'listings', id), {
    status: 'DELETED_BY_SELLER',
    expiresInDays: 0,
    images: [],
    imageUrl: null,
    thumbnailUrl: null,
    updatedAt: serverTimestamp(),
    deletedAt: serverTimestamp(),
    deletedBy: uid,
  });
  await deleteListingImages(images);
  // Pre-multi-image layout — a harmless 404 for every listing made since.
  await Promise.all([`listing_images/${id}.jpg`, `listing_thumbs/${id}.jpg`]
    .map((path) => deleteObject(ref(storage, path)).catch(() => undefined)));
}
