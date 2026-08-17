# HANDOFF ARQUITETO — F7.2 gate de expiração e replay

## Por quê (amarra à arquitetura)

Um envelope pendente não pode ser reutilizado indefinidamente. Antes de
qualquer executor futuro, é necessário verificar expiração, idempotência e
aprovação humana. Esta unidade cria apenas o gate puro; não mantém storage nem
executa ação.

## O que fazer

- Em `packages/schemas/src/index.ts`, criar entrada estrita com envelope F7.1,
  `now` UTC fornecido pelo chamador e `alreadyConsumed` booleano.
- Criar resultado estrito com `authorizationId`, decisão
  (`AWAITING_HUMAN_APPROVAL`, `EXPIRED`, `REPLAYED`),
  `requiresHumanApproval=true` e `executable=false`.
- Exportar tipos e criar porta `AuthorizationEnvelopeValidator` em `domain`.
- Implementar checker determinístico em `valuation` com prioridade:
  1. `REPLAYED` se a chave/envelope já foi consumida;
  2. `EXPIRED` se `now >= expiresAt`;
  3. `AWAITING_HUMAN_APPROVAL` caso contrário.
- Nunca produzir decisão de execução, mesmo em envelope dentro do prazo; não
  usar relógio do sistema, rede, banco, fila, browser, credencial ou executor.
- Testar as três decisões, timestamps inválidos/futuros, envelope mutado e
  campos `payment`, `secret`, `command`, `send` ou `bid`.

## Restrições

- Sem migration, storage, assinatura criptográfica ou ação financeira.
- A validação de replay recebe apenas a indicação booleana do chamador; não
  fingir que há ledger persistente nesta unidade.
- Não alterar F7.1 nem habilitar compra, lance, pagamento ou mensagem.

## DoD (Definition of Done — falsificável)

1. Envelope válido e não consumido nunca passa de `AWAITING_HUMAN_APPROVAL`.
2. Expirado ou consumido falha fechado com decisão correspondente.
3. Testes focados, suíte completa, typecheck, lint e Prettier passam.

## O que isto prova e o que NÃO prova

Prova a ordem determinística das barreiras de expiração/replay e a ausência de
execução. Não prova que o booleano veio de um ledger confiável, que houve
autorização humana ou que uma futura ação é segura.

### Onde isto pode dar errado

- Sem ledger persistente, dois consumidores podem observar `false` ao mesmo
  tempo; a unidade de storage/idempotência ainda é necessária.
- Relógios divergentes podem expirar uma intenção cedo ou tarde.
- Um executor futuro que ignore o resultado reintroduz risco; ele precisa de
  gate separado e revisão humana.
