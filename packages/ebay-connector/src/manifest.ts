import { connectorManifestSchema } from '@scout/schemas';

export const EBAY_CONNECTOR_MANIFEST = connectorManifestSchema.parse({
  source: 'ebay',
  primaryLayer: 1,
  fallbacks: [
    {
      layer: 4,
      enabled: false,
      reason: 'HTTP/HTML fallback is not implemented in the MVP.',
    },
    {
      layer: 5,
      enabled: false,
      reason: 'Browser fallback requires a separate approved runtime.',
    },
    {
      layer: 6,
      enabled: false,
      reason: 'DOM fallback is not implemented in the MVP.',
    },
    {
      layer: 7,
      enabled: false,
      reason: 'Screenshot/OCR fallback is deferred to a later phase.',
    },
  ],
  limits: {
    // A Browse API aceita até 200 por página, mas o schema do núcleo limita a
    // 100 e a diferença custa uma chamada de busca a cada 100 anúncios —
    // irrelevante perto de uma chamada de detalhe por anúncio. Não vale alargar
    // a fronteira do núcleo por isso. O orçamento real por execução é
    // configuração do Worker (EBAY_BROWSE_BUDGET_PER_RUN), não literal aqui.
    maxPages: 20,
    pageSize: 100,
    maxItems: 500,
  },
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
