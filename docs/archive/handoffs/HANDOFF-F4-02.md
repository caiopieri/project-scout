# HANDOFF ARQUITETO — F4.2 proposta de reparo segura

## Por quê (amarra à arquitetura)

F4.1 identifica a classe da falha, mas ainda não produz uma unidade revisável
de reparo. Esta fatia cria uma proposta limitada ao connector, com fixture,
canary, orçamento e rollback explícitos. A proposta é somente um artefato
`PROPOSED`; não contém código executável e nunca é aplicada automaticamente.

## O que fazer

- Em `packages/schemas/src/index.ts`, adicionar schemas/types para:
  - proposta versionada `repair-proposal.v1`;
  - status `PROPOSED`, `APPROVED`, `REJECTED`, `ROLLED_BACK`;
  - input limitado a `source`, `provider`, classe/código F4.1, resumo da
    mudança, pelo menos uma fixture, canary de 0–25%, orçamento de no máximo
    10 execuções/3600 segundos e condições de rollback.
- O contrato deve conter `requiresHumanApproval: true` e
  `executable: false` como literais. Não aceitar patch body, shell, caminho
  arbitrário, segredo, credencial ou prompt no schema.
- Em `packages/domain/src/index.ts`, exportar o tipo e uma porta pura para
  construir propostas.
- Criar `packages/collection/src/RepairProposalBuilder.ts` com função/classe
  pura que valide o input e gere uma proposta `PROPOSED`, sempre limitada ao
  `source/provider` recebido e preservando o código estável da classificação.
- Exportar o builder pelo package de collection.
- Criar `tests/f4-repair-proposal.test.ts` cobrindo sucesso, limites de canary
  e orçamento, ausência de fixture, tentativa de inserir `executable: true`,
  payload externo malformado e preservação de escopo.

## Restrições

- Não adicionar migration, banco, fila, LLM, executor, patch, shell, secrets,
  tráfego live ou alteração no `CollectionTaskProcessor`.
- Não permitir status aprovado por input; o builder só produz `PROPOSED`.
- Todo input/saída passa por Zod; não usar `any`.
- Preserve F4.1 e comportamento anterior; diff pequeno, cerca de 300 linhas.
- O workspace não possui `.git`; não inventar commit.
- Rodar teste focado, typecheck e lint; avisar quando terminar com resumo,
  arquivos, validação e limitações.

## DoD (Definition of Done — falsificável)

1. Builder produz proposta versionada, `PROPOSED`, não executável e com
   aprovação humana obrigatória.
2. Canary acima de 25%, orçamento acima dos limites ou ausência de fixture
   falham antes de qualquer efeito externo.
3. O builder não aceita patch body, shell, secret ou mudança de connector.
4. Testes focados, typecheck e lint passam; regressão de F4.1 continua verde.

## O que isto prova e o que NÃO prova

Prova que uma proposta segura e revisável pode ser representada
deterministicamente. Não prova que o reparo é correto, que uma fixture cobre
produção ou que qualquer proposta deve ser aprovada/executada.

### Onde isto pode dar errado

- Um resumo de mudança pode descrever uma solução errada; a unidade não tenta
  inferir causa raiz.
- Canary e orçamento são limites declarativos até existir o executor sandbox.
- Uma fixture fraca pode aprovar uma proposta que falha em tráfego real.
