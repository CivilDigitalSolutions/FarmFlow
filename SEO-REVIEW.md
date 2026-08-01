# FarmFlow — SEO Review & Caribbean-Targeting Plan

**Prepared:** 1 August 2026
**Reviewer scope:** Full source review of the FarmFlow site + live-URL confirmation + Caribbean keyword/competitor research
**Nature of this document:** Review and recommendations only. **No files or live pages were changed.**

---

## 0. What was reviewed

**Live URL confirmed.** The canonical production domain is **`https://farmflow.civildigital.co.uk`** — confirmed from the `CNAME` file, `robots.txt`, and `sitemap.xml`, which all use this host. The alternative you suggested, `https://thefarmflow.civildigital.co.uk`, returned an HTTP 200 (not a 404) during this review — see the duplicate-domain flag in §2, because two live hosts serving the same content is itself an SEO risk. A direct live fetch of the canonical root was not completed in this session (one request timed out, one was not approved), **but this site is a static, dependency-free GitHub Pages site with no build step — the source *is* the served HTML** (confirmed in `README.md`). So the source review below is authoritative for what search engines see; there is no client-side rendering that could hide content.

**Source found: yes.** Full source is at `C:\Users\Tom\Documents\Claude Projects\CivilDigital\FarmFlow`. This report is saved there as `SEO-REVIEW.md`.

**Pages reviewed (every page):**

| URL | File | Indexable? |
|---|---|---|
| `/` (home) | `index.html` | yes |
| `/help/` | `help/index.html` | yes |
| `/faqs/` | `faqs/index.html` | yes |
| `/contact/` | `contact/index.html` | yes |
| `/privacy/` | `privacy/index.html` | yes |
| `/terms/` | `terms/index.html` | yes |
| `/prohibited-items/` | `prohibited-items/index.html` | yes |
| `/safety/` | `safety/index.html` | yes |
| `/community-guidelines/` | `community-guidelines/index.html` | yes |
| `/account-deletion/` | `account-deletion/index.html` | yes |
| `/verified-sellers/` | `verified-sellers/index.html` | yes |
| `/listing/` | `listing/index.html` | `noindex` (correct) |
| `/auth/action/`, `/auth/continue/` | — | `noindex,nofollow` (correct) |
| `/404` | `404.html` | `noindex` (correct) |
| Flat `*.html` (e.g. `faqs.html`) | — | meta-refresh + canonical redirect stubs → clean URLs (good) |
| `robots.txt`, `sitemap.xml`, `.well-known/assetlinks.json` | — | config OK |

---

## 1. Executive summary

**The single most important finding is strategic, not technical: this is a support / legal-policy hub, not a marketing website.** It exists primarily to satisfy Google Play Console requirements (privacy policy, account-deletion, app-links) and to help existing users. It does its compliance job well — clean URLs, custom 404, redirect discipline, mobile-responsive, no-JS, fast. But it contains **almost no content that a Caribbean farmer, vendor, or buyer would ever search for**, and it has **no acquisition/landing pages** targeting Caribbean search intent. As a growth channel, the site is currently close to invisible: a search for the product does not surface it, and "FarmFlow" is a **crowded brand name** already owned in results by unrelated products (UK dairy-herd software `myfarmflow.co.uk`, `farmflow.ca`, and several others).

**The Caribbean-targeting gap is the centrepiece of this review.** The site says "the Caribbean" and "island and town" generically but never names a single market (Jamaica, Trinidad & Tobago, Barbados, Guyana), never uses the produce vernacular people actually type ("ground provisions", yam, cassava, dasheen, callaloo, scotch bonnet, plantain, breadfruit), and carries no local currency signals (JMD/TTD/BBD/EC$/GYD) or local business/geo schema. Meanwhile competitors that *do* rank for these terms already exist (FarmLinkr, Farmgate E-Market, Cassava Matters e-market in Jamaica). Closing this gap is where the growth is.

**The highest-value technical fixes are cheap and fast:** self-referencing canonical tags (missing on every real page), Open Graph/Twitter cards on all pages (currently only on `/listing/` — a big miss given WhatsApp sharing dominates the region), FAQ + Organization + SoftwareApplication structured data, and a raster (PNG/JPG) share image to replace the SVG one that WhatsApp/Facebook won't render.

