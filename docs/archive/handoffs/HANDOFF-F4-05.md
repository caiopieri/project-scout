# HANDOFF ARQUITETO — F4.5 persistência de resultados sandbox

## Por quê

F4.4 executa replay local de forma limitada e reversível, mas seu resultado
desaparece após o processo. Esta unidade adiciona histórico interno dos runs
para auditoria e futura observabilidade, sem transformar o runner em executor
live.

## O que fazer

- Criar migration com o fluxo oficial `npx supabase migration new` para
  `collector_repair_runs`, contendo somente:
  - `id`, `proposal_version`, `proposal_source`, `proposal_provider`,
    `status`, `environment`, `fixture_results`, `executed_count`,
    `passed_count`, `failed_count`, `canary_used`, `rollback_applied`,
    `executable`, `created_at`;
  - checks: status `COMPLETED`/`ROLLED_BACK`, environment `sandbox`, contagens
    0–10, canary 0–25, `executable=false`, JSONB de resultados como array;
  - RLS habilitado, `anon`/`authenticated` sem privilégios, `service_role`
    como único acesso.
- Adicionar em `packages/domain` uma porta interna
  `RepairSandboxRunRepository` com `save` e leitura por source/provider.
- Implementar adapter PostgreSQL em `packages/database`, validando
  `repairSandboxRunResultSchema` antes de inserir e ao ler, usando SQL
  parametrizado e mapeamento snake_case.
- Adicionar teste unitário de SQL/mapping e teste live de RLS service-role-only;
  malformações e campos executáveis devem falhar.
- Atualizar `docs/security-DoD.md`, roadmap e log somente após os testes live.

## Restrições

- Não alterar o runner F4.4 nem o contrato de aprovação.
- Não criar RPC, endpoint browser, fila, worker, executor de patch, LLM, rede,
  proxy, credencial, tráfego live, compra, lance ou pagamento.
- Não usar `SECURITY DEFINER`, `auth.role()` ou `service_role` no browser.
- Não usar `apply_migration` para iterar schema; migration deve ser criada pelo
  CLI oficial. Preservar migrations existentes e manter o diff em ~300 linhas.

## DoD

1. Reset local aplica a migration com checks, RLS e grants corretos.
2. Adapter salva/lê resultado válido e rejeita linha malformada.
3. `anon`/`authenticated` não leem nem escrevem; `service_role` funciona.
4. `npm run db:test`, `npm test`, typecheck, lint e Prettier passam.

## O que isto prova e o que NÃO prova

Prova apenas que o resultado de sandbox pode ser auditado internamente com
contrato validado e privilégio restrito. Não prova execução live, aplicação de
patch, correção da proposta ou autorização financeira.

### Onde isto pode dar errado

- O schema de resultados pode divergir do contrato Zod se migration e adapter
  não forem testados juntos.
- Persistir um `ROLLED_BACK` não executa rollback de connector; é apenas o
  registro do estado seguro produzido pelo runner.
- Histórico service-role-only exige que nenhum caminho browser seja criado.
