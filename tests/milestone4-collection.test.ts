import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CollectionTaskProcessor,
  DefaultCollectionGateway,
  createCollectionTask,
} from '@scout/collection';
import {
  CollectionRunRepository,
  ConnectorError,
  type SourceConnector,
  type CreateCollectionRunInput,
} from '@scout/domain';
import { EBAY_MOCK_FIXTURES, MockEbayConnector } from '@scout/ebay-connector';
import { createConnectorManifest } from '@scout/collection';
import type {
  CollectionResult,
  CollectionRun,
  CollectorHealth,
  ResearchCriteria,
} from '@scout/schemas';

const runId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const projectId = 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb';
const criteria: ResearchCriteria = {
  category: 'smartphone',
  brands: ['Apple'],
  models: ['iPhone 13'],
  variants: [],
  storageGb: [128],
  memoryGb: [],
  acceptedDefects: ['cracked_screen'],
  rejectedDefects: ['activation_lock'],
  acceptedConditions: ['for_repair'],
  countries: [],
  regions: [],
  requiredFunctionalStates: [],
  preferredEvidence: [],
  additionalKeywords: [],
  excludedKeywords: [],
};

class MemoryRunRepository implements CollectionRunRepository {
  run: CollectionRun = {
    id: runId,
    projectId,
    sourceId: 'cccccccc-cccc-4ccc-accc-cccccccccccc',
    status: 'pending',
    idempotencyKey: 'm4-test-key',
    attemptCount: 0,
    itemsFound: 0,
    itemsCreated: 0,
    itemsUpdated: 0,
    estimatedCost: 0,
    provider: 'ebay-mock-v1',
  };
  criteria: ResearchCriteria | null = criteria;
  lastHealth: CollectorHealth | undefined;
  claimCalls = 0;
  releaseCalls = 0;
  failCalls = 0;

  async createOrFind(_input: CreateCollectionRunInput) {
    return { run: this.run, created: true };
  }
  async findById(id: string, ownerProjectId: string) {
    return id === this.run.id && ownerProjectId === projectId ? this.run : null;
  }
  async findByRunId(id: string) {
    return id === this.run.id ? this.run : null;
  }
  async markQueued(_id: string) {
    this.run = { ...this.run, queuedAt: new Date() };
    return this.run;
  }
  async claim(id: string, expectedAttemptCount: number, startedAt?: Date) {
    this.claimCalls += 1;
    if (
      id !== this.run.id ||
      this.run.status !== 'pending' ||
      this.run.attemptCount !== expectedAttemptCount
    )
      return null;
    this.run = {
      ...this.run,
      status: 'running',
      attemptCount: this.run.attemptCount + 1,
      startedAt: startedAt ?? new Date(),
      leaseExpiresAt: new Date(Date.now() + 300_000),
    };
    return this.run;
  }
  async setProvider(_id: string, provider: string) {
    this.run = { ...this.run, provider };
    return this.run;
  }
  async getProjectCriteria(_projectId: string) {
    return this.criteria;
  }
  async complete(
    _id: string,
    result: CollectionResult,
    _persistence?: import('@scout/schemas').CollectionPersistenceSummary,
    health?: CollectorHealth,
  ) {
    this.lastHealth = health;
    this.run = {
      ...this.run,
      status: 'completed',
      finishedAt: new Date(),
      itemsFound: result.items.length,
    };
    return this.run;
  }
  async releaseForRetry(_id: string, error: ConnectorError, health?: CollectorHealth) {
    this.releaseCalls += 1;
    this.lastHealth = health;
    this.run = {
      ...this.run,
      status: 'pending',
      error: error.message,
      errorKind: error.kind,
      errorCode: error.code,
    };
    return this.run;
  }
  async fail(_id: string, error: ConnectorError, health?: CollectorHealth) {
    this.failCalls += 1;
    this.lastHealth = health;
    this.run = {
      ...this.run,
      status: 'failed',
      finishedAt: new Date(),
      error: error.message,
      errorKind: error.kind,
      errorCode: error.code,
    };
    return this.run;
  }
}

afterEach(() => vi.unstubAllGlobals());

