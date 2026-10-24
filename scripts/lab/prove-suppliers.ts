// Supplier drill over HTTP against the running Node worker.
//  1. live extraction of public supplier pages (robots.txt respected, identified agent): a
//     reseller product page and a contact page; contacts verified by MX lookup, nothing sent;
//  2. import of quotes for the upper levels (the lab CSV is synthetic, example.com domains);
//  3. the ladder for one product at two volumes, and for another user (RLS);
//  4. refusals: a robots-disallowed path and a site that blocks identified clients.
// The comparison is for one variant (SKU SC1110); pages list every variant of the product.
// Usage: npx vite-node scripts/lab/prove-suppliers.ts
import { readFileSync } from 'node:fs';
import { ensureUser, readLocalSupabase } from './local-env';

const api = 'http://127.0.0.1:8787';

const main = async () => {
  const supabase = readLocalSupabase();
  const owner = await ensureUser(supabase, 'lab@scout.local', 'lab-password-123');
  const other = await ensureUser(supabase, 'other@scout.local', 'other-password-123');
  const call = async (token: string, path: string, init: RequestInit = {}) => {
    const response = await fetch(`${api}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };
  await fetch(`${supabase.apiUrl}/rest/v1/suppliers?user_id=eq.${owner.userId}`, {
    method: 'DELETE',
    headers: {
      apikey: supabase.serviceRoleKey,
      Authorization: `Bearer ${supabase.serviceRoleKey}`,
    },
  });
  const extract = (url: string, level?: string, sku?: string) =>
    call(owner.accessToken, '/api/suppliers/extract', {
      method: 'POST',
      body: JSON.stringify({
        url,
        productKey: 'raspberry-pi-5',
        termsConfirmed: true,
        ...(level ? { level } : {}),
        ...(sku ? { sku } : {}),
      }),
    });
  const out: Record<string, unknown> = {};
  out.pimoroniProduct = (
    await extract('https://shop.pimoroni.com/products/raspberry-pi-5', undefined, 'SC1110')
  ).body;
  out.pimoroniContact = (
    await extract('https://shop.pimoroni.com/pages/contact-us', 'reseller')
  ).body;
  out.piHutContact = (await extract('https://thepihut.com/pages/contact-us', 'reseller')).body;
  out.quotes = (
    await call(owner.accessToken, '/api/suppliers/import', {
      method: 'POST',
      body: JSON.stringify({
        csv: readFileSync('tests/fixtures/suppliers/quotes-raspberry-pi-5.csv', 'utf8'),
      }),
    })
  ).body;
  const ladder = async (token: string, volume: number) => {
    const body = (
      await call(token, `/api/supply/ladder?productKey=raspberry-pi-5&sku=SC1110&volume=${volume}`)
    ).body as {
      levels: Array<{ level: string; entries: Array<Record<string, unknown>> }>;
      levelsWithReachableOffer: number;
      outOfReach: unknown[];
    };
    return {
      levelsWithReachableOffer: body.levelsWithReachableOffer,
      levels: body.levels.map((group) => ({
        level: group.level,
        entries: group.entries.map((entry) => ({
          supplier: entry.supplierName,
          accessible: entry.accessible,
          reason: entry.reason,
          unitPriceAtVolumeMinor: entry.unitPriceAtVolumeMinor,
          priceRange: entry.priceRange,
          moq: (entry.moq as Record<string, unknown>).value,
          moqOrigin: (entry.moq as Record<string, unknown>).origin,
          contacts: entry.contacts,
        })),
      })),
      outOfReach: body.outOfReach,
    };
  };
  out.ladderAt20 = await ladder(owner.accessToken, 20);
  out.ladderAt60 = await ladder(owner.accessToken, 60);
  out.ladderOtherUser = (await ladder(other.accessToken, 60)).levels.length;
  out.robotsRefusal = (await extract('https://shop.pimoroni.com/cart', 'reseller')).body;
  out.blockedRefusal = (
    await extract('https://www.raspberrypi.com/products/raspberry-pi-5/', 'factory')
  ).body;
  console.log(JSON.stringify(out, null, 2));
};

void main();
