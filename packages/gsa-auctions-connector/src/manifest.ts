import { connectorManifestSchema } from '@scout/schemas';

export const GSA_AUCTIONS_MANIFEST = connectorManifestSchema.parse({
  source: 'gsa-auctions',
  primaryLayer: 1,
  fallbacks: [{ layer: 4, enabled: false, reason: 'The official API covers every active lot.' }],
  // One request returns the whole active list, so a sweep costs one call.
  limits: { maxPages: 1, pageSize: 1000, maxItems: 1000 },
  livePolicy: {
    allowed: true,
    reason:
      'Official public API of the U.S. GSA (api.data.gov key; DEMO_KEY allows ~50 calls a day).',
    checkedAt: '2026-10-24',
  },
  healthStates: ['NORMAL', 'RATE_LIMITED', 'ERROR', 'CONTENT_CHANGED'],
});
