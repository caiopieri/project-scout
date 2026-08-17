import type {
  NegotiationContext,
  NegotiationDraft,
  NegotiationDraftRepository,
  NegotiationSuggestion,
} from '@scout/domain';
import {
  negotiationContextSchema,
  negotiationDraftSchema,
  negotiationSuggestionSchema,
  uuidSchema,
} from '@scout/schemas';
import { SqlExecutor } from '../../sql/SqlExecutor';

interface NegotiationDraftRow {
  id: string;
  user_id: string;
  context_snapshot: unknown;
  suggestion_snapshot: unknown;
  created_at: string;
}

const columns = 'id, user_id, context_snapshot, suggestion_snapshot, created_at';

const mapRow = (row: NegotiationDraftRow): NegotiationDraft =>
  negotiationDraftSchema.parse({
    id: row.id,
    userId: row.user_id,
    context: row.context_snapshot,
    suggestion: row.suggestion_snapshot,
    createdAt: new Date(row.created_at),
  });

export class PgNegotiationDraftRepository implements NegotiationDraftRepository {
  constructor(private readonly sql: SqlExecutor) {}

  async save(
    userId: string,
    context: NegotiationContext,
    suggestion: NegotiationSuggestion,
  ): Promise<NegotiationDraft> {
    const validatedUserId = uuidSchema.parse(userId);
    const validatedContext = negotiationContextSchema.parse(context);
    const validatedSuggestion = negotiationSuggestionSchema.parse(suggestion);
    const draftIdentity = negotiationDraftSchema.parse({
      id: crypto.randomUUID(),
      userId: validatedUserId,
      context: validatedContext,
      suggestion: validatedSuggestion,
      createdAt: new Date(),
    });
    const result = await this.sql.query<NegotiationDraftRow>(
      `INSERT INTO negotiation_drafts (
         id, user_id, context_id, source, external_id, currency,
         asking_price_minor, market_value_minor, target_price_minor,
         user_max_price_minor, suggested_offer_minor, context_snapshot,
         suggestion_snapshot, requires_human_review, sent, executable
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14, $15, $16)
       RETURNING ${columns}`,
      [
        draftIdentity.id,
        draftIdentity.userId,
        validatedContext.contextId,
        validatedContext.source,
        validatedContext.externalId,
        validatedContext.currency,
        validatedContext.askingPriceMinor,
        validatedContext.marketValueMinor,
        validatedContext.targetPriceMinor,
        validatedContext.userMaxPriceMinor,
        validatedSuggestion.suggestedOfferMinor,
        JSON.stringify(validatedContext),
        JSON.stringify(validatedSuggestion),
        validatedSuggestion.requiresHumanReview,
        validatedSuggestion.sent,
        validatedSuggestion.executable,
      ],
    );
    if (!result.rows[0]) throw new Error('Negotiation draft insert returned no result.');
    return mapRow(result.rows[0]);
  }

  async findByUserId(userId: string): Promise<NegotiationDraft[]> {
    const validatedUserId = uuidSchema.parse(userId);
    const result = await this.sql.query<NegotiationDraftRow>(
      `SELECT ${columns}
       FROM negotiation_drafts
       WHERE user_id = $1
       ORDER BY created_at DESC, id DESC`,
      [validatedUserId],
    );
    return result.rows.map(mapRow);
  }
}
