import type { ComponentChildren } from 'preact';
import { AdPrivacyLink } from './ads.tsx';
import { useEffect, useState } from 'preact/hooks';
import { PLAY_URL, isAndroid, isIos, isStandalone, store } from './format.ts';
import { openedFromApp } from './promo.ts';
import { formatDistance, priceEstimateLabel } from './search.ts';
import { clearNotice, dataModule, refreshSession, useSession } from './session.ts';
import { useLocation } from './router.ts';
import type { PublicListing, Verification } from './types.ts';

// Class names match functions/web/render.js (the server-rendered pages) so the app takes over a
// server-rendered page without the layout shifting.

/**
 * Chats waiting for the signed-in user, re-checked on every page change (so reading a chat clears
 * the badge) and every minute while the page is visible.
 */
function useUnreadChats(uid: string | null, path: string): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!uid) { setN(0); return; }
    let live = true;
    const check = () => {
      if (document.visibilityState !== 'visible') return;
      dataModule().then((d) => d.unreadChatCount(uid)).then((c) => { if (live) setN(c); }).catch(() => undefined);
    };
    check();
    const timer = setInterval(check, 60_000);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('popstate', check);
    return () => { live = false; clearInterval(timer); document.removeEventListener('visibilitychange', check); window.removeEventListener('popstate', check); };
  }, [uid, path]);
  return n;
}

export function Header() {
  const session = useSession();
  const loc = useLocation();
  const unread = useUnreadChats(session.status === 'signedIn' ? session.uid : null, loc.path);
  return (
    <header class="topbar">
      <div class="topbar-in">
        <a class="brand" href="/">
          <img src="/images/favicon.png" alt="" width={28} height={28} />FarmFlow
        </a>
        <nav class="topbar-nav">
          <a href="/">Marketplace</a>
          <a href="/sell">Sell</a>
          <a href="/donate">Donate</a>
          <a href="/about/">About</a>
          {session.status === 'signedIn' && (
            <a class="nav-messages" href="/messages" aria-label={unread ? `Messages, ${unread} unread` : 'Messages'}>
              Messages{unread > 0 && <span class="nav-badge" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>}
            </a>
          )}
          {session.status === 'signedIn' ? (
            <a class="btn btn-small" href="/account">Account</a>
          ) : session.status === 'signedOut' ? (
            <a class="btn btn-small" href="/signin">Sign in</a>
          ) : (
            <span class="btn btn-small btn-ghost" aria-hidden="true">…</span>
          )}
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer class="foot">
      <div class="foot-in">
        <p>
          <a href="/about/">About FarmFlow</a> · <a href="/help/">Help</a> · <a href="/safety/">Safety</a> ·{' '}
          <a href="/terms/">Terms</a> · <a href="/privacy/">Privacy</a> · <a href="/contact/">Contact</a>
          <AdPrivacyLink />
        </p>
        <p><a href={PLAY_URL} rel="noopener">Get FarmFlow on Google Play</a></p>
        <p class="foot-legal">The FarmFlow website and app are built by Civil Digital · © 2026 Civil Digital. All rights reserved.</p>
      </div>
    </footer>
  );
}

export function Badge({ verification }: { verification: Verification }) {
  if (verification === 'VERIFIED') return <span class="badge badge-verified">✓ Verified</span>;
  if (verification === 'COMMERCIAL') return <span class="badge badge-commercial">✓ Commercial Farm</span>;
  return null;
}

export function place(item: { townName: string; island: string }): string {
  return [item.townName, item.island].filter(Boolean).join(', ');
}

export function Card({ listing, distanceKm, displayCurrency }: {
  listing: PublicListing;
  distanceKm?: number | null;
  displayCurrency?: string | null;
}) {
  const cover = listing.images[0];
  const estimate = displayCurrency ? priceEstimateLabel(listing, displayCurrency) : null;
  const distance = formatDistance(distanceKm ?? null);
  return (
    <a class="card" href={listing.path}>
      <div class="card-media">
        {cover ? (
          <img src={cover.thumbnailUrl || cover.imageUrl} alt={listing.title} loading="lazy" decoding="async" />
        ) : (
          <span class="card-emoji" aria-hidden="true">{listing.emoji}</span>
        )}
      </div>
      <div class="card-body">
        <h3 class="card-title">{listing.title}</h3>
        <p class="card-price">
          {listing.priceLabel}
          {estimate && <span class="estimate"> {estimate}</span>}
        </p>
        <p class="card-meta">{[place(listing), distance].filter(Boolean).join(' · ')}</p>
        <Badge verification={listing.verification} />
      </div>
    </a>
  );
}

