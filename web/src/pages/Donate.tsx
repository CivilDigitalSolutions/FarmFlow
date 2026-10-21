import { useEffect, useState } from 'preact/hooks';
import { startDonation } from '../api.ts';
import { Page } from '../components.tsx';
import type { Location } from '../router.ts';
import { authModule, getSession } from '../session.ts';

/** DonationConfig tiers (£3 / £5 / £10), in pence. */
const TIERS = [300, 500, 1000];
const MIN = 100;
const MAX = 50000;

/**
 * Donations through Stripe Checkout. The card form is Stripe's own hosted page (Apple Pay and
 * Google Pay included), so FarmFlow never sees card details. Donating grants nothing in the app and
 * needs no account; a signed-in donor's uid is attached for the admin ledger only.
 */
export function Donate() {
  const [amount, setAmount] = useState<number>(500);
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { document.title = 'Support FarmFlow | FarmFlow'; }, []);

  const customPence = custom ? Math.round(Number(custom) * 100) : null;
  const pence = customPence ?? amount;
  const valid = Number.isInteger(pence) && pence >= MIN && pence <= MAX;

  const donate = async () => {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const token = getSession().status === 'signedIn' ? await (await authModule()).idToken() : null;
      location.assign(await startDonation(pence, token));
    } catch (e) {
      setError((e as Error).message === 'invalid_amount'
        ? 'Choose an amount between £1 and £500.'
        : 'Donations aren’t available right now. Please try again later.');
      setBusy(false);
    }
  };

  return (
    <Page class="donate">
      <h1>Support FarmFlow</h1>
      <p class="lede">
        FarmFlow is free for growers and buyers. If it helps you, a small donation keeps it running and
        growing across the Caribbean.
      </p>
      <div class="tiers" role="radiogroup" aria-label="Donation amount">
        {TIERS.map((t) => (
          <button key={t} type="button" role="radio" aria-checked={!custom && amount === t}
            class={`tier ${!custom && amount === t ? 'tier-on' : ''}`}
            onClick={() => { setAmount(t); setCustom(''); }}>
            £{t / 100}
          </button>
        ))}
      </div>
      <label class="custom-amount">
        <span>Or another amount (£)</span>
        <input type="number" inputMode="decimal" min={1} max={500} step="0.01" placeholder="e.g. 7" value={custom}
          onInput={(e) => setCustom((e.target as HTMLInputElement).value)} />
      </label>
      {custom && !valid && <p class="error">Choose an amount between £1 and £500.</p>}
      {error && <p class="error" role="alert">{error}</p>}
      <button type="button" class="btn btn-primary btn-block" disabled={!valid || busy} onClick={donate}>
        {busy ? 'Opening secure checkout…' : `Donate £${(pence / 100).toFixed(pence % 100 ? 2 : 0)}`}
      </button>
      <p class="hint">Payments are processed securely by Stripe. Apple Pay and Google Pay are accepted where available.</p>
    </Page>
  );
}

export function DonateThanks({ loc }: { loc: Location }) {
  useEffect(() => { document.title = 'Thank you | FarmFlow'; }, []);
  const ok = loc.search.has('session_id');
  return (
    <Page class="donate">
      <h1>{ok ? 'Thank you!' : 'Support FarmFlow'}</h1>
      <p class="lede">
        {ok
          ? 'Your donation helps keep FarmFlow free for Caribbean growers and buyers. Stripe will email your receipt.'
          : 'No donation was taken.'}
      </p>
      <p><a class="btn btn-primary" href="/">Back to the marketplace</a></p>
    </Page>
  );
}
