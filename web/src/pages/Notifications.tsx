import { useEffect, useState } from 'preact/hooks';
import { Page, ProfileRetry, Spinner } from '../components.tsx';
import { dataModule, useSession } from '../session.ts';
import type { AppNotification, NotifyPref } from '../data.ts';
import type { PushState } from '../push.ts';
import { useRequireSignIn } from './Account.tsx';

const PREFS: { field: NotifyPref; label: string }[] = [
  { field: 'notifyMessages', label: 'Messages from buyers and sellers' },
  { field: 'notifyFavourites', label: 'New listings from sellers I follow' },
  { field: 'notifyExpiry', label: 'Listing expiry reminders' },
  { field: 'notifyAnnouncements', label: 'Announcements from FarmFlow' },
];

const pushModule = () => import('../push.ts');

/**
 * /notifications — the app's notifications screen and its Settings → Notifications switches, on the
 * web. A tapped push notification opens here (sw.js).
 */
export function Notifications() {
  const session = useSession();
  const loading = useRequireSignIn('/notifications');
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const uid = session.status === 'signedIn' ? session.uid : null;

  useEffect(() => { document.title = 'Notifications | FarmFlow'; }, []);

  useEffect(() => {
    if (!uid) return;
    dataModule().then(async (d) => {
      const list = await d.loadNotifications(uid);
      setItems(list);
      await d.markNotificationsRead(uid, list.filter((n) => !n.read).map((n) => n.id)).catch(() => undefined);
    }).catch(() => setItems([]));
  }, [uid]);

  if (session.status === 'signedIn' && session.profileError) return <Page><ProfileRetry /></Page>;
  if (loading || !uid) return <Page><Spinner /></Page>;

  return (
    <Page class="account notifications">
      <h1>Notifications</h1>
      <PushSettings uid={uid} />
      {items == null ? <Spinner /> : items.length ? (
        <ul class="notification-list">
          {items.map((n) => (
            <li key={n.id} class={n.read ? '' : 'unread'}>
              <strong>{n.title}</strong>
              {n.message.split('\n').map((line, i) => <p key={i}>{line}</p>)}
              {n.createdAt > 0 && <time dateTime={new Date(n.createdAt).toISOString()}>{new Date(n.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</time>}
            </li>
          ))}
        </ul>
      ) : (
        <p class="empty">No notifications yet.</p>
      )}
    </Page>
  );
}

function PushSettings({ uid }: { uid: string }) {
  const [state, setState] = useState<PushState | null>(null);
  const [prefs, setPrefs] = useState<Record<NotifyPref, boolean> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    pushModule().then((m) => m.pushState()).then(setState).catch(() => setState('unsupported'));
    dataModule().then((d) => d.loadNotifyPrefs(uid)).then(setPrefs).catch(() => undefined);
  }, [uid]);

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      const m = await pushModule();
      if (state === 'on') {
        await m.disablePush(uid);
        setState('off');
      } else {
        setState(await m.enablePush(uid));
      }
    } catch {
      setError('Couldn’t change notifications on this device. Try again.');
    }
    setBusy(false);
  };

  const flipPref = async (field: NotifyPref) => {
    if (!prefs) return;
    const next = !prefs[field];
    setPrefs({ ...prefs, [field]: next });
    try {
      await (await dataModule()).setNotifyPref(uid, field, next);
    } catch {
      setPrefs((p) => (p ? { ...p, [field]: !next } : p));
      setError('Couldn’t save that change. Check your connection.');
    }
  };

  if (state == null) return <Spinner />;
  return (
    <section class="notice-box push-settings">
      <strong>Notifications on this device</strong>
      {state === 'unconfigured' && <p>Push notifications on the website are coming soon. You’ll still see everything here.</p>}
      {state === 'needs-install' && (
        <p>To get notifications on iPhone or iPad, add FarmFlow to your Home Screen first: tap{' '}
          <span class="ios-share" aria-label="Share">Share</span> then <em>Add to Home Screen</em>, open
          FarmFlow from your Home Screen, and turn notifications on here.</p>
      )}
      {state === 'unsupported' && <p>This browser doesn’t support notifications.</p>}
      {state === 'blocked' && (
        <p>Notifications are blocked for FarmFlow. Allow them in your browser’s or phone’s settings, then
          come back here.</p>
      )}
      {(state === 'on' || state === 'off') && (
        <label class="toggle">
          <input type="checkbox" role="switch" checked={state === 'on'} disabled={busy} onChange={toggle} />
          <span>{busy ? 'Working…' : 'Push notifications'}</span>
        </label>
      )}
      {prefs && PREFS.map(({ field, label }) => (
        <label class="toggle" key={field}>
          <input type="checkbox" role="switch" checked={prefs[field]} onChange={() => flipPref(field)} />
          <span>{label}</span>
        </label>
      ))}
      <p class="hint">These are the same choices as the Android app’s Settings — changing one changes both.
        Messages about your account or listings from our moderators are always sent.</p>
      {error && <p class="error" role="alert">{error}</p>}
    </section>
  );
}
