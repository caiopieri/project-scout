import type {
  ListingFeedGroup,
  ListingFeedQuery,
  ListingFeedSort,
  ListingTransport,
} from '@scout/schemas';

export interface ListingFeedSlice {
  items: ListingTransport[];
  nextOffset: number | null;
  totals: { rankable: number; unbacked: number };
  newSinceSnapshot: number;
  filteredOut: number;
}

export type ListingLens = Pick<
  ListingFeedQuery,
  'favorite' | 'label' | 'hideDiscarded' | 'condition' | 'minScore' | 'maxTotalCostMinor'
>;

/** A lens narrows the view only; an unknown score or cost never passes a numeric lens. */
const passesLens = (listing: ListingTransport, lens: ListingLens) => {
  const action = listing.userAction;
  if (lens.favorite === 'true' && !action?.favorite) return false;
  if (lens.label === 'none' && action?.label) return false;
  if (lens.label && lens.label !== 'none' && action?.label !== lens.label) return false;
  if (lens.hideDiscarded !== 'false' && lens.label !== 'discarded' && action?.label === 'discarded')
    return false;
  if (lens.condition && listing.condition.toLowerCase() !== lens.condition.toLowerCase())
    return false;
  if (lens.minScore !== undefined) {
    if (listing.score?.status !== 'known' || (listing.score.value ?? 0) < lens.minScore)
      return false;
  }
  if (lens.maxTotalCostMinor !== undefined) {
    const total = listing.landedCost?.status === 'known' ? listing.landedCost.totalMinor : null;
    if (total === null || total === undefined || total > lens.maxTotalCostMinor) return false;
  }
  return true;
};

const byId = (left: ListingTransport, right: ListingTransport) => left.id.localeCompare(right.id);
const newestFirst = (left: ListingTransport, right: ListingTransport) =>
  right.firstCollectedAt.getTime() - left.firstCollectedAt.getTime() || byId(left, right);

const rankableComparators: Record<
  ListingFeedSort,
  (a: ListingTransport, b: ListingTransport) => number
> = {
  discount: (left, right) => {
    const leftBp =
      left.referenceDiscount?.status === 'known' ? left.referenceDiscount.discountBasisPoints : 0;
    const rightBp =
      right.referenceDiscount?.status === 'known' ? right.referenceDiscount.discountBasisPoints : 0;
    return rightBp - leftBp || byId(left, right);
  },
  totalCost: (left, right) =>
    (left.landedCost?.totalMinor ?? 0) - (right.landedCost?.totalMinor ?? 0) || byId(left, right),
  price: (left, right) =>
    (left.landedCost?.components.itemPrice.amountMinor ?? 0) -
      (right.landedCost?.components.itemPrice.amountMinor ?? 0) || byId(left, right),
  newest: newestFirst,
  // Complete scores first by value; INCOMPLETO scores are not ranked against them and keep the
  // reference-distance order after them (the UI labels the boundary).
  score: (left, right) => {
    const leftValue = left.score?.status === 'known' ? left.score.value : null;
    const rightValue = right.score?.status === 'known' ? right.score.value : null;
    if (leftValue !== null && rightValue !== null)
      return rightValue - leftValue || byId(left, right);
    if (leftValue !== null) return -1;
    if (rightValue !== null) return 1;
    return rankableComparators.discount(left, right);
  },
};

/**
 * Pages a project's listings over a fixed snapshot. Items collected after the snapshot are
 * counted in `newSinceSnapshot` and never injected into the pages being browsed. Unbacked
 * items are always ordered by recency, regardless of the requested sort.
 */
export const sliceListingFeed = (
  listings: ListingTransport[],
  options: {
    group: ListingFeedGroup;
    sort: ListingFeedSort;
    snapshot: Date;
    offset: number;
    limit: number;
    lens?: ListingLens;
  },
): ListingFeedSlice => {
  const inSnapshot = listings.filter(
    (listing) => listing.firstCollectedAt.getTime() <= options.snapshot.getTime(),
  );
  const visible = inSnapshot.filter((listing) =>
    passesLens(listing, options.lens ?? { hideDiscarded: 'true' }),
  );
  const rankable = visible.filter((listing) => listing.referenceDiscount?.status === 'known');
  const unbacked = visible.filter((listing) => listing.referenceDiscount?.status !== 'known');
  const group =
    options.group === 'rankable'
      ? [...rankable].sort(rankableComparators[options.sort])
      : [...unbacked].sort(newestFirst);
  const end = options.offset + options.limit;
  return {
    items: group.slice(options.offset, end),
    nextOffset: end < group.length ? end : null,
    totals: { rankable: rankable.length, unbacked: unbacked.length },
    newSinceSnapshot: listings.length - inSnapshot.length,
    filteredOut: inSnapshot.length - visible.length,
  };
};
