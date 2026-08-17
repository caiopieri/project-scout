import { describe, expect, it } from 'vitest';
import { DefaultCollectionGateway } from '@scout/collection';
import {
  MockXianyuConnector,
  UnavailableXianyuConnector,
  XIANYU_CONNECTOR_MANIFEST,
  XIANYU_MOCK_FIXTURES,
} from '@scout/xianyu-connector';
import type { ResearchCriteria } from '@scout/schemas';

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

describe('Xianyu connector boundary', () => {
  it('declares the difficult-source boundary without enabling fallbacks', () => {
    expect(XIANYU_CONNECTOR_MANIFEST).toMatchObject({
      source: 'xianyu',
      primaryLayer: 2,
    });
    expect(XIANYU_CONNECTOR_MANIFEST.fallbacks.every(({ enabled }) => !enabled)).toBe(true);
  });

  it('runs the sanitized fixture connector through the common gateway', async () => {
    const result = await new DefaultCollectionGateway(new MockXianyuConnector()).collect(criteria);

    expect(result.items).toHaveLength(XIANYU_MOCK_FIXTURES.length);
    expect(result.provider).toBe('xianyu-mock-v1');
  });

  it('fails closed instead of attempting an unauthorized live integration', async () => {
    const connector = new UnavailableXianyuConnector();

    await expect(connector.search({ criteria, limit: 5 })).rejects.toMatchObject({
      code: 'XIANYU_CONFIGURATION_MISSING',
      kind: 'permanent',
    });
  });
});
