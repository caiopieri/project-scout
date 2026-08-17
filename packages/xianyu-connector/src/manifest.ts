import { connectorManifestSchema } from '@scout/schemas';

export const XIANYU_CONNECTOR_MANIFEST = connectorManifestSchema.parse({
  source: 'xianyu',
  primaryLayer: 2,
  fallbacks: [
    { layer: 4, enabled: false, reason: 'HTTP/HTML fallback requires a reviewed provider.' },
    { layer: 5, enabled: false, reason: 'Browser fallback is not approved for the MVP.' },
    { layer: 6, enabled: false, reason: 'DOM fallback is not implemented in the MVP.' },
    { layer: 7, enabled: false, reason: 'Screenshot/OCR fallback is deferred to a later phase.' },
  ],
  limits: { maxPages: 1, pageSize: 5, maxItems: 5 },
  healthStates: [
    'NORMAL',
    'LOGIN_REQUIRED',
    'CAPTCHA',
    'EMPTY_RESULTS',
    'RATE_LIMITED',
    'ERROR',
    'MODAL_BLOCKING',
    'CONTENT_CHANGED',
  ],
});
