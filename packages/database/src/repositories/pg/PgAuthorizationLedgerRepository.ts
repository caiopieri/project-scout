import type {
  AuthorizationEnvelope,
  AuthorizationLedgerRecord,
  AuthorizationLedgerRepository,
} from '@scout/domain';
import {
  authorizationEnvelopeSchema,
  authorizationIdempotencyKeySchema,
  authorizationLedgerRecordSchema,
  uuidSchema,
} from '@scout/schemas';
import { SqlExecutor } from '../../sql/SqlExecutor';

interface AuthorizationLedgerRow {
  id: string;
  user_id: string;
  authorization_id: string;
  idempotency_key: string;
  status: string;
  envelope_snapshot: unknown;
  issued_at: string;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
}

const columns = `id, user_id, authorization_id, idempotency_key, status,
  envelope_snapshot, issued_at, expires_at, consumed_at, created_at`;

const mapRow = (row: AuthorizationLedgerRow): AuthorizationLedgerRecord =>
  authorizationLedgerRecordSchema.parse({
    id: row.id,
    userId: row.user_id,
    envelope: row.envelope_snapshot,
    status: row.status,
    createdAt: new Date(row.created_at),
    consumedAt: row.consumed_at ? new Date(row.consumed_at) : undefined,
  });

const fingerprint = (envelope: AuthorizationEnvelope): string =>
  JSON.stringify([
    envelope.authorizationVersion,
    envelope.authorizationId,
    envelope.userId,
    envelope.category,
    envelope.source,
    envelope.externalId,
    envelope.action,
    envelope.currency,
    envelope.quantity,
    envelope.unitPriceMinor,
    envelope.totalCostMinor,
    envelope.maxTotalCostMinor,
    envelope.issuedAt,
    envelope.expiresAt,
    envelope.idempotencyKey,
    envelope.status,
    envelope.humanApproved,
    envelope.executable,
  ]);

export class PgAuthorizationLedgerRepository implements AuthorizationLedgerRepository {
  constructor(private readonly sql: SqlExecutor) {}

  async record(
    userId: string,
    envelope: AuthorizationEnvelope,
  ): Promise<AuthorizationLedgerRecord> {
    const validatedUserId = uuidSchema.parse(userId);
    const validatedEnvelope = authorizationEnvelopeSchema.parse(envelope);
    if (validatedUserId !== validatedEnvelope.userId) {
      throw new Error('Authorization ledger owner mismatch.');
    }
    const result = await this.sql.query<AuthorizationLedgerRow>(
      `INSERT INTO authorization_envelope_ledger (
         user_id, authorization_id, idempotency_key, status, envelope_snapshot,
         issued_at, expires_at
       ) VALUES ($1, $2, $3, 'PENDING', $4::jsonb, $5, $6)
       ON CONFLICT DO NOTHING
       RETURNING ${columns}`,
      [
        validatedUserId,
        validatedEnvelope.authorizationId,
        validatedEnvelope.idempotencyKey,
        JSON.stringify(validatedEnvelope),
        validatedEnvelope.issuedAt,
        validatedEnvelope.expiresAt,
      ],
    );
    if (result.rows[0]) return mapRow(result.rows[0]);
    const existing = await this.sql.query<AuthorizationLedgerRow>(
      `SELECT ${columns}
       FROM authorization_envelope_ledger
       WHERE user_id = $1 AND (idempotency_key = $2 OR authorization_id = $3)
       ORDER BY created_at DESC
       LIMIT 1`,
      [validatedUserId, validatedEnvelope.idempotencyKey, validatedEnvelope.authorizationId],
    );
    if (!existing.rows[0]) throw new Error('Authorization ledger insert returned no result.');
    const mapped = mapRow(existing.rows[0]);
    if (fingerprint(mapped.envelope) !== fingerprint(validatedEnvelope)) {
      throw new Error('Authorization idempotency key already belongs to another envelope.');
    }
    return mapped;
  }

  async findByUserId(userId: string): Promise<AuthorizationLedgerRecord[]> {
    const validatedUserId = uuidSchema.parse(userId);
    const result = await this.sql.query<AuthorizationLedgerRow>(
      `SELECT ${columns}
       FROM authorization_envelope_ledger
       WHERE user_id = $1
       ORDER BY created_at DESC, id DESC`,
      [validatedUserId],
    );
    return result.rows.map(mapRow);
  }

  async markConsumed(
    userId: string,
    idempotencyKey: string,
  ): Promise<AuthorizationLedgerRecord | null> {
    const validatedUserId = uuidSchema.parse(userId);
    const validatedKey = authorizationIdempotencyKeySchema.parse(idempotencyKey);
    const result = await this.sql.query<AuthorizationLedgerRow>(
      `UPDATE authorization_envelope_ledger
       SET status = 'CONSUMED', consumed_at = NOW()
       WHERE user_id = $1 AND idempotency_key = $2
         AND status = 'PENDING' AND expires_at > NOW()
       RETURNING ${columns}`,
      [validatedUserId, validatedKey],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }
}
