import { useEffect, useState } from 'preact/hooks';
import { NotFoundError, fetchSeller } from '../api.ts';
import { Badge, Card, Page, Spinner, place } from '../components.tsx';
import type { Location } from '../router.ts';
import { dataModule, useSession } from '../session.ts';
import type { SellerData } from '../types.ts';
import { Gone } from './Gone.tsx';

/**
 * A seller's stall (/seller/{slug}?id=) — the page the stock-sheet QR code opens. Public, because the
 * seller hands it out themselves. Contact stays on each listing, behind sign-in, as in the app.
 */
export function SellerPage({ loc, initial }: { loc: Location; initial: SellerData | null }) {
  const id = loc.search.get('id') ?? '';
  const [data, setData] = useState<SellerData | null>(initial?.seller.id === id ? initial : null);
  const [gone, setGone] = useState(false);
  const [error, setError] = useState(false);
  const session = useSession();

  useEffect(() => {
    if (data?.seller.id === id) return;
    setData(null);
    if (!id) { setGone(true); return; }
    fetchSeller(id)
      .then(setData)
      .catch((e) => (e instanceof NotFoundError ? setGone(true) : setError(true)));
  }, [id]);

  useEffect(() => {
    if (data) document.title = `${data.seller.name} | FarmFlow stall`;
  }, [data]);

  // AppViewModel.recordProfileView — signed-in viewers only (events must carry the viewer's uid).
  useEffect(() => {
    if (session.status !== 'signedIn' || !data) return;
    dataModule().then((d) => d.logEvent('PROFILE_VIEW', data.seller.id, null, session.uid)).catch(() => undefined);
  }, [session.status, data?.seller.id]);

  if (gone) return <Gone kind="seller" />;
  if (error) return <Page><p class="empty">Couldn’t load this stall. Check your connection and try again.</p></Page>;
  if (!data) return <Page><Spinner /></Page>;

  const s = data.seller;
  const where = place(s);
  const stats = [
    `${s.followers} follower${s.followers === 1 ? '' : 's'}`,
    s.yearsOnPlatform > 0 ? `${s.yearsOnPlatform} yr${s.yearsOnPlatform === 1 ? '' : 's'} on FarmFlow` : 'New on FarmFlow',
  ];
  return (
    <Page class="stall">
      <section class="stall-head">
        {s.photoUrl
          ? <img class="stall-photo" src={s.photoUrl} alt={s.name} />
          : <span class="stall-photo stall-initial" aria-hidden="true">{(s.name || '?').charAt(0)}</span>}
        <div>
          <h1>{s.name}</h1>
          <Badge verification={s.verification} />
          {where && <p class="stall-place">{where}</p>}
          <p class="stall-stats">{stats.join(' · ')}</p>
        </div>
      </section>
      {s.about && <p class="desc">{s.about}</p>}
      <h2>In stock today</h2>
      {data.listings.length ? (
        <div class="grid">{data.listings.map((l) => <Card key={l.id} listing={l} />)}</div>
      ) : (
        <p class="empty">Nothing in stock right now — check back soon.</p>
      )}
    </Page>
  );
}
