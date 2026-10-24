import {
  supplierInputSchema,
  type PriceTier,
  type SupplierInput,
  type SupplierLevel,
} from '@scout/schemas';

export const SUPPLY_LEVELS: SupplierLevel[] = [
  'factory',
  'trading',
  'distributor',
  'reseller',
  'liquidator',
];

/** Unit price at a quantity: the tier with the highest minimum not above it; null below all. */
export const unitPriceAt = (tiers: PriceTier[], quantity: number) => {
  const eligible = tiers
    .filter((tier) => tier.minQuantity <= quantity)
    .sort((left, right) => right.minQuantity - left.minQuantity);
  return eligible[0]?.unitPriceMinor ?? null;
};

export interface LadderOffer {
  supplierId: string;
  supplierName: string;
  level: SupplierLevel;
  country: string | null;
  website: string | null;
  contacts: Array<{
    kind: string;
    value: string;
    status: 'verified' | 'format_only' | 'unverified';
  }>;
  title: string;
  currency: string;
  tiers: PriceTier[];
  moq: { value: number | null; origin: 'stated' | 'assumed' | 'unknown'; basis: string };
  leadTimeDays: number | null;
  incoterm: string | null;
  sourceUrl: string | null;
}

export interface LadderEntry extends LadderOffer {
  /** true = buyable at this volume; false = out of reach; null = MOQ unknown, cannot tell. */
  accessible: boolean | null;
  reason: string;
  unitPriceAtVolumeMinor: number | null;
  totalAtVolumeMinor: number | null;
  priceRange: { minMinor: number; maxMinor: number };
}

/**
 * The same product down the chain — factory → trading → distributor → reseller → liquidator —
 * for the user's volume. Each offer says whether it is reachable (MOQ against volume), the unit
 * price at that volume from its tiers, and why when it is not. Unknown MOQ is never "reachable".
 */
export const buildSupplyLadder = (offers: LadderOffer[], volume: number) =>
  SUPPLY_LEVELS.map((level) => {
    const entries: LadderEntry[] = offers
      .filter((offer) => offer.level === level)
      .map((offer) => {
        const prices = offer.tiers.map((tier) => tier.unitPriceMinor);
        const priceRange = { minMinor: Math.min(...prices), maxMinor: Math.max(...prices) };
        const moq = offer.moq.value;
        const accessible = moq === null ? null : moq <= volume;
        const unit = accessible ? unitPriceAt(offer.tiers, volume) : null;
        return {
          ...offer,
          accessible,
          reason:
            accessible === null
              ? 'minimum order not known'
              : accessible
                ? `MOQ ${moq} ≤ volume ${volume}${offer.moq.origin === 'assumed' ? ' (assumed)' : ''}`
                : `MOQ ${moq} > volume ${volume}`,
          unitPriceAtVolumeMinor: unit,
          totalAtVolumeMinor: unit === null ? null : unit * volume,
          priceRange,
        };
      })
      .sort((left, right) => {
        const rank = (entry: LadderEntry) =>
          entry.accessible === true ? 0 : entry.accessible === null ? 1 : 2;
        // Prices in different currencies are never ranked against each other.
        return (
          rank(left) - rank(right) ||
          left.currency.localeCompare(right.currency) ||
          (left.unitPriceAtVolumeMinor ?? left.priceRange.minMinor) -
            (right.unitPriceAtVolumeMinor ?? right.priceRange.minMinor)
        );
      });
    return { level, entries };
  }).filter((group) => group.entries.length > 0);

const EMAIL = /^[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)$/;

