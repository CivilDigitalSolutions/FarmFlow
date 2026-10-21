import { useEffect } from 'preact/hooks';
import { Page } from '../components.tsx';

export function Gone({ kind }: { kind: 'listing' | 'seller' | 'page' }) {
  const what = kind === 'seller' ? 'stall' : kind;
  useEffect(() => { document.title = `Not available | FarmFlow`; }, []);
  return (
    <Page class="gone">
      <h1>{kind === 'page' ? 'Page not found' : `This ${what} is no longer available`}</h1>
      <p>{kind === 'page' ? 'That link doesn’t go anywhere.' : 'It may have sold out, expired or been removed by the seller.'}</p>
      <p><a class="btn btn-primary" href="/">Browse the marketplace</a></p>
    </Page>
  );
}