describe('Milestone 4 Collection Gateway', () => {
  it('collects all eBay fixtures through paginated mock calls without network access', async () => {
    const network = vi.fn();
    vi.stubGlobal('fetch', network);
    const result = await new DefaultCollectionGateway(new MockEbayConnector()).collect(criteria);
    expect(result.items).toHaveLength(EBAY_MOCK_FIXTURES.length);
    expect(result.pagesFetched).toBe(1);
    expect(result.provider).toBe('ebay-mock-v1');
    expect(network).not.toHaveBeenCalled();
  });

  it('keeps the page size constant across pages even when fewer items remain', async () => {
    // Fonte que exige offset múltiplo do limite (eBay, erro 12515) rejeita a
    // requisição se o limite encolher na última página.
    const connector = new MockEbayConnector();
    const requestedLimits: number[] = [];
    const observed: SourceConnector = {
      source: connector.source,
      provider: connector.provider,
      manifest: connector.manifest,
      search: (input) => {
        requestedLimits.push((input as { limit: number }).limit);
        return connector.search(input);
      },
      fetchDetails: (externalId) => connector.fetchDetails(externalId),
    };
    const gateway = new DefaultCollectionGateway(observed, {
      maxPages: 3,
      pageSize: 2,
      maxItems: 3,
    });
    const result = await gateway.collect(criteria);
    expect(result.items).toHaveLength(3);
    expect(requestedLimits).toEqual(requestedLimits.map(() => 2));
    expect(requestedLimits.length).toBeGreaterThan(1);
  });

  it('returns a truncated sweep instead of failing when the request budget runs out', async () => {
    const connector = new MockEbayConnector();
    const exhausted = new ConnectorError(
      'Source request budget exhausted.',
      'permanent',
      'REQUEST_BUDGET_EXHAUSTED',
    );
    let details = 0;
    const budgeted: SourceConnector = {
      source: connector.source,
      provider: connector.provider,
      manifest: connector.manifest,
      search: (input) => connector.search(input),
      fetchDetails: (externalId) => {
        details += 1;
        if (details > 2) throw exhausted;
        return connector.fetchDetails(externalId);
      },
    };
    const result = await new DefaultCollectionGateway(budgeted).collect(criteria);
    expect(result.items).toHaveLength(2);
    expect(result.truncated).toBe(true);
  });

  it('propagates budget exhaustion as a failure when nothing was collected', async () => {
    const connector = new MockEbayConnector();
    const budgeted: SourceConnector = {
      source: connector.source,
      provider: connector.provider,
      manifest: connector.manifest,
      search: () => {
        throw new ConnectorError(
          'Source request budget exhausted.',
          'permanent',
          'REQUEST_BUDGET_EXHAUSTED',
        );
      },
      fetchDetails: (externalId) => connector.fetchDetails(externalId),
    };
    await expect(new DefaultCollectionGateway(budgeted).collect(criteria)).rejects.toMatchObject({
      code: 'REQUEST_BUDGET_EXHAUSTED',
    });
  });

  it('honors the requested collection limit', async () => {
    const result = await new DefaultCollectionGateway(new MockEbayConnector()).collect(criteria, 3);
    expect(result.items.map((item) => item.preview.externalId)).toEqual([
      'mock-ebay-1001',
      'mock-ebay-1002',
      'mock-ebay-1003',
    ]);
  });

  it('caps pagination at three search pages and rejects repeated cursors', async () => {
    let searches = 0;
    const endless: SourceConnector = {
      source: 'ebay',
      provider: 'test-endless',
      manifest: createConnectorManifest({
        source: 'ebay',
        primaryLayer: 1,
        fallbacks: [],
        limits: { maxPages: 3, pageSize: 10, maxItems: 10 },
        healthStates: ['NORMAL'],
      }),
      async search() {
        searches += 1;
        return {
          items: [
            {
              externalId: `item-${searches}`,
              url: `https://www.ebay.com/itm/item-${searches}`,
              title: `Fixture ${searches}`,
              price: { amountMinor: 100, currency: 'USD' },
            },
          ],
          nextCursor: String(searches),
        };
      },
      async fetchDetails(externalId) {
        return {
          preview: {
            externalId,
            url: `https://www.ebay.com/itm/${externalId}`,
            title: externalId,
            price: { amountMinor: 100, currency: 'USD' },
          },
          payload: { fixture: true },
        };
      },
    };
    const limits = { maxPages: 3, pageSize: 10, maxItems: 10 };
    const capped = await new DefaultCollectionGateway(endless, limits).collect(criteria, 10);
    expect(capped).toMatchObject({ pagesFetched: 3, provider: 'test-endless' });
    expect(capped.items).toHaveLength(3);

    const repeated: SourceConnector = {
      ...endless,
      provider: 'test-repeated',
      async search() {
        return { items: [], nextCursor: 'same' };
      },
    };
    await expect(
      new DefaultCollectionGateway(repeated, limits).collect(criteria, 10),
    ).rejects.toMatchObject({ code: 'CURSOR_LOOP' });
  });

  it('completes once and ignores a duplicate delivered task', async () => {
    const repository = new MemoryRunRepository();
    const processor = new CollectionTaskProcessor(
      repository,
      new DefaultCollectionGateway(new MockEbayConnector()),
    );
    expect(await processor.process(createCollectionTask(runId))).toEqual({
      action: 'ack',
      status: 'completed',
    });
    expect(repository.run.itemsFound).toBe(5);
    expect(repository.lastHealth).toMatchObject({
      collectionRunId: runId,
      attemptNumber: 1,
      state: 'NORMAL',
    });
    expect(await processor.process(createCollectionTask(runId))).toEqual({
      action: 'ack',
      status: 'ignored',
    });
  });

  it('schedules textual analysis only after normalized listings are persisted', async () => {
    const repository = new MemoryRunRepository();
    const listingId = '22222222-2222-4222-a222-222222222222';
    const ingestor = {
      ingest: vi.fn(async () => ({
        itemsCreated: 1,
        itemsUpdated: 0,
        listingIds: [listingId],
        listingIdsByExternalId: {},
      })),
    };
    const scheduler = { schedule: vi.fn(async () => undefined) };
    const processor = new CollectionTaskProcessor(
      repository,
      new DefaultCollectionGateway(new MockEbayConnector()),
      3,
      ingestor,
      scheduler,
    );
    await expect(processor.process(createCollectionTask(runId))).resolves.toEqual({
      action: 'ack',
      status: 'completed',
    });
    expect(ingestor.ingest).toHaveBeenCalledOnce();
    expect(scheduler.schedule).toHaveBeenCalledWith([listingId]);
  });

  it('evaluates opportunities only when the project declares a valuation policy', async () => {
    const repository = new MemoryRunRepository();
    repository.criteria = {
      ...criteria,
      opportunityPolicy: {
        processingCostMinor: 1000,
        desiredMarginMinor: 5000,
        repairReserveMinor: 500,
        transactionCostRate: 0.1,
      },
    };
    const ingestor = {
      ingest: vi.fn(async () => ({
        itemsCreated: 5,
        itemsUpdated: 0,
        listingIds: [],
        listingIdsByExternalId: {},
      })),
    };
    const evaluator = { evaluate: vi.fn(async () => undefined) };
    const processor = new CollectionTaskProcessor(
      repository,
      new DefaultCollectionGateway(new MockEbayConnector()),
      3,
      ingestor,
      undefined,
      undefined,
      evaluator,
    );

    await expect(processor.process(createCollectionTask(runId))).resolves.toEqual({
      action: 'ack',
      status: 'completed',
    });
    expect(evaluator.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        policy: repository.criteria.opportunityPolicy,
      }),
    );
  });

  it('retries transient failures with bounded attempts and then fails permanently', async () => {
    const repository = new MemoryRunRepository();
    const processor = new CollectionTaskProcessor(
      repository,
      new DefaultCollectionGateway(new MockEbayConnector('search')),
    );
    expect((await processor.process(createCollectionTask(runId))).action).toBe('retry');
    expect(repository.lastHealth).toMatchObject({ attemptNumber: 1, state: 'ERROR' });
    expect((await processor.process(createCollectionTask(runId))).action).toBe('retry');
    expect(await processor.process(createCollectionTask(runId))).toEqual({
      action: 'ack',
      status: 'failed',
    });
    expect(repository.run).toMatchObject({
      status: 'failed',
      attemptCount: 3,
      errorKind: 'transient',
      errorCode: 'MOCK_SEARCH_UNAVAILABLE',
    });
  });

  it('does not retry permanent connector failures or missing project criteria', async () => {
    const permanent = new MemoryRunRepository();
    const processor = new CollectionTaskProcessor(
      permanent,
      new DefaultCollectionGateway(new MockEbayConnector('details')),
    );
    expect(await processor.process(createCollectionTask(runId))).toEqual({
      action: 'ack',
      status: 'failed',
    });
    expect(permanent.run.errorCode).toBe('MOCK_DETAIL_INVALID');
    expect(permanent.lastHealth).toMatchObject({ attemptNumber: 1, state: 'ERROR' });

    const missing = new MemoryRunRepository();
    missing.criteria = null;
    expect(
      await new CollectionTaskProcessor(
        missing,
        new DefaultCollectionGateway(new MockEbayConnector()),
      ).process(createCollectionTask(runId)),
    ).toEqual({ action: 'ack', status: 'failed' });
    expect(missing.run.errorCode).toBe('PROJECT_CRITERIA_MISSING');
  });

  it('acknowledges malformed internal messages without touching a run', async () => {
    const repository = new MemoryRunRepository();
    const outcome = await new CollectionTaskProcessor(
      repository,
      new DefaultCollectionGateway(new MockEbayConnector()),
    ).process({ runId: 'invalid' });
    expect(outcome).toEqual({ action: 'ack', status: 'failed' });
    expect(repository.run.status).toBe('pending');
  });

  it('retries a redelivery while another worker still owns the active lease', async () => {
    const repository = new MemoryRunRepository();
    repository.run = {
      ...repository.run,
      status: 'running',
      leaseExpiresAt: new Date(Date.now() + 60_000),
    };
    const outcome = await new CollectionTaskProcessor(
      repository,
      new DefaultCollectionGateway(new MockEbayConnector()),
    ).process(createCollectionTask(runId));
    expect(outcome).toEqual({ action: 'retry', delaySeconds: 30 });
    expect(repository.claimCalls).toBe(0);
  });

  it('does not close a running lease that is absent or expired on first delivery', async () => {
    const repository = new MemoryRunRepository();
    repository.run = { ...repository.run, status: 'running' };
    const processor = new CollectionTaskProcessor(
      repository,
      new DefaultCollectionGateway(new MockEbayConnector()),
    );
    await expect(processor.process(createCollectionTask(runId), 0)).resolves.toEqual({
      action: 'retry',
      delaySeconds: 30,
    });
    repository.run = {
      ...repository.run,
      leaseExpiresAt: new Date(Date.now() - 1),
    };
    await expect(processor.process(createCollectionTask(runId), 1)).resolves.toEqual({
      action: 'retry',
      delaySeconds: 30,
    });
    expect(repository.failCalls).toBe(0);
    expect(repository.claimCalls).toBe(0);
  });

  it('closes only a redelivered expired run as an orphan without resolving a gateway', async () => {
    const repository = new MemoryRunRepository();
    repository.run = {
      ...repository.run,
      status: 'running',
      leaseExpiresAt: new Date(Date.now() - 1),
    };
    const resolver = { resolve: vi.fn() };
    const outcome = await new CollectionTaskProcessor(repository, resolver).process(
      createCollectionTask(runId),
      2,
    );
    expect(outcome).toEqual({ action: 'ack', status: 'failed' });
    expect(repository.run).toMatchObject({
      status: 'failed',
      errorCode: 'COLLECTION_RUN_ORPHANED',
    });
    expect(repository.failCalls).toBe(1);
    expect(repository.releaseCalls).toBe(0);
    expect(resolver.resolve).not.toHaveBeenCalled();
  });

  it('fails terminally after collection returns instead of retrying and recollecting', async () => {
    const repository = new MemoryRunRepository();
    const connector = new MockEbayConnector();
    const search = vi.spyOn(connector, 'search');
    const triage = {
      process: vi.fn(async () => {
        throw new ConnectorError('triage write failed', 'transient', 'TRIAGE_WRITE_FAILED');
      }),
    };
    const ingestor = {
      ingest: vi.fn(async () => ({
        itemsCreated: 5,
        itemsUpdated: 0,
        listingIds: [],
        listingIdsByExternalId: {},
      })),
    };
    const processor = new CollectionTaskProcessor(
      repository,
      new DefaultCollectionGateway(connector),
      3,
      ingestor,
      undefined,
      undefined,
      undefined,
      triage,
    );

    await expect(processor.process(createCollectionTask(runId))).resolves.toEqual({
      action: 'ack',
      status: 'failed',
    });
    expect(repository.releaseCalls).toBe(0);
    expect(repository.run).toMatchObject({
      status: 'failed',
      errorCode: 'TRIAGE_WRITE_FAILED',
      error: 'triage write failed',
    });
    expect(search).toHaveBeenCalledOnce();
  });
});