**Priorities at a glance:**

- **HIGH (do first):** Caribbean keyword & content strategy (§4); add canonicals; add OG/Twitter + PNG share image; add FAQPage / Organization / SoftwareApplication schema; rewrite the homepage title/H1 to target search intent; resolve the duplicate `thefarmflow` domain.
- **MEDIUM:** island landing pages, produce-category content, hreflang/region signals, Google Play (ASO) + citations, fix `lang` inconsistency, add `lastmod` to sitemap, favicons site-wide.
- **LOW:** self-host fonts, `theme-color` site-wide, minor polish.

---

## 2. Technical SEO

| # | Issue | Fix | Priority | Effort |
|---|---|---|---|---|
| T1 | **No canonical tags on real content pages.** Canonical `<link>` exists only on the flat redirect stubs (`faqs.html` etc.); the actual pages at `/help/`, `/faqs/`, `/privacy/`… have none. | Add a self-referencing `<link rel="canonical" href="https://farmflow.civildigital.co.uk/help/">` to every indexable page. Prevents any trailing-slash / parameter / cross-domain duplication ambiguity. | **High** | Low (1 line/page) |
| T2 | **Duplicate live domain risk.** `thefarmflow.civildigital.co.uk` returned HTTP 200, but the canonical host is `farmflow.civildigital.co.uk`. Two hosts serving identical content splits signals and can cause the wrong URL to rank. | Confirm what `thefarmflow` serves. If it duplicates the site, 301-redirect it to `farmflow.civildigital.co.uk` (or remove the DNS/host). Self-canonicals (T1) further protect against this. | **High** | Low–Med |
| T3 | **No structured data anywhere.** No `Organization`, `WebSite`+`SearchAction`, `FAQPage`, `BreadcrumbList`, or app schema. | Add JSON-LD: `Organization` (Civil Digital, logo, sameAs, areaServed = Caribbean island list) + `WebSite` sitewide; `FAQPage` on `/faqs/` (eligible for rich results); `SoftwareApplication`/`MobileApplication` on home (name, OS=Android, Play URL, applicationCategory, offers, areaServed); `BreadcrumbList` on sub-pages. | **High** | Med |
| T4 | **Open Graph / Twitter cards missing on all pages except `/listing/`.** Home + all content pages share with no title/description/image. In this region links spread primarily on **WhatsApp/Facebook**, so bare previews cost real reach. | Add `og:title`, `og:description`, `og:url`, `og:image`, `og:type`, `og:site_name`, and `twitter:card` to every indexable page. | **High** | Low–Med |
| T5 | **Share image is SVG.** `/listing/` uses `og:image = /images/og-default.svg`. WhatsApp, Facebook, iMessage, and Twitter/X **do not reliably render SVG** OG images. | Produce a 1200×630 **PNG/JPG** share image (branded, with produce imagery + "Caribbean produce marketplace") and reference it from all pages. Keep SVG only as a fallback. | **High** | Low |
| T6 | **No hreflang / region signal.** Site is `lang="en"` (and `en-GB` on `/listing/`) with no `hreflang`. Nothing tells Google the target audience is the Caribbean. | Since content is single-language English, hreflang is optional, but at minimum standardise `lang` and add region intent via schema `areaServed` + on-page place names (§4). If island-specific pages are added, consider `en-JM`, `en-TT`, `en-BB` hints. | **Medium** | Low |
| T7 | **Inconsistent `lang`.** Most pages `en`; `/listing/` is `en-GB`. | Pick one (`en` is fine; `en-GB` acceptable) and apply consistently. | **Low** | Low |
| T8 | **Sitemap has no `<lastmod>`.** Only `changefreq`/`priority` (largely ignored by Google). | Add `<lastmod>` per URL; it's the one field Google actually uses for crawl scheduling. Drop reliance on priority/changefreq. | **Low** | Low |
| T9 | **Favicons/apple-touch-icon and `theme-color` only on `/listing/`.** Home and content pages don't link `favicon.png` / `apple-touch-icon.png` or set `theme-color`. | Add `<link rel="icon">`, `<link rel="apple-touch-icon">`, and `<meta name="theme-color">` to the shared `<head>` of every page. Minor branding/UX + polish signal. | **Low** | Low |
| T10 | **Render-blocking Google Fonts.** Two families from Google Fonts on every page (preconnect is present, good). | Optional: self-host the two families (`README` already notes this path) to remove a third-party round-trip and improve LCP. Fine as-is for now. | **Low** | Med |
| — | **Working well:** HTTPS enforced (GitHub Pages), mobile viewport + responsive CSS, `prefers-reduced-motion` respected, no-JS content, clean trailing-slash URLs, disciplined redirect stubs, correct `noindex` on utility pages, valid `robots.txt` + sitemap, custom 404 with deep-link router. | Keep. | — | — |