export function Page({ class: cls, children }: { class?: string; children: ComponentChildren }) {
  return <main class={`page ${cls ?? ''}`}><SessionNotice />{children}</main>;
}

/** The session's one-off notice (e.g. "your account deletion request has been cancelled"). */
function SessionNotice() {
  const session = useSession();
  if (session.status !== 'signedIn' || !session.notice) return null;
  return (
    <aside class="notice-box session-notice" role="status">
      <p>{session.notice}</p>
      <button type="button" class="btn btn-small btn-ghost" onClick={clearNotice}>Dismiss</button>
    </aside>
  );
}

/** Shown when the signed-in user's profile couldn't be read — never treated as "no profile". */
export function ProfileRetry() {
  const [busy, setBusy] = useState(false);
  return (
    <div class="empty" role="alert">
      <p>Couldn’t load your FarmFlow profile. Check your connection.</p>
      <button type="button" class="btn btn-primary" disabled={busy} onClick={async () => {
        setBusy(true);
        await refreshSession().catch(() => undefined);
        setBusy(false);
      }}>{busy ? 'Trying…' : 'Try again'}</button>
    </div>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return <p class="loading" role="status"><span class="spinner" aria-hidden="true" />{label}</p>;
}

const APP_PROMO_DISMISSED = 'ff-app-promo-dismissed'; // shared with the marketing pages' assets/app-promo.js
const APP_PROMO_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * "Get the Android app" corner card with the official Google Play badge — the web app's twin of the
 * marketing pages' assets/app-promo.js (same storage key, so closing it anywhere on the site closes
 * it everywhere for 30 days). Android and desktop only: iPhone / iPad have no Android app, and the
 * installed web app is already "the app".
 */
export function AppPromo() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (isIos() || isStandalone() || openedFromApp()) return;
    const at = Number(store.get(APP_PROMO_DISMISSED));
    if (at && Date.now() - at < APP_PROMO_SNOOZE_MS) return;
    const t = setTimeout(() => setOpen(true), 2500);
    return () => clearTimeout(t);
  }, []);
  if (!open) return null;
  return (
    <aside class="app-promo is-open" aria-label="Get the FarmFlow Android app">
      <button type="button" class="app-promo-close" aria-label="Close" onClick={() => {
        store.set(APP_PROMO_DISMISSED, String(Date.now()));
        setOpen(false);
      }}>×</button>
      <img class="app-promo-icon" src="/icons/icon-192.png" width={44} height={44} alt="" />
      <div class="app-promo-text">
        <strong>Get the FarmFlow app</strong>
        <span>Buy and sell on Android — free.</span>
        <a class="app-promo-badge" href={PLAY_URL} rel="noopener">
          <picture>
            <source type="image/webp" srcset="/images/google-play-badge-162.webp 1x, /images/google-play-badge-324.webp 2x" />
            <img src="/images/google-play-badge-162.png" srcset="/images/google-play-badge-324.png 2x" width={162} height={63} alt="Get it on Google Play" />
          </picture>
        </a>
      </div>
    </aside>
  );
}

const INSTALL_DISMISSED = 'ff.installHintDismissed';

/**
 * "Install FarmFlow" prompt. iPhone / iPad have no install button, so Safari users get the
 * Share → Add to Home Screen instructions. Android visitors get the AppPromo card (the Play app)
 * instead. Other browsers that support it get a one-tap install. Dismissal is remembered.
 */
export function InstallHint() {
  const [dismissed, setDismissed] = useState(() => store.get(INSTALL_DISMISSED) === '1' || isStandalone());
  const [prompt, setPrompt] = useState<(Event & { prompt: () => Promise<void> }) | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setPrompt(e as Event & { prompt: () => Promise<void> }); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (dismissed) return null;
  const close = () => { store.set(INSTALL_DISMISSED, '1'); setDismissed(true); };

  let body: ComponentChildren = null;
  if (isIos()) {
    body = (
      <p>
        <strong>Add FarmFlow to your Home Screen.</strong> Tap <span class="ios-share" aria-label="Share">Share</span>{' '}
        then <em>Add to Home Screen</em> to open it like an app.
      </p>
    );
  } else if (isAndroid()) {
    return null; // Android visitors get the AppPromo card instead
  } else if (prompt) {
    body = (
      <p>
        <strong>Install FarmFlow</strong> to open the marketplace in its own window.{' '}
        <button class="link" type="button" onClick={async () => { await prompt.prompt(); close(); }}>Install</button>
      </p>
    );
  }
  if (!body) return null;
  return (
    <aside class="install-hint" role="note">
      {body}
      <button class="install-close" type="button" aria-label="Dismiss" onClick={close}>×</button>
    </aside>
  );
}
