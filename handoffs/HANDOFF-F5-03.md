# HANDOFF ARQUITETO — F5.3 monitoramento read-only por eventos

## O que fazer

- Criar schemas estritos para eventos de lote (`PRICE_CHANGED`,
  `DEADLINE_CHANGED`, `STATUS_CHANGED`, `TERMS_CHANGED`, `REMOVED`) com lote,
  fonte, sequência, timestamp e valores limitados.
- Criar contrato de resumo com eventos deduplicados/ordenados, contagens e
  alertas (`PRICE_INCREASE`, `DEADLINE_NEAR`, `TERMS_CHANGED`, `LOT_REMOVED`).
- Implementar em `packages/valuation` um agregador puro que aceita apenas
  fixtures locais, rejeita lote misturado e sequência/timestamp inválidos,
  ordena deterministicamente e nunca chama rede ou executa ação.
- Testar deduplicação, ordenação, alertas, lote misturado e campos `bid`,
  `payment`, `command` ou `secret`.

## Restrições

Sem connector, polling, rede, proxy, CAPTCHA, LLM, bid, compra, pagamento,
endpoint, fila ou ação vinculante. Apenas eletrônicos e dados fornecidos.

### Onde isto pode dar errado

- Fixture não representa disponibilidade real; alertas não são autorização.
- Timestamp confiável não prova que o leilão ainda está aberto.
- Mudanças de termos exigem revisão humana e jurídica.
