import { Seller, SellerRepository } from '@scout/domain';

export class InMemorySellerRepository implements SellerRepository {
  private sellers: Map<string, Seller> = new Map();

  constructor(initialSellers: Seller[] = []) {
    for (const seller of initialSellers) {
      this.sellers.set(seller.id, { ...seller });
    }
  }

  async findById(id: string): Promise<Seller | null> {
    const item = this.sellers.get(id);
    return item ? { ...item } : null;
  }

  async findBySourceAndExternalId(sourceId: string, externalId: string): Promise<Seller | null> {
    const item = Array.from(this.sellers.values()).find(
      (s) => s.sourceId === sourceId && s.externalId === externalId
    );
    return item ? { ...item } : null;
  }

  async upsertSeller(seller: Omit<Seller, 'id' | 'firstSeenAt'> & { id?: string }): Promise<Seller> {
    const existing = await this.findBySourceAndExternalId(seller.sourceId, seller.externalId);
    const now = new Date();

    if (existing) {
      const updated: Seller = {
        ...existing,
        ...seller,
        id: existing.id,
        firstSeenAt: existing.firstSeenAt,
      };
      this.sellers.set(existing.id, updated);
      return { ...updated };
    }

    const newId = seller.id || crypto.randomUUID();
    const created: Seller = {
      ...seller,
      id: newId,
      firstSeenAt: now,
    };
    this.sellers.set(newId, created);
    return { ...created };
  }
}
