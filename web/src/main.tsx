import { render } from 'preact';
import { AppPromo, Footer, Header } from './components.tsx';
import { Account, AccountSetup } from './pages/Account.tsx';
import { Donate, DonateThanks } from './pages/Donate.tsx';
import { Gone } from './pages/Gone.tsx';
import { Home } from './pages/Home.tsx';
import { ListingPage } from './pages/Listing.tsx';
import { SellerPage } from './pages/Seller.tsx';
import { ListingEditor, SellHub } from './pages/Sell.tsx';
import { Notifications } from './pages/Notifications.tsx';
import { MessagesRoute } from './pages/Messages.tsx';
import { SignIn } from './pages/SignIn.tsx';
import { interceptLinks, useLocation, type Location } from './router.ts';
import { initSession } from './session.ts';
import type { Initial, ListingData, SellerData } from './types.ts';
import './styles.css';

/** Page data the server embedded in a server-rendered /listing/ or /seller/ page (render.js). */
function readInitial(): Initial | null {
  const el = document.getElementById('ff-initial');
  if (!el?.textContent) return null;
  try { return JSON.parse(el.textContent) as Initial; } catch { return null; }
}

const initial = readInitial();
const initialListing: ListingData | null = initial?.route === 'listing' ? initial.data : null;
const initialSeller: SellerData | null = initial?.route === 'seller' ? initial.data : null;
const initialGone = initial?.route === 'gone' ? initial.kind : null;
const firstPath = location.pathname;

function Route({ loc }: { loc: Location }) {
  const p = loc.path;
  // A server-rendered "no longer available" page stays that way until the visitor navigates.
  if (initialGone && p === firstPath) return <Gone kind={initialGone} />;
  if (p === '/') return <Home loc={loc} />;
  if (p === '/listing' || p.startsWith('/listing/')) return <ListingPage loc={loc} initial={initialListing} />;
  if (p.startsWith('/seller/')) return <SellerPage loc={loc} initial={initialSeller} />;
  if (/^\/signin\/?$/.test(p)) return <SignIn loc={loc} />;
  if (/^\/account\/setup\/?$/.test(p)) return <AccountSetup loc={loc} />;
  if (/^\/account\/?$/.test(p)) return <Account />;
  if (/^\/notifications\/?$/.test(p)) return <Notifications />;
  if (/^\/messages(\/[^/]+)?\/?$/.test(p)) return <MessagesRoute loc={loc} />;
  if (/^\/sell\/?$/.test(p)) return <SellHub loc={loc} />;
  if (/^\/sell\/(new|edit)\/?$/.test(p)) return <ListingEditor key={p + loc.search.toString()} loc={loc} />;
  if (/^\/donate\/thanks\/?$/.test(p)) return <DonateThanks loc={loc} />;
  if (/^\/donate\/?$/.test(p)) return <Donate />;
  return <Gone kind="page" />;
}

function App() {
  const loc = useLocation();
  return (
    <>
      <Header />
      <Route loc={loc} />
      <Footer />
      <AppPromo />
    </>
  );
}

initSession(location.pathname);
interceptLinks();
const root = document.getElementById('app')!;
root.textContent = ''; // replace the server-rendered / no-JS markup
render(<App />, root);

if ('serviceWorker' in navigator && location.hostname !== 'localhost') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
