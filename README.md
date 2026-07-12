# FarmFlow Support Site — farmflow.civildigital.co.uk

Production static site for **farmflow.civildigital.co.uk**, published with GitHub Pages.
The repository root **is** the website root (no build step). Static, dependency-free branch
site for the FarmFlow Android app, designed to sit alongside (but look nothing like)
civildigital.co.uk. All pages are plain HTML + one shared stylesheet.

## Structure.

```
/
├── index.html                  # Tile-grid home page
├── help.html                   # Help & Support hub
├── faqs.html                   # FAQs (accordion via <details>)
├── contact.html                # Contact support
├── privacy.html                # Privacy Policy (Play Console URL)
├── terms.html                  # Terms & Conditions
├── prohibited-items.html       # Prohibited Items Policy
├── safety.html                 # Buyer & seller safety tips
├── community-guidelines.html   # Moderation policy & appeals
├── account-deletion.html       # Account & data deletion (Play REQUIRED URL)
├── verified-sellers.html       # Verified Seller Programme
├── listing/index.html          # Shared-listing landing page (open-in-app / Play Store)
├── 404.html                    # Not-found page + /listing/{slug}?id={id} deep-link router
├── CNAME                       # Pins the farmflow.civildigital.co.uk custom domain
├── robots.txt / sitemap.xml
├── .well-known/
│   └── assetlinks.json         # Android App Links statement (see below)
├── images/                     # Favicons + og-default.svg (used by listing page)
└── assets/
    ├── farmflow.css            # Shared stylesheet (all brand tokens in :root)
    ├── css/styles.css          # Civil Digital styles (listing page only)
    └── brand/CivilDigitalIcon.svg
```

## Publish (GitHub Pages, deploy from root)

1. Create/point a GitHub repo and push this branch (`main`).
2. **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `/ (root)`**.
3. **Settings → Pages → Custom domain:** `farmflow.civildigital.co.uk` (already pinned by the `CNAME` file).
4. **DNS** at your registrar: `farmflow` as `CNAME` → `<github-user>.github.io`.
5. Enable **Enforce HTTPS** once the certificate provisions.

## Listing deep links

The app shares listings as `https://farmflow.civildigital.co.uk/listing/{name-slug}?id={listingId}` —
pointed **directly** at this subdomain (no main-domain redirect). The path segment is a human-readable
slug of the listing name (what recipients see); `?id=` carries the real listing id, which is what
resolves the listing (names are not unique). That path has no static file, so `404.html` forwards it to
`/listing/?id={id}&name={slug}` before render, and `listing/index.html` shows the name + reference and
offers open-in-app / Play Store. Legacy links that put the id straight in the path
(`/listing/{id}`, or the old `/farmflow/listing/{id}`) still resolve: the `404.html` router falls back
to treating the path segment as the id when no `?id=` is present.

## `.well-known/assetlinks.json`

Android App Links statement for `com.civildigital.farmflow`. The app's **listing share** App Link now
verifies against **farmflow.civildigital.co.uk**, so this file must stay live here at
`/.well-known/assetlinks.json` for share links to open the app directly. The app's **password-reset**
deep link still verifies against **civildigital.co.uk**, so the same statement must also stay live at
`civildigital.co.uk/.well-known/assetlinks.json`. Keep the `sha256_cert_fingerprints` arrays in both
copies in sync.

## Design notes

- Do **not** import any Civil Digital CSS, headers, or nav into the support pages. The single shared element is the footer line "FarmFlow is operated by Civil Digital". (`listing/index.html` is the one deliberate exception — it uses the Civil Digital stylesheet.)
- Fonts are loaded from Google Fonts (Bricolage Grotesque + Nunito Sans). If self-hosting fonts is preferred, download the two families and update the `<link>` tags and CSS `font-family` stacks.
- The logo is currently a simplified inline SVG recreation. Replace with the real FarmFlow logo asset (SVG or PNG) in `index.html` (`.mark`) when available.

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
