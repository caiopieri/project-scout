import { ConnectorError, auctionTermsText } from '@scout/domain';
import { z } from 'zod';
import { GSA_AUCTIONS_MANIFEST } from './manifest';

export { GSA_AUCTIONS_MANIFEST } from './manifest';

export const GSA_API_BASE_URL = 'https://api.gsa.gov';

/** The fields of an active GSA lot this connector relies on; anything else is ignored. */
export const gsaRawLotSchema = z
  .object({
    saleNo: z.string().min(1),
    lotNo: z.string().min(1),
    itemName: z.string().min(1),
    aucEndDt: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
    auctionStatus: z.string().nullable().optional(),
    highBidAmount: z.number().nonnegative().nullable().optional(),
    biddersCount: z.number().int().nonnegative().nullable().optional(),
    aucIncrement: z.number().nonnegative().nullable().optional(),
    reserve: z.boolean().nullable().optional(),
    propertyCity: z.string().nullable().optional(),
    propertyState: z.string().nullable().optional(),
    agencyName: z.string().nullable().optional(),
    lotInfo: z.string().nullable().optional(),
    instruction: z.string().nullable().optional(),
    itemDescURL: z.string().url().nullable().optional(),
    imageURL: z.string().url().nullable().optional(),
  })
  .passthrough();
export type GsaRawLot = z.infer<typeof gsaRawLotSchema>;

const responseSchema = z.object({ Results: z.array(z.unknown()) });

export interface AuctionLotInput {
  externalId: string;
  title: string;
  url: string;
  imageUrl: string | null;
  closesOn: string;
  status: 'active' | 'closed';
  currentBidMinor: number | null;
  bidders: number | null;
  incrementMinor: number | null;
  reserve: boolean | null;
  location: string | null;
  agency: string | null;
  currency: 'USD';
  termsText: string;
}

// The vertical is electronics: lots outside it (vehicles, boats, machinery, furniture) are
// dropped here, in the connector, before anything is stored.
const ELECTRONICS =
  /\b(laptops?|notebooks?|computers?|desktops?|cpus?|tablets?|ipads?|iphones?|smart ?phones?|cell ?phones?|phones?|monitors?|servers?|printers?|macbooks?|chromebooks?|workstations?|electronics?|networking|switch(?:es)?|routers?|cameras?|projectors?)\b/i;
const NOT_ELECTRONICS =
  /\b(vehicle|truck|car|boat|trailer|motor|tractor|forklift|furniture|desk|chair|stand|cabinets?|alcomonitor|vital signs?|respiratory|medical|patient|infusion|ecg|ekg|defibrillators?|ultrasound|surgical|pyxis|toners?|cartridges?|ink|sleeves?|carrels?)\b/i;

export const isElectronicsLot = (lot: Pick<GsaRawLot, 'itemName'>) =>
  ELECTRONICS.test(lot.itemName) && !NOT_ELECTRONICS.test(lot.itemName);

const minor = (value: number | null | undefined) =>
  value === null || value === undefined ? null : Math.round(value * 100);

export const mapGsaLot = (raw: GsaRawLot): AuctionLotInput => ({
  externalId: `${raw.saleNo}:${raw.lotNo}`,
  title: raw.itemName.trim().slice(0, 300),
  url:
    raw.itemDescURL ??
    `https://www.gsaauctions.gov/auctions/preview?sale=${encodeURIComponent(raw.saleNo)}&lot=${encodeURIComponent(raw.lotNo)}`,
  imageUrl: raw.imageURL ?? null,
  closesOn: raw.aucEndDt.slice(0, 10),
  status: raw.auctionStatus && raw.auctionStatus !== 'Active' ? 'closed' : 'active',
  currentBidMinor: minor(raw.highBidAmount),
  bidders: raw.biddersCount ?? null,
  incrementMinor: minor(raw.aucIncrement),
  reserve: raw.reserve ?? null,
  location:
    [raw.propertyCity?.trim(), raw.propertyState?.trim()].filter(Boolean).join(', ') || null,
  agency: raw.agencyName?.trim() || null,
  currency: 'USD',
  termsText: auctionTermsText(`${raw.lotInfo ?? ''}\n${raw.instruction ?? ''}`),
});

export type GsaMode = 'disabled' | 'fixture' | 'live';

/**
 * Layer-1 client for the GSA Auctions API. One request returns every active lot; live mode needs
 * an api.data.gov key (fails closed without one); fixture mode only accepts a loopback base URL.
 */
export class GsaAuctionsClient {
  readonly manifest = GSA_AUCTIONS_MANIFEST;

  constructor(
    private readonly mode: GsaMode,
    private readonly options: { apiKey?: string; baseUrl?: string; fetcher?: typeof fetch } = {},
  ) {}

  /**
   * `activeIds` lists every active lot at the source (not only electronics): a lot is closed when
   * it leaves this list, never because the vertical filter dropped it.
   */
  async activeLots(): Promise<{
    seen: number;
    lots: AuctionLotInput[];
    activeIds: string[];
    invalid: number;
  }> {
    if (this.mode === 'disabled')
      throw new ConnectorError('GSA connector is disabled.', 'permanent', 'SOURCE_DISABLED');
    const baseUrl = this.options.baseUrl ?? GSA_API_BASE_URL;
    if (this.mode === 'live' && !this.options.apiKey)
      throw new ConnectorError(
        'GSA_API_KEY is not configured.',
        'permanent',
        'GSA_CONFIGURATION_MISSING',
      );
    if (this.mode === 'fixture' && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(baseUrl))
      throw new ConnectorError(
        'Fixture mode needs a loopback base URL.',
        'permanent',
        'SOURCE_FIXTURE_URL_INVALID',
      );
    const url = `${baseUrl}/assets/gsaauctions/v2/auctions?format=JSON&api_key=${encodeURIComponent(this.options.apiKey ?? 'fixture')}`;
    const response = await (this.options.fetcher ?? fetch)(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'ScoutBot/0.1 (+lab)' },
      redirect: 'follow',
    });
    if (response.status === 429)
      throw new ConnectorError('GSA API rate limit reached.', 'transient', 'RATE_LIMITED');
    if (response.status === 401 || response.status === 403)
      throw new ConnectorError('GSA API refused the key.', 'permanent', 'GSA_UNAUTHORIZED');
    if (!response.ok)
      throw new ConnectorError(
        `GSA API answered ${response.status}.`,
        'transient',
        'SOURCE_HTTP_ERROR',
      );
    const body = responseSchema.safeParse(await response.json().catch(() => null));
    if (!body.success)
      throw new ConnectorError('GSA API payload changed.', 'permanent', 'CONTENT_CHANGED');
    let invalid = 0;
    const lots: AuctionLotInput[] = [];
    const activeIds: string[] = [];
    for (const item of body.data.Results) {
      const parsed = gsaRawLotSchema.safeParse(item);
      if (!parsed.success) {
        invalid += 1;
        continue;
      }
      activeIds.push(`${parsed.data.saleNo}:${parsed.data.lotNo}`);
      if (isElectronicsLot(parsed.data)) lots.push(mapGsaLot(parsed.data));
    }
    return { seen: body.data.Results.length, lots, activeIds, invalid };
  }
}
