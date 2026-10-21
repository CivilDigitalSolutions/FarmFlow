# FarmFlow — www.farmflowcaribbean.com

The FarmFlow website: the **web marketplace** (browse, sign in, contact sellers, donate — usable on
iPhone, iPad, desktop and any browser, installable as a PWA) plus the static marketing / support
pages. Served by **Firebase Hosting** (project `farmflow-51796`, the same Firebase project as the
Android app — one account, one set of security rules).

| Path | What serves it |
|---|---|
| `/` | Web marketplace home (`web/`, built by Vite) |
| `/listing/{slug}?id=`, `/seller/{slug}?id=`, `/api/*`, `/sitemap-marketplace.xml` | `web` Cloud Function (FarmFlow-App repo, `functions/web/`) — server-rendered, search-indexable |
| `/api/donate`, `/api/stripe/webhook` | `donations` Cloud Function (Stripe Checkout) |
| `/signin`, `/account`, `/account/setup`, `/donate`, `/donate/thanks` | Web marketplace (client routes) |
| `/about/` | The former home page (marketing) |
| everything else (`/jamaica/`, `/produce/…`, `/help/`, `/privacy/`, `/auth/action/`, `/.well-known/…`) | Static files from the repo root, unchanged |

### Build & deploy

```bash
npm ci
npm test                 # search / ranking parity tests (Node ≥ 22.18)
npm run build            # typecheck → vite build → scripts/assemble.mjs → dist/
npx firebase-tools deploy --only hosting       # deploys dist/ (see firebase.json)
```

Deploy the Cloud Functions from the FarmFlow-App repo **first** (`firebase deploy --only
functions:web,functions:donations,firestore:rules`); the rewrites in `firebase.json` point at them.
`npm run dev` serves the app locally against the deployed API.

### Cut-over from GitHub Pages

The repo root is still a complete static site, so GitHub Pages keeps working until DNS moves:
1. Deploy functions + hosting, then test on `https://farmflow-51796.web.app`.
2. Firebase console → Hosting → **Add custom domain** `www.farmflowcaribbean.com`; set the DNS records
   it shows at the registrar (replacing the GitHub Pages CNAME). Wait for the certificate.
3. Then GitHub → Settings → Pages → remove the custom domain / disable Pages. `CNAME` and `.nojekyll`
   become unused (they are excluded from `dist/`).