---

## 3. On-page SEO

| # | Issue | Fix | Priority | Effort |
|---|---|---|---|---|
| O1 | **Homepage title & H1 waste the most valuable page.** Title is `FarmFlow — Help, Policies & Support`; H1 is just `FarmFlow`. The strongest page targets support intent, not buyer/seller intent. | Retitle to lead with what people search, e.g. `FarmFlow — Caribbean Produce Marketplace App | Buy & Sell Local Produce`. Make H1 descriptive: `FarmFlow — the Caribbean's produce & farming marketplace`. Keep support links, but reframe the page as the product's front door. | **High** | Low |
| O2 | **Brand-name ambiguity.** "FarmFlow" is already held in search by unrelated products (UK dairy software, `farmflow.ca`, others); the site does not appear for its own name. | Consistently qualify the brand on-page and in metadata as **"FarmFlow — Caribbean produce marketplace"**, add `Organization`/`SoftwareApplication` schema with `sameAs` (Play Store, social, Civil Digital), and build entity/citation signals (§5). Over time this disambiguates the brand. | **High** | Med (ongoing) |
| O3 | **Thin content / no keyword-targeted body copy.** Pages are short and support-oriented; no page targets "sell produce online Jamaica", "buy ground provisions", "farmers marketplace Trinidad", etc. | Add the acquisition content in §4 (island + produce landing pages, guides). Expand the home and `/help/` intros with natural use of target terms. | **High** | Med–High |
| O4 | **Meta descriptions are functional but support-framed.** They describe a "support site" rather than selling the marketplace. | Rewrite home + key descriptions to buyer/seller framing with Caribbean terms (e.g. "Buy and sell fresh local produce, ground provisions, and farm goods across Jamaica, Trinidad & Tobago and the wider Caribbean — free on Android."). | **Medium** | Low |
| O5 | **Internal linking is closed-loop.** Tiles/related/footer link only among the existing policy pages. | When new content pages exist, cross-link contextually (home → island/produce pages → help/FAQ). Add a lightweight top nav so acquisition pages aren't orphaned. | **Medium** | Low–Med |
| O6 | **Image alt text — latent issue.** Current imagery is decorative inline SVG (correctly `aria-hidden`/labelled). But there are **no real content images**, and the `README` notes the logo is a placeholder SVG to be replaced. | When real photos/logo are added (produce, farmers, app screenshots), give them descriptive, keyword-aware `alt` text ("FarmFlow app listing screen showing yellow yam for sale in Jamaica"). | **Medium** | Low (later) |
| O7 | **Heading hierarchy & URL structure — good.** One H1/page, logical H2/H3, clean readable URLs. | Keep; mirror the same discipline on new pages. | — | — |

---

## 4. Caribbean-targeted SEO — the centrepiece

The product is *for* the Caribbean, but the site is written for a generic, place-less "Caribbean" and never uses the words its users actually search. This is the biggest untapped opportunity. Four moves, in order:

### 4A. Target specific markets, not "the Caribbean"

Searchers use island/country and town names, not the regional abstraction. Prioritise by agricultural size and English-language search:

- **Jamaica** — largest opportunity. Very active ground-provision economy (~28,000 yam farmers; yellow yam a signature crop). Existing online competitors (FarmLinkr, Farmgate E-Market, Cassava Matters e-market) prove the search demand.
- **Trinidad & Tobago** — strong domestic produce market; NAMDEVCO ecosystem.
- **Barbados** and **Guyana** — secondary but worthwhile; Guyana has large-scale agriculture.
- Wider OECS / Eastern Caribbean (EC$ zone) as a later tier.

