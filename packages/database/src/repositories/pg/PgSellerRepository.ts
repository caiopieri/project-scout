import { Seller, SellerRepository } from '@scout/domain';
import { SqlExecutor } from '../../sql/SqlExecutor';

export class PgSellerRepository implements SellerRepository {
  constructor(private sql: SqlExecutor) {}

  async findById(id: string): Promise<Seller | null> {
    const res = await this.sql.query<Seller>(
      `SELECT id, source_id as "sourceId", external_id as "externalId", name, rating,
              positive_feedback_percentage as "positiveFeedbackPercentage", review_count as "reviewCount",
              location, account_type as "accountType", first_seen_at as "firstSeenAt"
       FROM sellers WHERE id = $1`,
      [id],
    );
    return res.rows.length > 0 ? res.rows[0] : null;
  }

  async findBySourceAndExternalId(sourceId: string, externalId: string): Promise<Seller | null> {
    const res = await this.sql.query<Seller>(
      `SELECT id, source_id as "sourceId", external_id as "externalId", name, rating,
              positive_feedback_percentage as "positiveFeedbackPercentage", review_count as "reviewCount",
              location, account_type as "accountType", first_seen_at as "firstSeenAt"
       FROM sellers WHERE source_id = $1 AND external_id = $2`,
      [sourceId, externalId],
    );
    return res.rows.length > 0 ? res.rows[0] : null;
  }

  async upsertSeller(
    seller: Omit<Seller, 'id' | 'firstSeenAt'> & { id?: string },
  ): Promise<Seller> {
    const res = await this.sql.query<Seller>(
      `INSERT INTO sellers (source_id, external_id, name, rating, positive_feedback_percentage, review_count, location, account_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (source_id, external_id) DO UPDATE
       SET name = EXCLUDED.name,
           rating = EXCLUDED.rating,
           positive_feedback_percentage = EXCLUDED.positive_feedback_percentage,
           review_count = EXCLUDED.review_count
       RETURNING id, source_id as "sourceId", external_id as "externalId", name, rating,
                 positive_feedback_percentage as "positiveFeedbackPercentage", review_count as "reviewCount",
                 location, account_type as "accountType", first_seen_at as "firstSeenAt"`,
      [
        seller.sourceId,
        seller.externalId,
        seller.name,
        seller.rating || null,
        seller.positiveFeedbackPercentage || null,
        seller.reviewCount || 0,
        seller.location || null,
        seller.accountType || 'unknown',
      ],
    );
    return res.rows[0];
  }
}
