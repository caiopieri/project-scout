import { connectorManifestSchema } from '@scout/schemas';

export const SWAPPA_CONNECTOR_MANIFEST = connectorManifestSchema.parse({
  source: 'swappa',
  primaryLayer: 4,
  fallbacks: [
    { layer: 1, enabled: false, reason: 'Swappa has no public listings API.' },
    {
      layer: 5,
      enabled: false,
      reason: 'Listing pages render server-side; a browser is not needed.',
    },
  ],
  limits: { maxPages: 1, pageSize: 50, maxItems: 50 },
  // robots.txt only disallows /cgi-bin/, but the terms of use prohibit "data mining, robots, or
  // similar data gathering and extraction tools". Live collection stays off; the connector is
  // exercised against recorded pages until there is permission or a user-session path (S6).
  livePolicy: {
    allowed: false,
    reason: 'Terms of use prohibit robots and data mining (robots.txt would allow).',
    checkedAt: '2026-10-23',
  },
  healthStates: ['NORMAL', 'CAPTCHA', 'EMPTY_RESULTS', 'RATE_LIMITED', 'ERROR', 'CONTENT_CHANGED'],
});