**Action:** create dedicated, indexable landing pages per priority market — e.g. `/jamaica/`, `/trinidad-and-tobago/` — each with local place names (parishes/regions), local produce, and a "sell your produce online in [Jamaica]" / "buy fresh produce in [Trinidad]" angle. Reference these from home and add `areaServed` in schema. **Priority: High. Effort: Med–High.**

### 4B. Use the produce vernacular people actually type

The site never uses these high-intent terms. "**Ground provisions**" is confirmed as a core, high-demand Caribbean search phrase; it appears **nowhere** on the site.

Target vocabulary to weave into content and dedicated category pages:

- **Ground provisions** (umbrella term): **yam** (yellow yam, negro/neger yam), **cassava** (yuca), **dasheen** / **eddoe** / **coco**, **sweet potato**, **tannia**, **pumpkin**.
- **Vegetables/herbs:** **callaloo**, **scotch bonnet pepper**, **pak choi**, **okra (ochro)**, **pigeon peas (gungo peas)**, **thyme/escallion (seasonings)**.
- **Fruit/tree crops:** **plantain**, **green banana**, **breadfruit**, **ackee**, **mango**, **june plum**, **naseberry**, **soursop**, **pimento (allspice)**, **coconut** (jelly/dry).
- **Marketplace terms:** "**farmers market**", "**produce market**", "**buy produce online [island]**", "**sell crops online**", "**wholesale produce [island]**", "**higglers/vendors**".

**Action:** produce-category pages (e.g. `/produce/ground-provisions/`, `/produce/yam/`, `/produce/scotch-bonnet/`) and natural inclusion of these terms in home/help copy and FAQ. This is exactly the long-tail where a niche app can out-rank generic classifieds. **Priority: High. Effort: Med–High.**

### 4C. Local currency & trust signals

- No **currency** signals anywhere. Add JMD (J$), TTD (TT$), BBD (Bds$), EC$, GYD where prices/examples appear, and in schema `priceCurrency` on any `offers`. Signals local relevance to both users and Google.
- **Support contact reads foreign.** The WhatsApp number is a **UK (+44 7568…) number** and hours are "Jamaica time". For a Caribbean audience, a **local/regional number** (or WhatsApp Business with a local presence) materially improves trust and local-intent signals. At minimum, state the region served explicitly.
- **Business/geo schema:** add `Organization` with `areaServed` = the target islands and, if there's any local operating presence, `LocalBusiness` with address/geo. (Civil Digital's registered address is UK per the source, so use `areaServed` rather than faking a local address.)

**Priority: Medium–High. Effort: Low–Med.**

### 4D. Speak to Caribbean farmers, vendors & communities

Current copy is neutral and transactional. Content that reflects local farming life (higglers, farm gate sales, parish/region markets, crop seasons, praedial larceny concerns — which ties neatly to the existing Safety and Verified-Seller pages) will both rank and convert better. Frame guides around real local tasks: *"How to sell yam online in Jamaica"*, *"Selling scotch bonnet peppers to buyers near you"*, *"A vendor's guide to farm-gate sales on FarmFlow"*. **Priority: Medium. Effort: Med.**

---

## 5. Content & off-page

