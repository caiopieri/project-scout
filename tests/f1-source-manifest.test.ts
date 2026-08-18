import { describe, expect, it } from 'vitest';
import { EBAY_CONNECTOR_MANIFEST, MockEbayConnector } from '@scout/ebay-connector';
import { DefaultCollectionGateway } from '@scout/collection';

describe('F1 connector manifests', () => {
  it('declares the eBay API as the primary layer and keeps fallbacks disabled', () => {
    expect(EBAY_CONNECTOR_MANIFEST).toMatchObject({
      source: 'ebay',
      primaryLayer: 1,
      limits: { maxPages: 10, pageSize: 200, maxItems: 500, maxQueries: 3 },
    });
    expect(EBAY_CONNECTOR_MANIFEST.fallbacks.every(({ enabled }) => !enabled)).toBe(true);
    expect(EBAY_CONNECTOR_MANIFEST.healthStates).toContain('CONTENT_CHANGED');
  });

  it('makes the gateway use the manifest limits and primary layer by default', () => {
    const gateway = new DefaultCollectionGateway(new MockEbayConnector());

    expect(gateway.manifest).toEqual(EBAY_CONNECTOR_MANIFEST);
    expect(gateway.ingestionLayer).toBe(1);
    expect(gateway.collect).toBeTypeOf('function');
  });

  it('rejects a manifest belonging to another source', () => {
    expect(
      () =>
        new DefaultCollectionGateway({
          ...new MockEbayConnector(),
          manifest: { ...EBAY_CONNECTOR_MANIFEST, source: 'mercadolivre' },
        }),
    ).toThrowError('Connector manifest source does not match connector source.');
  });
});
