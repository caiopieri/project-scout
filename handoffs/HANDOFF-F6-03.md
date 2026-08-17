# HANDOFF ARQUITETO — F6.3 frescor e expiração do contexto

## Por quê (amarra à arquitetura)

Persistir um rascunho não torna suas evidências atuais. Antes de qualquer
consumidor futuro reutilizar uma sugestão, o sistema deve indicar se o contexto
continua dentro de uma janela explícita ou se precisa de nova coleta/revisão.

## O que fazer

- Em `packages/schemas/src/index.ts`, adicionar schemas estritos para:
  - entrada com `context`, `now` em ISO UTC e `maxAgeSeconds` entre 1 e 7 dias;
  - resultado com `contextId`, `checkedAt`, `latestEvidenceAt`,
    `ageSeconds`, `status` (`FRESH`, `STALE`, `INVALID_FUTURE_TIMESTAMP`),
    `revalidationRequired` e `usable`.
- Exportar tipos em `packages/domain` e `packages/valuation`.
- Adicionar a porta `NegotiationFreshnessChecker` e implementar
  `DeterministicNegotiationFreshnessChecker` em `packages/valuation`:
  - validar tudo com Zod;
  - usar o maior `observedAt` das evidências;
  - rejeitar `now` anterior à evidência mais recente como resultado
    `INVALID_FUTURE_TIMESTAMP`, `revalidationRequired=true`, `usable=false`;
  - marcar `STALE` quando a idade exceder `maxAgeSeconds`;
  - só marcar `FRESH`/`usable=true` quando todas as condições forem válidas;
  - não consultar rede, LLM, relógio do sistema, fila, connector ou transporte.
- Criar `tests/f6-negotiation-freshness.test.ts` para frescor, expiração,
  timestamp futuro, limite inválido, evidência ausente e campos de ação.
- Não alterar o builder F6.1 para enviar ou aprovar automaticamente; o checker
  é uma barreira informativa que consumidores futuros devem consultar.

## Restrições

- Apenas TypeScript/Zod e packages existentes; determinístico e fixture-first.
- Timestamps devem ser fornecidos pelo chamador; não usar `new Date()` interno.
- Sem endpoint, migration, connector, follow-up, revalidação live, segredo,
  payment, bid, command ou send.

## DoD (Definition of Done — falsificável)

1. Mesmo input produz o mesmo resultado e timestamps futuros nunca ficam
   `usable=true`.
2. Contexto sem evidência, janela fora do limite e campos desconhecidos falham.
3. Testes focados, suíte completa, typecheck, lint e Prettier passam.

## O que isto prova e o que NÃO prova

Prova somente a decisão determinística de frescor sobre timestamps fornecidos.
Não prova que a fonte ainda existe, que o preço não mudou, nem que a coleta
live foi feita.

### Onde isto pode dar errado

- Relógio e timestamp da fonte podem estar errados; a regra não corrige relógios.
- Uma evidência recente pode continuar incompleta ou contraditória.
- O consumidor pode ignorar `usable=false`; isso deve ser protegido em uma
  futura fronteira de autorização, nunca por confiança no texto do rascunho.
