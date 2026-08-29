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
import { CheapListingFilter } from '@scout/search-intelligence';
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
  releaseCalls = 0;

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
    if (
      id !== this.run.id ||
      this.run.status !== 'pending' ||
      expectedAttemptCount !== this.run.attemptCount
    )
      return null;
    const claimedAt = new Date();
    this.run = {
      ...this.run,
      status: 'running',
      startedAt: startedAt ?? claimedAt,
      leaseExpiresAt: new Date(claimedAt.getTime() + 5 * 60_000),
      attemptCount: this.run.attemptCount + 1,
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

  it('reports page progress and connector request metrics to the caller', async () => {
    const connector = new MockEbayConnector();
    const progress: import('@scout/schemas').CollectionProgressSnapshot[] = [];
    const observable: SourceConnector = {
      source: connector.source,
      provider: connector.provider,
      manifest: connector.manifest,
      search: (input) => connector.search(input),
      fetchDetails: (externalId) => connector.fetchDetails(externalId),
      getRequestMetrics: () => ({ requestsUsed: 6, requestBudget: 10 }),
    };

    const result = await new DefaultCollectionGateway(observable).collect(criteria, 5, undefined, {
      onProgress: (snapshot) => progress.push(snapshot),
    });

    expect(progress).toEqual([
      {
        itemsFound: 5,
        pagesFetched: 1,
        requestMetrics: { requestsUsed: 6, requestBudget: 10 },
        truncated: false,
      },
    ]);
    expect(result.requestMetrics).toEqual({ requestsUsed: 6, requestBudget: 10 });
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
    const progress: import('@scout/schemas').CollectionProgressSnapshot[] = [];
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
    const result = await new DefaultCollectionGateway(budgeted).collect(
      criteria,
      undefined,
      undefined,
      {
        onProgress: (snapshot) => progress.push(snapshot),
      },
    );
    expect(result.items).toHaveLength(2);
    expect(result.truncated).toBe(true);
    expect(progress.at(-1)).toMatchObject({ itemsFound: 2, truncated: true });
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

  it('screens previews before details and retains rejected previews for triage', async () => {
    const previews = [
      {
        externalId: 'rejected-defect',
        url: 'https://example.test/rejected-defect',
        title: 'Apple iPhone 13 activation lock',
        price: { amountMinor: 10000, currency: 'USD' as const },
      },
      {
        externalId: 'rejected-category',
        url: 'https://example.test/rejected-category',
        title: 'Dell laptop replacement screen',
        price: { amountMinor: 10000, currency: 'USD' as const },
      },
      {
        externalId: 'survivor',
        url: 'https://example.test/survivor',
        title: 'Apple iPhone 13 cracked screen',
        price: { amountMinor: 10000, currency: 'USD' as const },
      },
    ];
    const detailIds: string[] = [];
    const connector: SourceConnector = {
      source: 'ebay',
      provider: 'screening-fixture',
      manifest: createConnectorManifest({
        source: 'ebay',
        primaryLayer: 1,
        fallbacks: [],
        limits: { maxPages: 1, pageSize: 10, maxItems: 10 },
        healthStates: ['NORMAL'],
      }),
      async search() {
        return { items: previews };
      },
      async fetchDetails(externalId) {
        detailIds.push(externalId);
        const preview = previews.find((item) => item.externalId === externalId);
        if (!preview) throw new Error('missing fixture');
        return { preview, payload: { description: preview.title } };
      },
    };
    const screening = new CheapListingFilter();
    const result = await new DefaultCollectionGateway(connector).collect(
      { ...criteria, rejectedDefects: ['activation_lock'] },
      3,
      undefined,
      { previewFilter: (preview, rawCriteria) => screening.screenPreview(preview, rawCriteria) },
    );

    expect(detailIds).toEqual(['survivor']);
    expect(result.items.map(({ preview }) => preview.externalId)).toEqual([
      'rejected-defect',
      'rejected-category',
      'survivor',
    ]);
    expect(result.items.slice(0, 2).map(({ payload }) => payload)).toEqual([
      expect.objectContaining({ previewOnly: true, cheapFilterDecision: 'REJECT' }),
      expect.objectContaining({ previewOnly: true, cheapFilterDecision: 'REJECT' }),
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

  it('does not fail a persisted collection when the analysis queue is unavailable', async () => {
    const repository = new MemoryRunRepository();
    const ingestor = {
      ingest: vi.fn(async () => ({
        itemsCreated: 1,
        itemsUpdated: 0,
        listingIds: ['22222222-2222-4222-a222-222222222222'],
        listingIdsByExternalId: {},
      })),
    };
    const scheduler = {
      schedule: vi.fn(async () => {
        throw new Error('analysis queue unavailable');
      }),
    };
    const outcome = await new CollectionTaskProcessor(
      repository,
      new DefaultCollectionGateway(new MockEbayConnector()),
      3,
      ingestor,
      scheduler,
    ).process(createCollectionTask(runId));

    expect(outcome).toEqual({ action: 'ack', status: 'completed' });
    expect(repository.run.status).toBe('completed');
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
  });

  it('fails an expired running run on redelivery without calling the gateway', async () => {
    const repository = new MemoryRunRepository();
    repository.run = {
      ...repository.run,
      status: 'running',
      attemptCount: 1,
      leaseExpiresAt: new Date(Date.now() - 1_000),
    };
    const gateway = new DefaultCollectionGateway(new MockEbayConnector());
    const collect = vi.spyOn(gateway, 'collect');

    const outcome = await new CollectionTaskProcessor(repository, gateway).process(
      createCollectionTask(runId),
      2,
    );

    expect(outcome).toEqual({ action: 'ack', status: 'failed' });
    expect(repository.run).toMatchObject({
      status: 'failed',
      errorCode: 'COLLECTION_RUN_ORPHANED',
      attemptCount: 1,
    });
    expect(collect).not.toHaveBeenCalled();
  });

  it('keeps an expired running run retryable on first delivery', async () => {
    const repository = new MemoryRunRepository();
    repository.run = {
      ...repository.run,
      status: 'running',
      attemptCount: 1,
      leaseExpiresAt: new Date(Date.now() - 1_000),
    };

    await expect(
      new CollectionTaskProcessor(
        repository,
        new DefaultCollectionGateway(new MockEbayConnector()),
      ).process(createCollectionTask(runId), 1),
    ).resolves.toEqual({ action: 'retry', delaySeconds: 30 });
    expect(repository.run.status).toBe('running');
  });

  it('keeps a running run with no lease retryable on redelivery', async () => {
    const repository = new MemoryRunRepository();
    repository.run = {
      ...repository.run,
      status: 'running',
      attemptCount: 1,
      leaseExpiresAt: undefined,
    };

    await expect(
      new CollectionTaskProcessor(
        repository,
        new DefaultCollectionGateway(new MockEbayConnector()),
      ).process(createCollectionTask(runId), 2),
    ).resolves.toEqual({ action: 'retry', delaySeconds: 30 });
    expect(repository.run.status).toBe('running');
  });

  it('does not retry a transient failure after the gateway returned results', async () => {
    const repository = new MemoryRunRepository();
    const ingestor = {
      ingest: vi.fn(async () => ({
        itemsCreated: 1,
        itemsUpdated: 0,
        listingIds: ['22222222-2222-4222-a222-222222222222'],
        listingIdsByExternalId: {},
      })),
    };
    const triageProcessor = {
      process: vi.fn(async () => {
        throw new ConnectorError(
          'triage unavailable',
          'transient',
          'TRIAGE_PERSISTENCE_UNAVAILABLE',
        );
      }),
    };

    const outcome = await new CollectionTaskProcessor(
      repository,
      new DefaultCollectionGateway(new MockEbayConnector()),
      3,
      ingestor,
      undefined,
      undefined,
      undefined,
      triageProcessor,
    ).process(createCollectionTask(runId));

    expect(outcome).toEqual({ action: 'ack', status: 'failed' });
    expect(repository.run).toMatchObject({
      status: 'failed',
      errorCode: 'TRIAGE_PERSISTENCE_UNAVAILABLE',
    });
    expect(repository.releaseCalls).toBe(0);
  });
});
