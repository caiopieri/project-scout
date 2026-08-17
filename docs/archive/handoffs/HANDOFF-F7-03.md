# HANDOFF ARQUITETO — F7.3 ledger de idempotência sem executor

## Por quê (amarra à arquitetura)

O gate F7.2 recebe `alreadyConsumed` de fora; sem um ledger persistente, dois
consumidores podem aceitar o mesmo envelope. Esta unidade grava o envelope
pendente e registra consumo de forma owner-scoped, sem executar a ação.

## O que fazer

- Adicionar schema estrito `AuthorizationLedgerRecord` com id, usuário,
  envelope, status (`PENDING`, `CONSUMED`, `EXPIRED`), timestamps e
  `consumedAt` coerente.
- Adicionar porta `AuthorizationLedgerRepository` com `record`,
  `findByUserId` e `markConsumed`.
- Criar migration via CLI oficial para tabela `authorization_envelope_ledger`:
  - owner UUID, authorization/idempotency únicos por usuário, envelope JSONB,
    status e timestamps;
  - RLS, SELECT owner-scoped para authenticated, escrita somente
    `service_role`, constraints que preservem `humanApproved=false` e
    `executable=false`;
  - `markConsumed` no adapter deve ser SQL parametrizado e não executar ação.
- Implementar `PgAuthorizationLedgerRepository`; idempotency key repetida com
  envelope diferente deve falhar, repetição idêntica deve retornar o registro
  existente.
- Testar adapter, migration, service-role write, owner read, cross-tenant
  isolation e authenticated write denial. Adicionar o teste ao `db:test`.
- Não criar executor, RPC público, sessão real, assinatura criptográfica,
  compra, bid, pagamento, mensagem ou conector.

## Restrições

- Migration aditiva criada por `npx supabase migration new`; aplicar e verificar
  advisors/lista local.
- Persistir snapshots já validados; não aceitar segredos, comandos ou payload
  externo arbitrário.
- Sem `SECURITY DEFINER`, sem `service_role` no browser e sem reset destrutivo.

## DoD (Definition of Done — falsificável)

1. Ledger aplica do zero, tem RLS e consultas owner-scoped.
2. Chave idempotente repetida é estável; envelope divergente é rejeitado.
3. Consumo muda somente o estado do ledger e não produz efeito externo.
4. Testes focados, `db:test`, suíte completa, advisors, typecheck, lint e
   Prettier passam.

## O que isto prova e o que NÃO prova

Prova persistência e isolamento da intenção/consumo. Não prova sessão
autenticada local, assinatura criptográfica, lock distribuído durante execução
ou segurança de uma ação financeira.

### Onde isto pode dar errado

- Sem executor e assinatura, o ledger é auditoria, não autorização.
- Concorrência de consumidores ainda precisa de transação/lock revisado antes
  de qualquer uso vinculante.
- Retenção e exclusão de envelopes exigem política de privacidade própria.
