import { Listing, ListingRepository, ListingSnapshot, PriceHistory } from '@scout/domain';

export class InMemoryListingRepository implements ListingRepository {
  private listings: Map<string, Listing> = new Map();
  private snapshots: ListingSnapshot[] = [];
  private priceHistories: PriceHistory[] = [];

  constructor(initialListings: Listing[] = []) {
    for (const listing of initialListings) {
      this.listings.set(listing.id, { ...listing });
    }
  }

  async findById(id: string): Promise<Listing | null> {
    const item = this.listings.get(id);
    return item ? { ...item } : null;
  }

  async findBySourceAndExternalId(sourceId: string, externalId: string): Promise<Listing | null> {
    const item = Array.from(this.listings.values()).find(
      (l) => l.sourceId === sourceId && l.externalId === externalId
    );
    return item ? { ...item } : null;
  }

  async upsertListing(
    listing: Omit<Listing, 'id' | 'firstCollectedAt' | 'lastUpdatedAt'> & { id?: string }
  ): Promise<Listing> {
    const existing = await this.findBySourceAndExternalId(listing.sourceId, listing.externalId);
    const now = new Date();

    if (existing) {
      const updated: Listing = {
        ...existing,
        ...listing,
        id: existing.id,
        firstCollectedAt: existing.firstCollectedAt,
        lastUpdatedAt: now,
      };
      this.listings.set(existing.id, updated);
      return { ...updated };
    }

    const newId = listing.id || crypto.randomUUID();
    const created: Listing = {
      ...listing,
      id: newId,
      firstCollectedAt: now,
      lastUpdatedAt: now,
    };
    this.listings.set(newId, created);
    return { ...created };
  }

  async addSnapshot(snapshot: Omit<ListingSnapshot, 'id' | 'collectedAt'>): Promise<ListingSnapshot> {
    const created: ListingSnapshot = {
      ...snapshot,
      id: crypto.randomUUID(),
      collectedAt: new Date(),
    };
    this.snapshots.push(created);
    return { ...created };
  }

  async addPriceHistory(history: Omit<PriceHistory, 'id' | 'collectedAt'>): Promise<PriceHistory> {
    const created: PriceHistory = {
      ...history,
      id: crypto.randomUUID(),
      collectedAt: new Date(),
    };
    this.priceHistories.push(created);
    return { ...created };
  }

  async getPriceHistory(listingId: string): Promise<PriceHistory[]> {
    return this.priceHistories
      .filter((ph) => ph.listingId === listingId)
      .map((ph) => ({ ...ph }));
  }
}
