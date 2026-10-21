/*
 * Website ads — Google AdSense, the web counterpart of the app's AdMob (same Google account and
 * publisher ID, same advertisers). Built like the app's ads (README "Feature 2"):
 *
 *   - Ships DARK. A placement shows only when its switch in Firestore `config/ads` is on AND its ad
 *     unit ID below is filled in. The switches are the app's own (`searchNativeEnabled`,
 *     `detailGridEnabled`, served by /api/config, OFF on any error), so one switch controls a
 *     placement in the app and on the website together — flipped from the app's Ad controls screen or
 *     the website's (AdControls, Account page, admins only). Until the AdSense units exist, the
 *     empty IDs keep the website dark whatever the switches say.
 *   - "No trace" while off: the AdSense script is injected only when an ad slot nears the screen,
 *     so with both off (or before any slot is near) no request goes to Google's ad servers.
 *   - Lazy: each slot loads only within AD_LOAD_MARGIN of the viewport (AdSlot).
 *   - Same placements as the app: listing detail ("Sponsored", under the listing) and search
 *     results (after 4 listings, then every 8 — adslots.ts). Never on sign-in, account, donate or
 *     error pages, and never in the server-rendered HTML.
 *   - Consent: AdSense shows Google's certified consent message (set up in AdSense → Privacy &
 *     messaging) itself — the web twin of the app's UMP form — and AdPrivacyLink in the footer
 *     reopens it so visitors can change their choice.
 *   - Off the real domain (the web.app test address, localhost) ads run in AdSense test mode, like the
 *     app's debug build using test ad units — never click live ads on your own site.
 */
import { useEffect, useRef, useState } from 'preact/hooks';

/** The AdSense publisher ID — the same `pub-` number as the app's AdMob IDs. */
export const ADSENSE_CLIENT = 'ca-pub-5319059698255764';

/**
 * Ad units, created in AdSense → Ads → By ad unit. Paste each unit's `data-ad-slot` (and, for the
 * in-feed unit, its `data-ad-layout-key`). An empty slot keeps that placement off.
 */
export const AD_UNITS = {
  /** Listing detail: a "Display ads" unit, responsive. */
  detail: { slot: '' },
  /** Search results: an "In-feed ads" unit styled to sit in the listing grid. */
  search: { slot: '', layoutKey: '' },
} as const;

const PRODUCTION_HOST = 'www.farmflowcaribbean.com';

export interface WebAdsConfig {
  detail: boolean;
  search: boolean;
}

const OFF: WebAdsConfig = { detail: false, search: false };
let configPromise: Promise<WebAdsConfig> | null = null;

function fetchAdsConfig(): Promise<WebAdsConfig> {
  configPromise ??= fetch('/api/config', { headers: { Accept: 'application/json' } })
    .then((r) => (r.ok ? r.json() : null))
    .then((b) => ({ detail: b?.ads?.detail === true, search: b?.ads?.search === true }))
    .catch(() => OFF); // fail-safe: no ads
  return configPromise;
}

/** Which placements may render right now: switched on AND an ad unit configured. */
export function useAdPlacements(): WebAdsConfig {
  const [config, setConfig] = useState<WebAdsConfig>(OFF);
  useEffect(() => {
    let live = true;
    fetchAdsConfig().then((c) => {
      if (live) setConfig({ detail: c.detail && !!AD_UNITS.detail.slot, search: c.search && !!AD_UNITS.search.slot });
    });
    return () => { live = false; };
  }, []);
  return config;
}

let scriptInjected = false;

function loadAdSense(): void {
  if (scriptInjected) return;
  scriptInjected = true;
  const s = document.createElement('script');
  s.async = true;
  s.crossOrigin = 'anonymous';
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;
  document.head.appendChild(s);
}

declare global {
  interface Window {
    adsbygoogle?: unknown[];
    googlefc?: { callbackQueue?: (() => void)[]; showRevocationMessage?: () => void };
  }
}

/**
 * Footer link that reopens Google's consent message (AdSense → Privacy & messaging), so a visitor can
 * change or withdraw their ad consent at any time. Shown only while ads are switched on — with ads
 * off nothing was ever asked.
 */
export function AdPrivacyLink() {
  const ads = useAdPlacements();
  if (!ads.detail && !ads.search) return null;
  const open = (e: Event) => {
    e.preventDefault();
    loadAdSense();
    window.googlefc = window.googlefc || {};
    window.googlefc.callbackQueue = window.googlefc.callbackQueue || [];
    window.googlefc.callbackQueue.push(() => window.googlefc?.showRevocationMessage?.());
  };
  return <> · <a href="/privacy/" onClick={open}>Privacy &amp; cookie settings</a></>;
}

/**
 * How far ahead of the screen an ad starts loading: roughly half a phone screen, so it's usually
 * ready by the time it scrolls into view, even on slow mobile data, without fetching ads far down a
 * list the visitor may never reach.
 */
export const AD_LOAD_MARGIN = '300px 0px';

/**
 * True once [el] is within AD_LOAD_MARGIN of the viewport (and stays true). Browsers without
 * IntersectionObserver get true at once — the old load-immediately behaviour.
 */
function useNearViewport(el: { current: Element | null }): boolean {
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (near || !el.current) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setNear(true);
        io.disconnect();
      }
    }, { rootMargin: AD_LOAD_MARGIN });
    io.observe(el.current);
    return () => io.disconnect();
  }, [near]);
  return near;
}

/**
 * One ad unit, loaded only when it nears the screen (Caribbean visitors are mostly on prepaid mobile
 * data: ads further down a list they never scroll to cost them nothing, the first screen loads
 * faster, and AdSense counts fewer unseen impressions). Until then it is an empty placeholder — the
 * <ins> itself is rendered only when near, because adsbygoogle.push() fills the FIRST unfilled <ins>
 * on the page, so pre-rendered ones further up would steal later slots' ads. The AdSense script is
 * likewise injected only when the first slot nears. Collapses to nothing if AdSense has no ad
 * (data-ad-status="unfilled").
 */
export function AdSlot({ unit, class: cls }: { unit: 'detail' | 'search'; class?: string }) {
  const box = useRef<HTMLElement>(null);
  const ins = useRef<HTMLModElement>(null);
  const near = useNearViewport(box);
  useEffect(() => {
    if (!near) return;
    loadAdSense();
    if (ins.current && !ins.current.dataset.adsbygoogleStatus) {
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch { /* blocked by an ad blocker */ }
    }
  }, [near]);
  const test = location.hostname !== PRODUCTION_HOST ? { 'data-adtest': 'on' } : {};
  const attrs = unit === 'search'
    ? { 'data-ad-slot': AD_UNITS.search.slot, 'data-ad-format': 'fluid', 'data-ad-layout-key': AD_UNITS.search.layoutKey }
    : { 'data-ad-slot': AD_UNITS.detail.slot, 'data-ad-format': 'auto', 'data-full-width-responsive': 'true' };
  return (
    <aside ref={box} class={`ad-slot ${near ? '' : 'ad-pending'} ${cls ?? ''}`} aria-label="Advertisement">
      <span class="ad-label">Sponsored</span>
      {near && <ins ref={ins} class="adsbygoogle" style={{ display: 'block' }} data-ad-client={ADSENSE_CLIENT} {...attrs} {...test} />}
    </aside>
  );
}
