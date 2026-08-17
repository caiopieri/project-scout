# HANDOFF ARQUITETO — F4.4 sandbox, replay, canary e rollback

## Por quê

F4.1–F4.3 classificam falhas, constroem propostas não executáveis e guardam
histórico interno. Esta unidade fecha o primeiro ciclo operacional em sandbox:
reproduzir fixtures, aplicar um canary determinístico limitado, medir o
resultado e marcar rollback quando o replay falhar. Nenhum patch será aplicado
e nenhum tráfego de marketplace será iniciado.

## O que fazer

- Em `packages/schemas`, criar contratos Zod estritos para:
  - entrada de execução: `proposal`, `environment: 'sandbox'`, aprovação humana
    explícita (`approved: true`), canary e orçamento limitados ao contrato F4.2;
  - resultado por fixture: `fixtureId`, `passed`, `failureClass` opcional e
    duração não negativa;
  - resultado agregado: `COMPLETED` ou `ROLLED_BACK`, contagens, canary usado,
    `rollbackApplied` e `executable: false`.
- Em `packages/domain`, adicionar a porta `RepairSandboxRunner`. A porta deve
  receber uma função de replay fornecida pelo chamador, sem conhecer shell,
  patch, secrets, filesystem ou rede.
- Em `packages/collection`, implementar `RepairSandboxRunner` como orquestrador
  puro e determinístico:
  - aceitar somente proposta `status: APPROVED`, `requiresHumanApproval: true`
    e `executable: false`;
  - rejeitar `environment` diferente de `sandbox`, aprovação ausente, proposta
    inválida e orçamento/canary fora dos limites;
  - selecionar fixtures de forma determinística, sem aleatoriedade, e nunca
    ultrapassar 25% nem `maxExecutions`;
  - executar apenas o callback de replay sobre fixtures já fornecidas;
  - qualquer falha de replay produz `ROLLED_BACK`, sem tentar novamente e sem
    mutar a proposta, connector, banco, fila ou secrets;
  - não interpretar texto livre de rollback como comando; rollback deve ser um
    resultado determinístico do estado de replay.
- Adicionar testes unitários para: aprovação obrigatória, bloqueio de produção,
  seleção determinística, limite de orçamento, sucesso, falha com rollback,
  callback malformado e garantia de que o runner não recebe nem gera patch,
  shell ou secret.
- Atualizar a documentação F4 somente depois de os testes passarem.

## Restrições

- Não criar migration nesta unidade; a persistência de resultados será uma
  fatia posterior se necessária, sem misturar com o executor sandbox.
- Não chamar eBay, Mercado Livre, Xianyu, LLM, browser, proxy ou rede.
- Não adicionar endpoint, RPC, fila, worker, cron, aprovação automática,
  execução live, compra, lance ou pagamento.
- Não aceitar `patchBody`, `shell`, `command`, `secret`, `credential` ou campos
  desconhecidos nos contratos.
- Manter o diff em aproximadamente 300 linhas e preservar F4.1–F4.3.

## DoD

1. `RepairSandboxRunner` só roda proposta aprovada explicitamente em
   `sandbox` e sempre retorna `executable: false`.
2. Replay é determinístico, limitado por canary/orçamento e falha fechada.
3. Uma falha de fixture gera rollback verificável sem mutações externas.
4. Testes focados, suíte completa, typecheck, lint e formatação passam.

## O que isto prova e o que NÃO prova

Prova que o ciclo de replay local é limitado, reproduzível e reversível em
sandbox. Não prova que um patch é correto, que um connector live funciona, que
uma proposta pode ser aplicada em produção ou que qualquer ação financeira é
permitida.

### Onde isto pode dar errado

- Um callback de replay ainda pode ter efeitos colaterais se um chamador o
  construir incorretamente; esta unidade deve manter o runner sem rede e exigir
  fixtures locais nos testes.
- Canary sobre poucas fixtures não representa tráfego real e pode dar falsa
  confiança.
- `approved: true` é um gate de contrato interno, não uma assinatura de
  autorização; aprovação persistente e auditoria pertencem a uma etapa própria.
