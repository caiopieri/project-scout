import type { AlertKind, ListingTransport, MonitorCutoff } from '@scout/schemas';

export interface MonitorAlertCandidate {
  /** Exactly one target: a listing (search and listing monitors) or an auction lot. */
  listingId?: string;
  lotId?: string;
  kind: AlertKind;
  /** Stable per event, so the same event never alerts twice. */
  dedupeKey: string;
  payload: Record<string, string | number | null>;
}

const percentBelowReference = (listing: ListingTransport) =>
  listing.referenceDiscount?.status === 'known'
    ? listing.referenceDiscount.discountBasisPoints / 100
    : null;

const totalCostMinor = (listing: ListingTransport) =>
  listing.landedCost?.status === 'known' ? listing.landedCost.totalMinor : null;

/**
 * True when the listing satisfies every cutoff the monitor sets. An unknown leg (incomplete
 * score, no reference, indeterminate cost) fails the cutoff that needs it — never a guess.
 */
export const passesSearchCutoff = (listing: ListingTransport, cutoff: MonitorCutoff) => {
  if (listing.status !== 'active' || listing.userAction?.label === 'discarded') return false;
  if (cutoff.minScore !== undefined) {
    const value = listing.score?.status === 'known' ? listing.score.value : null;
    if (value === null || value < cutoff.minScore) return false;
  }
  if (cutoff.minPercentBelowReference !== undefined) {
    const percent = percentBelowReference(listing);
    if (percent === null || percent < cutoff.minPercentBelowReference) return false;
  }
  if (cutoff.maxTotalCostMinor !== undefined) {
    const total = totalCostMinor(listing);
    if (total === null || total > cutoff.maxTotalCostMinor) return false;
  }
  return true;
};

/** New opportunities: listings above the cutoff that this monitor has not alerted on yet. */
export const evaluateSearchMonitor = (
  listings: ListingTransport[],
  cutoff: MonitorCutoff,
  alreadyAlerted: ReadonlySet<string>,
): MonitorAlertCandidate[] =>
  listings
    .filter((listing) => !alreadyAlerted.has(listing.id) && passesSearchCutoff(listing, cutoff))
    .map((listing) => ({
      listingId: listing.id,
      kind: 'NEW_OPPORTUNITY' as const,
      dedupeKey: `opportunity:${listing.id}`,
      payload: {
        title: listing.title.slice(0, 200),
        score: listing.score?.status === 'known' ? listing.score.value : null,
        percentBelowReference: percentBelowReference(listing),
        totalCostMinor: totalCostMinor(listing),
        currency: listing.currency,
      },
    }));

export interface ListingState {
  priceMinor: number;
  status: string;
}

/** Listing prices are stored as decimals in major units; monitors compare integer minor units. */
export const listingPriceMinor = (listing: Pick<ListingTransport, 'price'>) =>
  Math.round(listing.price * 100);

/**
 * Price drop (beyond the optional minimum percentage), ended or gone, measured against the state
 * the monitor last saw. Returns the events and the state to remember next time.
 */
export const evaluateListingMonitor = (
  listingId: string,
  baseline: ListingState,
  current: ListingState,
  cutoff: MonitorCutoff,
): { alerts: MonitorAlertCandidate[]; nextBaseline: ListingState } => {
  const alerts: MonitorAlertCandidate[] = [];
  const dropPercent =
    baseline.priceMinor > 0
      ? ((baseline.priceMinor - current.priceMinor) / baseline.priceMinor) * 100
      : 0;
  if (current.priceMinor < baseline.priceMinor && dropPercent >= (cutoff.minPriceDropPercent ?? 0))
    alerts.push({
      listingId,
      kind: 'PRICE_DROP',
      dedupeKey: `drop:${listingId}:${current.priceMinor}`,
      payload: {
        fromMinor: baseline.priceMinor,
        toMinor: current.priceMinor,
        dropPercent: Math.round(dropPercent * 10) / 10,
      },
    });
  if (current.status !== baseline.status && current.status !== 'active')
    alerts.push({
      listingId,
      kind: current.status === 'completed' ? 'ENDED' : 'GONE',
      dedupeKey: `status:${listingId}:${current.status}`,
      payload: { from: baseline.status, to: current.status },
    });
  // A drop smaller than the minimum keeps the old baseline, so small steps still add up.
  const keepPrice =
    current.priceMinor < baseline.priceMinor &&
    !alerts.some((alert) => alert.kind === 'PRICE_DROP');
  return {
    alerts,
    nextBaseline: {
      priceMinor: keepPrice ? baseline.priceMinor : current.priceMinor,
      status: current.status,
    },
  };
};

export interface LotState {
  id: string;
  status: 'active' | 'closed';
  currentBidMinor: number | null;
  closesOn: string;
}

/**
 * Lot events: the high bid passed the user's limit, the lot closes today, the lot closed. Each
 * fires once per lot (per closing date for "closes today").
 */
export const evaluateLotMonitor = (
  lot: LotState,
  cutoff: MonitorCutoff,
  today: string,
): MonitorAlertCandidate[] => {
  const alerts: MonitorAlertCandidate[] = [];
  if (
    cutoff.maxBidMinor !== undefined &&
    lot.currentBidMinor !== null &&
    lot.currentBidMinor > cutoff.maxBidMinor
  )
    alerts.push({
      lotId: lot.id,
      kind: 'LOT_BID_ABOVE',
      dedupeKey: `bid-above:${lot.id}`,
      payload: { highBidMinor: lot.currentBidMinor, limitMinor: cutoff.maxBidMinor },
    });
  if (lot.status === 'active' && lot.closesOn === today)
    alerts.push({
      lotId: lot.id,
      kind: 'LOT_CLOSING',
      dedupeKey: `closing:${lot.id}:${lot.closesOn}`,
      payload: { closesOn: lot.closesOn, highBidMinor: lot.currentBidMinor },
    });
  if (lot.status === 'closed')
    alerts.push({
      lotId: lot.id,
      kind: 'LOT_CLOSED',
      dedupeKey: `closed:${lot.id}`,
      payload: { lastHighBidMinor: lot.currentBidMinor },
    });
  return alerts;
};

/**
 * When to look at a lot again: rarely while the close is days away, more often as it nears, and
 * never after it closed. The source's request budget still caps the real sweep frequency.
 */
export const nextLotCheckAt = (closesOn: string, status: LotState['status'], now: Date) => {
  if (status === 'closed') return null;
  const days = (Date.parse(`${closesOn}T23:59:59Z`) - now.getTime()) / 86_400_000;
  const minutes = days > 3 ? 360 : days > 1 ? 60 : 30;
  return new Date(now.getTime() + minutes * 60_000);
};
