# HANDOFF ARQUITETO — F6.2 auditoria owner-scoped do rascunho

## Por quê (amarra à arquitetura)

O rascunho F6.1 precisa sobreviver à troca de tela e ser auditável pelo
proprietário, mas ainda não pode virar mensagem enviada. Esta unidade adiciona
somente armazenamento interno do contexto/sugestão já validados, com isolamento
por usuário e leitura humana; não cria transporte nem aprovação automática.

## O que fazer

- Adicionar em `packages/schemas/src/index.ts` um `negotiationDraftSchema`
  estrito contendo `id`, `userId`, `context`, `suggestion` e `createdAt`.
- Adicionar em `packages/domain/src/index.ts` a porta
  `NegotiationDraftRepository` com `save(userId, context, suggestion)` e
  `findByUserId(userId)`.
- Criar uma migration nova via `npx supabase migration new` para a tabela
  `public.negotiation_drafts` com:
  - UUID, `user_id` UUID, `context_id` UUID, source/external_id/currency,
    preços inteiros em minor units, snapshots JSONB de contexto e sugestão e
    `created_at`;
  - constraints de moeda, fontes permitidas, valores não negativos e os três
    invariantes `requires_human_review=true`, `sent=false`, `executable=false`;
  - índice `(user_id, created_at DESC)`;
  - RLS habilitada, `SELECT` apenas para `authenticated` quando
    `(select auth.uid()) = user_id`, escrita apenas para `service_role`, sem
    `SECURITY DEFINER`.
- Implementar `PgNegotiationDraftRepository` com SQL parametrizado, parse Zod
  no save/read e snapshots JSONB; exportar pelo package database.
- Criar teste unitário do adapter e integração RLS. A integração deve provar
  que service_role grava, proprietário lê, usuário diferente não lê e
  authenticated não insere/edita/exclui.
- Atualizar `LOG-VERIFICACAO.md`, `docs/roadmap.md` e `docs/security-DoD.md`
  somente depois da migration aplicada, advisors limpos e testes passarem.

## Restrições

- Usar somente a CLI Supabase oficial para nomear/aplicar migration; migration
  aditiva, sem reset destrutivo ou `apply_migration` para iteração.
- Persistir apenas contratos já validados; não aceitar snapshot arbitrário,
  credencial, segredo, comando, payment, bid ou send.
- Nenhum endpoint, RPC público, connector, fila, LLM ou envio.
- `service_role` permanece server-side; leitura owner-scoped usa RLS.
- Diff pequeno, sem artefatos `dist` ou segredo.

## DoD (Definition of Done — falsificável)

1. Migration aplica do zero e `supabase migration list --local` mostra local e
   remoto alinhados para a nova migration.
2. Adapter valida os dois snapshots e usa placeholders, sem interpolar input.
3. Teste live prova gravação interna, leitura do proprietário e isolamento de
   outro usuário; authenticated não possui escrita.
4. `npm run db:test`, `npm test`, `npm run typecheck`, `npm run lint` e advisors
   de segurança locais passam.

## O que isto prova e o que NÃO prova

Prova persistência e isolamento da auditoria do rascunho. Não prova que o
proprietário aprovou uma mensagem, que existe transporte ou que qualquer
mensagem será enviada.

### Onde isto pode dar errado

- Snapshot JSONB pode ficar desatualizado em relação ao anúncio; F6.3 deve
  definir revalidação/expiração antes de qualquer uso.
- A leitura owner-scoped não substitui autenticação correta no endpoint futuro.
- Retenção, exclusão por privacidade e consentimento do vendedor ainda exigem
  revisão humana e jurídica.
