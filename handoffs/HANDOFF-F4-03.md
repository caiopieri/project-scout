# HANDOFF ARQUITETO — F4.3 persistência isolada de propostas

## Por quê (amarra à arquitetura)

F4.2 gera um artefato seguro, mas sem histórico não existe auditoria nem base
para replay/canary. Esta unidade adiciona a tabela e o repositório interno
para guardar propostas, mantendo escrita e leitura fora do navegador. Nenhuma
proposta será aprovada, executada ou enviada para fila nesta unidade.

## O que fazer

- Criar a migration pelo fluxo oficial do Supabase (`supabase migration new`)
  para `collector_repair_proposals` com:
  - `id`, `version`, `status`, `source`, `provider`, `failure_class`,
    `stable_code`, `change_summary`, `fixtures`, `canary_percentage`,
    `max_executions`, `window_seconds`, `rollback_conditions`,
    `requires_human_approval`, `executable`, `created_at`;
  - checks coerentes com F4.2: status permitido, canary 0–25, orçamento
    1–10/1–3600, aprovação `true`, executável `false`;
  - RLS habilitado, `anon`/`authenticated` sem privilégios e `service_role`
    como único acesso.
- Em `packages/domain/src/index.ts`, adicionar `RepairProposalRepository`
  com `save` e leitura interna por source/provider.
- Criar `packages/database/src/repositories/pg/PgRepairProposalRepository.ts`
  que valide schema antes de SQL, use parâmetros, mapeie snake_case para o
  contrato e não persista campos além do contrato.
- Exportar o adapter pelo package de database.
- Adicionar teste unitário de SQL/mapeamento e teste de banco cobrindo migration,
  write/read service-role e negação de leitura/escrita autenticada.
- Atualizar `docs/security-DoD.md` somente após os testes live de RLS passarem.

## Restrições

- Usar Supabase CLI para nomear a migration; não usar `apply_migration` para
  iterar schema e não inventar timestamp/nome.
- Não criar RPC pública, view, endpoint browser, fila, executor, aprovação,
  LLM, patch, secret, tráfego live ou F5–F7.
- RLS deve seguir o modelo interno existente: service role only; não usar
  `auth.role()` nem `SECURITY DEFINER`.
- Toda linha lida do banco passa por `repairProposalSchema`; IDs e enumerações
  são validados antes de interpolar qualquer URL/SQL.
- Preservar F4.1/F4.2 e manter diff em ~300 linhas; workspace não possui Git.

## DoD (Definition of Done — falsificável)

1. Migration resetada do zero cria a tabela com checks, RLS e grants corretos.
2. Adapter salva/lê uma proposta válida e rejeita linha malformada.
3. `anon` e `authenticated` não conseguem ler nem escrever; service role
   consegue fazer as operações internas.
4. Testes unitários, `npm run db:test`, typecheck e lint passam.

## O que isto prova e o que NÃO prova

Prova que propostas podem ser auditadas com isolamento de privilégios. Não
prova que alguma proposta é correta, aprovada, executável ou segura em produção;
replay/canary/rollback pertencem ao próximo executor sandbox.

### Onde isto pode dar errado

- Um check SQL pode divergir do Zod se os dois contratos não forem testados
  juntos.
- `service_role` bypassa RLS, então o adapter interno exige disciplina de
  wiring no Worker.
- Persistir uma proposta não significa que a organização autorizou sua
  execução.
