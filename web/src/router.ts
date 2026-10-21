/*
 * A tiny History-API router. Only the web app's own routes are handled in-page; every other link
 * (the marketing pages — /about/, /help/, /produce/…) is a normal full page load.
 */
import { useEffect, useState } from 'preact/hooks';

export interface Location {
  path: string;
  search: URLSearchParams;
}

const APP_ROUTE = /^\/(?:$|listing(?:\/.*)?$|seller\/.+$|signin\/?$|account(?:\/setup)?\/?$|donate(?:\/thanks)?\/?$)/;

export function isAppRoute(path: string): boolean {
  return APP_ROUTE.test(path);
}

function current(): Location {
  return { path: location.pathname, search: new URLSearchParams(location.search) };
}

const listeners = new Set<() => void>();

export function navigate(to: string, opts: { replace?: boolean } = {}): void {
  const url = new URL(to, location.origin);
  if (url.origin !== location.origin || !isAppRoute(url.pathname)) {
    location.assign(url.href);
    return;
  }
  if (opts.replace) history.replaceState(null, '', url.pathname + url.search + url.hash);
  else history.pushState(null, '', url.pathname + url.search + url.hash);
  if (!opts.replace) window.scrollTo(0, 0);
  listeners.forEach((l) => l());
}

export function useLocation(): Location {
  const [loc, setLoc] = useState(current);
  useEffect(() => {
    const update = () => setLoc(current());
    listeners.add(update);
    window.addEventListener('popstate', update);
    return () => {
      listeners.delete(update);
      window.removeEventListener('popstate', update);
    };
  }, []);
  return loc;
}

/** Turns clicks on same-origin app links into in-page navigation. */
export function interceptLinks(): void {
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element | null)?.closest?.('a');
    if (!a || a.target || a.hasAttribute('download') || a.getAttribute('rel')?.includes('external')) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || !isAppRoute(url.pathname)) return;
    e.preventDefault();
    navigate(url.pathname + url.search + url.hash);
  });
}
