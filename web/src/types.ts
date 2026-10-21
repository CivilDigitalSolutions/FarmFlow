// Shapes returned by the public web API (FarmFlow-App: functions/web/projection.js). A public listing
// deliberately carries no seller id — see that file.

export type Verification = 'UNVERIFIED' | 'VERIFIED' | 'COMMERCIAL';

export interface ListingImage {
  imageUrl: string;
  thumbnailUrl: string | null;
}

export interface PublicListing {
  id: string;
  title: string;
  category: string;
  description: string;
  emoji: string;
  price: number;
  currency: string;
  priceLabel: string;
  quantity: number;
  quantityLabel: string;
  images: ListingImage[];
  verification: Verification;
  island: string;
  townName: string;
  townLat: number | null;
  townLng: number | null;
  updatedAt: number | null;
  path: string;
}

export interface PublicSeller {
  id: string;
  name: string;
  island: string;
  townName: string;
  verification: Verification;
  about: string;
  followers: number;
  yearsOnPlatform: number;
  photoUrl: string | null;
  path: string;
}

export interface Town {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface Island {
  name: string;
  currency: string;
  towns: Town[];
}

export interface Meta {
  islands: Island[];
  categories: { name: string; emoji: string }[];
}

export interface Market {
  listings: PublicListing[];
  generatedAt: number;
}

export interface ListingData {
  listing: PublicListing;
}

export interface SellerData {
  seller: PublicSeller;
  listings: PublicListing[];
}

/** What the server embedded in #ff-initial for a server-rendered page. */
export type Initial =
  | { route: 'listing'; id: string; data: ListingData }
  | { route: 'seller'; id: string; data: SellerData }
  | { route: 'gone'; kind: 'listing' | 'seller' };
