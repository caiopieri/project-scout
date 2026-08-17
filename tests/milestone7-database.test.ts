import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';

const LISTING_ID = '22222222-2222-4222-a222-222222222222';

describe('Milestone 7 textual analysis database integration', () => {
  let client: Client | null = null;

  beforeAll(async () => {
    client = new Client({
      connectionString:
        process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:54322/postgres',
    });
    try {
      await client.connect();
    } catch {
      client = null;
    }
  });

  afterAll(async () => {
    await client?.end().catch(() => undefined);
  });

  it('claims and persists one idempotent run with relational evidence links', async (context) => {
    if (!client) return context.skip();
    await client.query('SET ROLE service_role');
    const promptVersion = `text-analysis-test-${crypto.randomUUID()}`;
    const config = [LISTING_ID, 'mock', 'rules-en-pt', promptVersion];
    const first = await client.query('SELECT * FROM request_text_analysis($1, $2, $3, $4)', config);
    const runId = first.rows[0].analysis_run_id as string;
    expect(first.rows[0].should_queue).toBe(true);
    await client.query('SELECT mark_text_analysis_queued($1)', [runId]);
    const duplicate = await client.query(
      'SELECT * FROM request_text_analysis($1, $2, $3, $4)',
      config,
    );
    expect(duplicate.rows[0]).toMatchObject({ analysis_run_id: runId, should_queue: false });

    const claimed = await client.query('SELECT * FROM claim_text_analysis($1)', [runId]);
    expect(claimed.rows[0]).toMatchObject({
      analysis_run_id: runId,
      listing_id: LISTING_ID,
      attempt_count: 1,
    });
    const result = {
      evidences: [
        {
          key: 'screen_title',
          component: 'display',
          evidenceType: 'cosmetic_defect',
          assessmentKind: 'fact',
          sourceType: 'title',
          sourceReference: 'title',
          claim: 'Seller declares a cracked screen.',
          status: 'confirmed_defective',
          confidence: 0.9,
          explanation: 'Phrase found in title.',
          limitations: ['Seller statement is not physically verified.'],
          severity: 'high',
        },
      ],
      defects: [
        {
          key: 'cracked_screen',
          component: 'display',
          defectType: 'cracked_screen',
          status: 'declared',
          confidence: 0.9,
          severity: 'high',
          declared: true,
          inferred: false,
          evidenceKeys: ['screen_title'],
        },
      ],
      contradictions: [],
      provider: 'mock',
      model: 'rules-en-pt',
      promptVersion,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    };
    await client.query('SELECT complete_text_analysis($1, $2::jsonb)', [
      runId,
      JSON.stringify(result),
    ]);
    expect(
      (await client.query('SELECT status FROM analysis_runs WHERE id = $1', [runId])).rows[0]
        .status,
    ).toBe('completed');
    expect(
      Number(
        (
          await client.query(
            `SELECT COUNT(*) FROM defect_evidence de
             JOIN defects d ON d.id = de.defect_id
             JOIN evidence e ON e.id = de.evidence_id
             WHERE d.analysis_run_id = $1 AND e.analysis_run_id = $1`,
            [runId],
          )
        ).rows[0].count,
      ),
    ).toBe(1);
    expect(
      (await client.query('SELECT * FROM claim_text_analysis($1)', [runId])).rows,
    ).toHaveLength(0);
    await client.query('RESET ROLE');
  });

  it('denies analysis mutation RPCs and direct writes to authenticated users', async (context) => {
    if (!client) return context.skip();
    await client.query('SET ROLE authenticated');
    await client.query(
      `SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-a111-111111111111', false)`,
    );
    await expect(
      client.query('SELECT * FROM request_text_analysis($1, $2, $3, $4)', [
        LISTING_ID,
        'forged',
        'forged',
        'forged',
      ]),
    ).rejects.toThrow();
    await expect(
      client.query(
        `INSERT INTO analysis_runs(listing_id, model_name, prompt_version)
         VALUES ($1, 'forged', 'forged')`,
        [LISTING_ID],
      ),
    ).rejects.toThrow();
    await client.query('RESET ROLE');
  });
});