The web app: `web/src/` — `main.tsx` (routes), `pages/`, `search.ts` (port of Android's search),
`auth.ts` (sign-in, same rules as the app), `data.ts` (signed-in Firestore reads/writes),
`session.ts`. Browsing never loads the Firebase SDK; it runs on the public `/api/*`.

### Ads (Google AdSense — ships dark)

The website shows Google AdSense ads in the same two places the app shows AdMob ads: in the results
grid (after 4 listings, then every 8) and one "Sponsored" unit on each listing page. Same Google
account and publisher ID (`pub-5319059698255764`) as the app. Code: `web/src/ads.tsx`,
`web/src/adslots.ts`.

A placement shows only when **both** are true:
1. its switch is on in Firestore `config/ads` — `searchNativeEnabled` / `detailGridEnabled`, the
   **same switches the app uses**, so one flip changes the app and the website together. Flip them
   from the app (Profile → Ad controls) or the website (Account page → Ad controls, admins only).
2. its ad unit ID is filled in `AD_UNITS` in `web/src/ads.tsx` (then rebuild + deploy).

While off, the AdSense script is never loaded. When on, each ad loads only as it comes within ~300px of
the screen (`AD_LOAD_MARGIN`), so ads further down a list the visitor never reaches cost no mobile data. Consent (UK / EEA) is Google's own message from
AdSense → Privacy & messaging; the footer's "Privacy & cookie settings" link reopens it. Off the real domain (e.g. `farmflow-51796.web.app`)
ads run in AdSense test mode. `ads.txt` (and `app-ads.txt` for AdMob) are at the site root.

---

The rest of this README describes the static marketing pages.

## Structure.

```
/
├── index.html                  # Marketplace-intent home page (categories, how it works, islands)
├── jamaica/, trinidad-and-tobago/, barbados/, guyana/
│   └── index.html              # Island landing pages (local produce + "sell online in X" intent)
├── produce/
│   ├── index.html              # Produce hub
│   └── ground-provisions/, yam/, cassava/, scotch-bonnet/, callaloo/, plantain/
│       └── index.html          # Produce-category pages
├── guides/
│   ├── index.html              # Guides hub
│   └── what-are-ground-provisions/, how-to-sell-yam-online-in-jamaica/
│       └── index.html          # Local-intent guide articles
├── help.html / help/index.html                 # Help & Support hub
├── faqs.html / faqs/index.html                 # FAQs (accordion via <details>, FAQPage schema)
├── contact.html / contact/index.html           # Contact support
├── privacy.html / privacy/index.html           # Privacy Policy (Play Console URL)
├── terms.html / terms/index.html               # Terms & Conditions
├── prohibited-items.html / prohibited-items/index.html
├── safety.html / safety/index.html             # Buyer & seller safety tips
├── community-guidelines.html / community-guidelines/index.html
├── account-deletion.html / account-deletion/index.html   # Play REQUIRED URL
├── verified-sellers.html / verified-sellers/index.html
├── listing/index.html          # Shared-listing landing page (open-in-app / Play Store)
├── 404.html                    # Not-found page + /listing/{slug}?id={id} deep-link router
├── CNAME                       # Pins the www.farmflowcaribbean.com custom domain
├── robots.txt / sitemap.xml    # sitemap includes <lastmod> on every URL
├── .well-known/
│   └── assetlinks.json         # Android App Links statement (see below)
├── images/                     # Favicons, og-image.png (real PNG share image), og-default.svg (legacy, unreferenced)
└── assets/
    ├── farmflow.css            # Shared stylesheet — brand tokens, .topnav, .cat-grid, .steps, .islands-row
    ├── css/styles.css          # Civil Digital styles (listing page only)
    └── brand/CivilDigitalIcon.svg
```

Every indexable page carries a self-referencing canonical, Open Graph + Twitter cards, favicon/apple-touch-icon/theme-color, and Organization+WebSite JSON-LD (`en-GB` sitewide). The homepage adds MobileApplication schema; `/faqs/` adds FAQPage schema; produce/island/guide pages add BreadcrumbList. A lightweight `.topnav` (islands, produce, guides, help, FAQs, contact) sits under the notice bar on every page so new content isn't orphaned.

**Known follow-up (flagged, not fixed in this repo):** `thewww.farmflowcaribbean.com` was found serving a 200 response alongside the canonical `www.farmflowcaribbean.com` domain. Self-referencing canonicals mitigate the duplicate-content risk, but a proper fix (301 redirect or removing the DNS entry) needs to happen at the registrar/host level, outside this repository.

## Publish (legacy: GitHub Pages, deploy from root — until the Firebase cut-over above)

1. Create/point a GitHub repo and push this branch (`main`).
2. **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `/ (root)`**.
3. **Settings → Pages → Custom domain:** `www.farmflowcaribbean.com` (already pinned by the `CNAME` file).
4. **DNS** at your registrar: `farmflow` as `CNAME` → `<github-user>.github.io`.
5. Enable **Enforce HTTPS** once the certificate provisions.

## Listing deep links

The app shares listings as `https://www.farmflowcaribbean.com/listing/{name-slug}?id={listingId}` —
pointed **directly** at this subdomain (no main-domain redirect). The path segment is a human-readable
slug of the listing name (what recipients see); `?id=` carries the real listing id, which is what
resolves the listing (names are not unique). That path has no static file, so `404.html` forwards it to
`/listing/?id={id}&name={slug}` before render, and `listing/index.html` shows the name + reference and
offers open-in-app / Play Store. Legacy links that put the id straight in the path
(`/listing/{id}`, or the old `/farmflow/listing/{id}`) still resolve: the `404.html` router falls back
to treating the path segment as the id when no `?id=` is present.

**On Firebase Hosting** the `/listing/` and `/seller/` paths are rewritten to the `web` Cloud Function
instead, which renders the real listing / stall (both URL forms, `?id=` or id-in-path). The
`404.html` router and `listing/index.html` above only apply on GitHub Pages; `listing/` is left out
of `dist/`.

## `.well-known/assetlinks.json`

Android App Links statement for `com.civildigital.farmflow`. Both the app's **listing share** App
Link (`share_link_host`) and its **password-reset / email-verify** App Link (`auth_link_host`) now
verify against **www.farmflowcaribbean.com**, so this file must stay live here at
`/.well-known/assetlinks.json` for those links to open the app directly.

The old `farmflow.civildigital.co.uk` host was retired on 2026-08-03 and no longer resolves. If a
copy of this statement is still published at `civildigital.co.uk/.well-known/assetlinks.json` it is
now only needed for any legacy install still pinned to that host; keep the
`sha256_cert_fingerprints` arrays in sync with this file for as long as it stays published.

## Design notes

- Do **not** import any Civil Digital CSS, headers, or nav into the support pages. The single shared element is the footer line "FarmFlow is operated by Civil Digital". (`listing/index.html` is the one deliberate exception — it uses the Civil Digital stylesheet.)
- Fonts are loaded from Google Fonts (Bricolage Grotesque + Nunito Sans). If self-hosting fonts is preferred, download the two families and update the `<link>` tags and CSS `font-family` stacks.
- The logo is currently a simplified inline SVG recreation. Replace with the real FarmFlow logo asset (SVG or PNG) in `index.html` (`.mark`) when available.

## Produce photos (`images/produce/`)

The category tiles on the home page and `/produce/`, and the produce pages' social-share
images (`images/produce/share/*.jpg`, 1200×630), use stock photos from Pexels under the
[Pexels licence](https://www.pexels.com/license/) (free for commercial use, no attribution
required; don't imply the people or brands shown endorse FarmFlow). They are the same photos as
the app's Play Store demo build (FarmFlow-App `store/README.md`). Each tile has a 240 px and
480 px WebP plus a 480 px JPEG fallback, cropped 4:3.

| Image | Used for | Pexels photo |
|---|---|---|
| `christophene` | Vegetables tile | https://www.pexels.com/photo/7543109/ |
| `mango` | Fruit tile | https://www.pexels.com/photo/7543169/ |
| `dasheen` | Root Crops tile | https://www.pexels.com/photo/7543152/ |
| `chadon-beni` | Herbs tile | https://www.pexels.com/photo/7456525/ |
| `pumpkin` | Provisions tile | https://www.pexels.com/photo/9823515/ |
| `bonnet` | Peppers / Scotch Bonnet tiles, scotch-bonnet share | https://www.pexels.com/photo/19029815/ |
| `pepper-sauce` | Homemade tile | https://www.pexels.com/photo/33800365/ |
| `yam-2` | Ground Provisions tile + share | https://www.pexels.com/photo/30204260/ |
| `yam` | Yam tile + share | https://www.pexels.com/photo/34143558/ |
| `cassava` | Cassava tile + share | https://www.pexels.com/photo/7543155/ |
| `dasheen-bush` | Callaloo tile + share (dasheen leaves, as callaloo is made in Trinidad) | https://www.pexels.com/photo/37143457/ |
| `plantain` | Plantain tile + share | https://www.pexels.com/photo/39049842/ |

Stock photos are used only on the marketing pages. Marketplace listings never show one: a listing
without the seller's own photo keeps its category emoji, so buyers can tell a real photo from an
illustration.

## Placeholders to replace (find & replace across all files)

| Token | Meaning |
|---|---|
| `{{SUPPORT_EMAIL}}` | Support email address |
| `{{WHATSAPP_NUMBER}}` | WhatsApp number in international format, digits only |
| `{{SUPPORT_HOURS}}` | e.g. "Mon–Fri, 9am–5pm (Jamaica time)" |
| `{{PLAY_STORE_URL}}` | Full Play Store listing URL |
| `{{EFFECTIVE_DATE}}` | Effective date for legal pages |
| `{{POLICY_VERSION}}` / `{{TERMS_VERSION}}` | Version identifiers (keep versioned — matches the app's consent-wording versioning discipline) |
| `{{BUSINESS_ADDRESS}}` | Civil Digital's registered address |
| `{{RETENTION_DAYS}}` | Days to complete deletion (e.g. 30) |
| `{{DELETION_SLA_DAYS}}` | SLA for web-initiated deletion requests |
| `{{FINANCE_RETENTION}}` / `{{ENFORCEMENT_RETENTION}}` / `{{KYC_RETENTION}}` | Retention periods for retained records |
| `{{GOVERNING_LAW_JURISDICTION}}` | Jurisdiction for the Terms |
| `{{FEE_IDENTITY}}` / `{{FEE_CATEGORY}}` / `{{FEE_RENEWAL}}` | Verified Seller fees (or "Contact us for pricing" until set) |

## Play Console wiring (important)

Once deployed, these URLs go into Play Console:

1. **Privacy policy URL** → `privacy.html`'s final URL (Store listing + Data Safety form). Lock this path before submitting; changing it later means re-review.
2. **Account deletion URL** → `account-deletion.html`'s final URL (Data Safety → Data deletion). Google requires this page to be reachable without the app and to describe both deletion steps and retained data — both are included.
3. The retained-data table in `account-deletion.html` and the collection table in `privacy.html` must stay consistent with the Data Safety form answers. Update all three together.

## Content notes

- **Legal drafts**: `privacy.html` and `terms.html` are structured drafts tailored to the actual stack (Firebase, Play Billing donations, off-app boost/verification payments via Stripe, AdMob, coarse location, 18+ marketplace, Jamaica & T&T DPAs). Have them reviewed by a lawyer before launch.
- **Boost language**: boost acquisition/payment language lives here on the web deliberately, and only describes contacting the team — consistent with the app-side string-audit discipline (no purchase language in-app).
- **AdMob**: the privacy policy discloses AdMob with "may show advertising" so the page is accurate whether the `config/ads` flag is on or off.
- **Verified Sellers**: category checklists mirror the phased rollout (machinery → livestock → meat) with status badges; update badges as phases launch.

## Quality floor

Responsive to mobile, keyboard-focus visible on tiles, `prefers-reduced-motion` respected, semantic headings, no JavaScript dependencies. FAQ accordions use native `<details>`.