| # | Opportunity | Action | Priority | Effort |
|---|---|---|---|---|
| C1 | **No acquisition/landing content at all.** | Build the island pages (§4A), produce-category pages (§4B), and a small set of intent guides (§4D). This is the core growth lever. | **High** | High |
| C2 | **No blog / guides for search intent.** | Add a lightweight `/guides/` or `/blog/` (static, no-JS is fine) with a handful of high-intent, localised articles ("how to sell produce online in Jamaica", "what are ground provisions", "getting a fair price at market vs online"). Internally link to app download. | **Medium** | Med |
| C3 | **App Store Optimisation (ASO) is the sibling channel.** The product is an Android app; much discovery happens in Google Play, and Play listings also surface in web search. | Optimise the Play listing title/short-description/keywords with the same Caribbean + produce terms; keep the web privacy/deletion URLs locked (already wired per `README`). Cross-link web ↔ Play. | **Medium** | Low–Med |
| C4 | **No local citations / backlinks.** Site doesn't appear in search partly from lack of authority signals. | Pursue Caribbean citations & links: **RADA** (Jamaica agricultural extension), **NAMDEVCO** (T&T), **Barbados Agricultural Society**, **Jamaica Information Service** (has featured farmer platforms), **UWI** agri departments, **Loop Caribbean / Jamaica Gleaner / Observer** tech coverage, local agri Facebook/WhatsApp communities, and app-directory listings. Each is a relevant, region-appropriate link/citation. | **Medium** | Med (ongoing) |
| C5 | **Competitive context.** FarmLinkr, Farmgate E-Market, and Cassava Matters e-market already target this space in Jamaica. | Differentiate on the app-native, islandwide, farmer-to-buyer angle and on the produce long-tail those broader sites cover thinly. Don't fight them on generic "fresh produce delivery"; win the specific crop + island queries. | **Medium** | Analysis |
| C6 | **Google Business Profile.** A marketplace app can't easily hold a GBP, but **Civil Digital** could, strengthening the operating entity's local footprint and `sameAs` graph. | Optional: set up/verify a Civil Digital GBP and link it from `Organization` schema. | **Low** | Low |

---

## 6. Prioritised action list (start-here order)

**High — do first (mostly quick wins + the strategy that matters):**

1. Rewrite the homepage `title` + `H1` (and meta description) to target Caribbean marketplace/buyer-seller intent, not "support". *(O1, O4)*
2. Add self-referencing **canonical** tags to every indexable page. *(T1)*
3. Add **Open Graph + Twitter** cards to all pages, and replace the SVG share image with a **1200×630 PNG/JPG**. *(T4, T5)*
4. Add **structured data**: `FAQPage` on `/faqs/`, `Organization` + `WebSite` sitewide, `SoftwareApplication` on home. *(T3)*
5. Resolve the **`thefarmflow` duplicate domain** (301 to canonical). *(T2)*
6. Stand up the **Caribbean keyword strategy**: first island page (`/jamaica/`) + first produce page (`/produce/ground-provisions/`), and weave the produce vernacular + currency into home/help/FAQ copy. *(4A, 4B, 4C, O3)*

**Medium — next:**

7. Additional island + produce-category pages; add a top nav so they aren't orphaned. *(4A, 4B, O5)*
8. Currency + local-contact/trust signals; standardise `lang`; add `areaServed`/geo schema. *(4C, T6, T7)*
9. Guides/blog for local search intent; ASO on Google Play; begin citation/backlink outreach. *(C2, C3, C4)*
10. Add `<lastmod>` to sitemap; favicons + `theme-color` site-wide. *(T8, T9)*

**Low — polish:**

11. Self-host fonts; descriptive alt text when real imagery/logo lands; Civil Digital GBP. *(T10, O6, C6)*

---

## 7. Sources

Caribbean search-term, competitor, and market research used above:

- [Ground provisions — Wikipedia](https://en.wikipedia.org/wiki/Ground_provisions)
- [Jamaican Staples and Ground Provisions — Jamaica876](https://jamaica876.com/jamaica-cuisine/staples-and-ground-provisions.html)
- [Farmgate E-Market — Jamaica online fresh produce](https://farmgate-emarket.com/)
- [FarmLinkr — Jamaican local produce](https://farmlinkr.com/)
- [Cassava Matters e-Market launch](https://cassavamatters.org/new-sell-buy-cassava-online-cassava-matters-e-market/)
- [Farmers Now Have Global Platform To Sell Produce — Jamaica Information Service](https://jis.gov.jm/features/farmers-now-have-global-platform-to-sell-produce/)
- [Jamaica — Agriculture (US Dept of Commerce country guide)](https://www.trade.gov/country-commercial-guides/jamaica-agriculture)
- Brand-ambiguity examples: [myfarmflow.co.uk](https://myfarmflow.co.uk/), [farmflow.ca](https://farmflow.ca/)

*Site content reviewed from source at `CivilDigital\FarmFlow` (static GitHub Pages site; source = served HTML). No changes were made.*