/** Format and domain checks for a contact; the mail-exchange lookup is done by the caller. */
export const checkContact = (kind: 'email' | 'phone' | 'url', value: string, website?: string) => {
  const site = website ? new URL(website).hostname.replace(/^www\./, '').toLowerCase() : null;
  if (kind === 'email') {
    const domain = EMAIL.exec(value)?.[1]?.toLowerCase() ?? null;
    return {
      format: domain !== null,
      domain,
      domainMatchesWebsite:
        domain && site
          ? domain === site || domain.endsWith(`.${site}`) || site.endsWith(`.${domain}`)
          : null,
    };
  }
  if (kind === 'phone') {
    const digits = value.replace(/[^\d+]/g, '');
    return { format: /^\+?\d{7,15}$/.test(digits), domain: null, domainMatchesWebsite: null };
  }
  try {
    const host = new URL(value).hostname.replace(/^www\./, '').toLowerCase();
    return {
      format: true,
      domain: host,
      domainMatchesWebsite: site ? host === site || host.endsWith(`.${site}`) : null,
    };
  } catch {
    return { format: false, domain: null, domainMatchesWebsite: null };
  }
};

const CSV_COLUMNS = [
  'supplier_name',
  'website',
  'level',
  'country',
  'email',
  'phone',
  'product_key',
  'title',
  'currency',
  'moq',
  'lead_time_days',
  'incoterm',
  'ship_from',
] as const;

const splitCsvLine = (line: string) => {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted && char === '"' && line[index + 1] === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) {
      cells.push(current.trim());
      current = '';
    } else current += char;
  }
  cells.push(current.trim());
  return cells;
};

/**
 * Parses quotes the user received (one row per supplier and product): fixed columns plus any
 * number of `tierN_qty`/`tierN_price` pairs (prices in major units). Rows that do not validate are
 * returned with their error instead of being guessed.
 */
export const parseSupplierQuotesCsv = (csv: string) => {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const header = splitCsvLine(lines[0] ?? '').map((cell) => cell.toLowerCase());
  const missing = CSV_COLUMNS.filter(
    (column) =>
      !['website', 'country', 'email', 'phone', 'lead_time_days', 'incoterm', 'ship_from'].includes(
        column,
      ) && !header.includes(column),
  );
  if (missing.length)
    return { suppliers: [], errors: [{ row: 1, error: `missing columns: ${missing.join(', ')}` }] };
  const suppliers: SupplierInput[] = [];
  const errors: Array<{ row: number; error: string }> = [];
  lines.slice(1).forEach((line, index) => {
    const cells = splitCsvLine(line);
    const value = (column: string) => {
      const position = header.indexOf(column);
      return position >= 0 && cells[position] ? cells[position] : undefined;
    };
    const tiers = header
      .map((column) => /^tier(\d+)_qty$/.exec(column)?.[1])
      .filter((tier): tier is string => Boolean(tier))
      .map((tier) => ({ qty: value(`tier${tier}_qty`), price: value(`tier${tier}_price`) }))
      .filter((tier) => tier.qty && tier.price)
      .map((tier) => ({
        minQuantity: Number(tier.qty),
        unitPriceMinor: Math.round(Number(tier.price) * 100),
      }));
    const moq = value('moq');
    const parsed = supplierInputSchema.safeParse({
      name: value('supplier_name'),
      website: value('website'),
      level: value('level'),
      country: value('country')?.toUpperCase(),
      contacts: [
        ...(value('email') ? [{ kind: 'email', value: value('email') }] : []),
        ...(value('phone') ? [{ kind: 'phone', value: value('phone') }] : []),
      ],
      offers: [
        {
          productKey: value('product_key'),
          title: value('title'),
          ...(value('sku') ? { sku: value('sku') } : {}),
          currency: value('currency')?.toUpperCase(),
          tiers,
          moq: moq
            ? { value: Number(moq), origin: 'stated', basis: 'quoted minimum order' }
            : { value: null, origin: 'unknown', basis: 'no minimum in the quote' },
          ...(value('lead_time_days') ? { leadTimeDays: Number(value('lead_time_days')) } : {}),
          ...(value('incoterm') ? { incoterm: value('incoterm')?.toUpperCase() } : {}),
          ...(value('ship_from') ? { shipFrom: value('ship_from')?.toUpperCase() } : {}),
        },
      ],
      origin: 'imported',
    });
    if (parsed.success) suppliers.push(parsed.data);
    else
      errors.push({
        row: index + 2,
        error: parsed.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; '),
      });
  });
  return { suppliers, errors };
};
