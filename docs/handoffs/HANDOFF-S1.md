# HANDOFF-S1 — eBay sai do mock

> Primeira fatia depois da reestruturação de 2026-08-17. Ler antes:
> [AGENTS.md](../../AGENTS.md), [docs/status.md](../status.md),
> [ROADMAP.md](../../ROADMAP.md).

## Objetivo

Fazer uma pesquisa real do Caio coletar anúncios reais do eBay e persistir no
banco, com custo de chamadas medido e limite respeitado.

## Pronto quando

Executar, com credencial Production server-side:

1. Criar um projeto de pesquisa pela API com um critério real
   (ex.: MacBook com tela quebrada, teto de preço).
2. Disparar `POST /api/projects/:id/collection-runs`.
3. O run termina `completed` com `found/created/updated` diferentes de zero.
4. `GET /api/projects/:id/listings` devolve anúncios que **existem de verdade no
   eBay** — conferidos abrindo a URL de pelo menos 3 deles.
5. A telemetria mostra quantas chamadas foram gastas e onde o orçamento parou.
6. Nenhum segredo aparece em log.

Evidência exigida no `LOG-VERIFICACAO.md`: nível **live**.

## Contrato

- Nada de schema novo. Nada de porta nova. Esta fatia é de **configuração,
  limite e observabilidade**, não de código de domínio.
- `EBAY_CONNECTOR_MODE` sai de `mock` para `production` de forma explícita e
  reversível, primeiro em ambiente local.
- Production já falha fechado sem `EBAY_RATE_LIMITER` e sem
  `EBAY_GLOBAL_REQUESTS_PER_MINUTE` — mantenha assim.
- O teto atual do gateway fora do mock é
  `{ maxPages: 1, pageSize: 5, maxItems: 4, maxQueries: 1 }`. Só aumente depois
  de medir a quota efetiva, e registre o número medido.

## Caminho de usuário

`apps/web` → criar projeto → disparar coleta → ver a lista de anúncios. Se a
tela ainda não mostra o resultado da coleta, ela entra nesta fatia — sem
caminho de usuário, a fatia não fecha.

## Fora de escopo

- Ranking, score e filtro (é S3).
- LLM e imagem (é S2/S4).
- Qualquer fonte que não seja eBay.
- Deploy remoto de produção e habilitar `/api/*` público.
- Aumentar volume de coleta antes de medir a quota.

## Pré-requisitos do Caio

Credencial Production do eBay já existe e o smoke passou em 2026-08-15. Para
rodar esta fatia:

1. Confirme que `apps/worker/.dev.vars` tem `EBAY_APP_ID_CLIENT_ID` e
   `EBAY_CERT_ID_CLIENT_SECRET` de **Production** (portal:
   developer.ebay.com → My Account → Application Keysets).
2. Defina `EBAY_CONNECTOR_MODE=production` e
   `EBAY_GLOBAL_REQUESTS_PER_MINUTE` no mesmo arquivo (comece com `10`).
3. `npm run db:start && npm run db:migrate`
4. `npm run ebay:smoke` — precisa retornar item antes de qualquer coleta.

## Onde isto pode dar errado

- **A quota real do eBay é desconhecida.** O orçamento de 6 chamadas foi
  escolhido por prudência, não por medição. Subir o limite às cegas queima a
  aplicação; a fatia inclui medir, não chutar.
- **4 itens por run é pouco para avaliar qualidade de garimpo.** Vai parecer que
  o sistema "não acha nada". Isso é limite de segurança, não defeito — resista à
  tentação de subir antes do passo 5.
- **Coleta real cria dado real no banco**, com custo de storage e implicação de
  privacidade do eBay (o webhook de deleção precisa continuar funcionando).
- **O filtro local de títulos pode rejeitar candidato bom.** Ele hoje bloqueia
  peça e acessório antes de buscar detalhe; se um MacBook legítimo for descartado,
  registre o caso em vez de afrouxar o filtro no susto.
- A telemetria é por isolate: em execução distribuída ela não soma o consumo
  global. Para esta fatia local isso basta; para produção, não.
