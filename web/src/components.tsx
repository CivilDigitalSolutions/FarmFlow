import type { ComponentChildren } from 'preact';
import { AdPrivacyLink } from './ads.tsx';
import { useEffect, useState } from 'preact/hooks';
import { PLAY_URL, isAndroid, isIos, isStandalone, store } from './format.ts';
import { formatDistance, priceEstimateLabel } from './search.ts';
import { refreshSession, useSession } from './session.ts';
import type { PublicListing, Verification } from './types.ts';

// Class names match functions/web/render.js (the server-rendered pages) so the app takes over a
// server-rendered page without the layout shifting.

export function Header() {
  const session = useSession();
  return (
    <header class="topbar">
      <div class="topbar-in">
        <a class="brand" href="/">
          <img src="/images/favicon.png" alt="" width={28} height={28} />FarmFlow
        </a>
        <nav class="topbar-nav">
          <a href="/">Marketplace</a>
          <a href="/donate">Donate</a>
          <a href="/about/">About</a>
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
  return <main class={`page ${cls ?? ''}`}>{children}</main>;
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

const INSTALL_DISMISSED = 'ff.installHintDismissed';

/**
 * "Install FarmFlow" prompt. iPhone / iPad have no install button, so Safari users get the
 * Share → Add to Home Screen instructions. Android visitors are pointed at the Play app, which is the
 * full experience there. Other browsers that support it get a one-tap install. Dismissal is remembered.
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
    body = (
      <p>
        <strong>On Android?</strong> The FarmFlow app adds notifications and selling.{' '}
        <a href={PLAY_URL} rel="noopener">Get it on Google Play</a>
      </p>
    );
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
