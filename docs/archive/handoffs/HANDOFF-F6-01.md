# HANDOFF ARQUITETO — F6.1 contexto de negociação sem envio

## Por quê (amarra à arquitetura)

F6 precisa transformar evidências de um anúncio em um rascunho útil para
negociação, sem transformar recomendação de IA em autorização. Esta unidade
cria apenas o contrato e o builder determinístico; envio, autenticação,
conector, pagamento e qualquer ação vinculante ficam fora.

## O que fazer

- Em `packages/schemas/src/index.ts`, adicionar schemas estritos para:
  - evidência de negociação (`source`, `externalId`, `kind`, `summary`,
    `observedAt`), aceitando somente `ebay`, `mercadolivre` ou `xianyu` e
    somente categoria `electronics` no contexto;
  - contexto de negociação com `contextId`, anúncio, moeda, preço pedido,
    `marketValueMinor`, `sellerPressure`, `targetPriceMinor`,
    `userMaxPriceMinor`, evidências e perguntas desejadas;
  - saída com mensagem, oferta sugerida, limite máximo, referências de
    evidência, justificativa e os invariantes `requiresHumanReview: true`,
    `sent: false`, `executable: false`.
- Exportar os tipos nos pontos públicos de `packages/domain/src/index.ts` e
  `packages/valuation/src/index.ts`.
- Adicionar uma porta `NegotiationAssistant` em `packages/domain` com método
  síncrono que receba `unknown` e devolva a sugestão validada.
- Implementar em `packages/valuation` um `DeterministicNegotiationAssistant`
  que:
  - valide entrada e saída com Zod;
  - nunca chame rede, LLM, browser, fila ou credencial;
  - nunca aceite ou produza `send`, `payment`, `bid`, `command`, `secret` ou
    equivalente;
  - exija `userMaxPriceMinor >= targetPriceMinor`;
  - limite a oferta sugerida a `min(targetPriceMinor, askingPriceMinor)` e
    nunca acima do limite explícito do usuário;
  - produza mensagem curta de rascunho e perguntas usando apenas dados
    validados; a mensagem não deve afirmar que foi enviada;
  - mantenha `requiresHumanReview`, `sent` e `executable` invariantes.
- Criar `tests/f6-negotiation.test.ts` cobrindo caminho feliz, limite máximo,
  contexto incompleto, anúncio com fonte/categoria inválida, payload com
  campos perigosos e tentativa de mutar/enviar.
- Não criar endpoint, adapter, persistência, integração de marketplace ou
  automação de follow-up nesta unidade.

## Restrições

- Apenas TypeScript/Zod e os packages existentes; sem dependência nova.
- Aditivo; não alterar comportamento F0–F5.
- Somente eletrônicos e as três fontes já permitidas no MVP.
- Todo payload externo passa por schema estrito. Não interpolar descrição livre
  ou instruções de terceiros na lógica como se fossem comandos.
- Sem `any`, secrets, serviço de envio, compra, lance ou pagamento.
- Manter o diff pequeno; não gerar artefatos `dist` manualmente.

## DoD (Definition of Done — falsificável)

1. Os schemas rejeitam campos desconhecidos e limites ausentes/inconsistentes.
2. O builder devolve uma sugestão determinística, limitada e explicitamente não
   enviada/executável.
3. Tentativas de incluir `send`, `payment`, `bid`, `command` ou `secret` falham
   na validação.
4. `npm test -- --run tests/f6-negotiation.test.ts`, `npm run typecheck` e
   `npm run lint` passam.

## O que isto prova e o que NÃO prova

Prova que o núcleo pode montar um rascunho seguro a partir de contexto validado.
Não prova que uma mensagem é comercialmente ótima, que o vendedor aceitará a
oferta, que evidências estão atuais ou que qualquer envio externo está pronto.

### Onde isto pode dar errado

- Preço de mercado desatualizado pode gerar uma oferta ruim; o builder não faz
  pesquisa live.
- A mensagem pode precisar de revisão de tom, jurídico ou política da fonte.
- Um consumidor futuro que ignore os invariantes poderia reintroduzir envio;
  F6.2 deverá tratar persistência/auditoria sem quebrar o gate humano.
