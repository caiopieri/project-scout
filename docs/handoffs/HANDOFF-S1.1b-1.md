# HANDOFF-S1.1b-1 — Orçamento e paginação

> Primeira metade da S1.1b, que foi quebrada em duas por estourar o limite de
> diff. A segunda é [S1.1b-2](./HANDOFF-S1.1b-2.md). Contexto e motivação
> completos em [S1.1b](./HANDOFF-S1.1b.md) — este arquivo é o escopo executável.

## Objetivo

Fazer uma coleta real do eBay devolver centenas de anúncios em vez de 4, dentro
de um orçamento de chamadas explícito e configurável.

## Pronto quando

1. Uma coleta real devolve **≥ 100 anúncios persistidos** em uma execução, com
   URLs reais que abrem.
2. `EBAY_BROWSE_BUDGET_PER_RUN` é configuração explícita. Ausente em
   `production` → falha fechado, com o mesmo padrão de
   `EBAY_RATE_LIMIT_CONFIGURATION_MISSING` que já existe. **Sem literal de
   fallback no código.**
3. A busca pagina de verdade: **mais de uma página** de `item_summary/search`,
   provada por teste no wiring do Worker — não só na unidade do adapter.
4. Orçamento esgotado termina a execução em `completed`, com registro explícito
   de que foi truncada. Não é falha, e também não pode se apresentar como
   varredura completa.
5. Telemetria da S1.1 continua sanitizada e agora conta contra o orçamento novo.

Evidência exigida: **live** — uma execução real, com contagem de anúncios
persistidos, chamadas gastas e 3 URLs conferidas. **A sonda live é executada
pelo Engenheiro, nunca pelo Dev** (ver §"Fora de escopo").

## Contrato

- O teto vive no manifesto do connector e no orçamento por execução. Nenhum
  literal estrutural espalhado em `apps/worker/src/index.ts`.
- `pageSize` é o máximo que a fonte permite (eBay Browse: 200), não um número
  escolhido à mão.
- O teste de paginação precisa usar limite **maior que `pageSize`**. Um limite de
  167 contra `pageSize` 200 nunca produz segunda página e não prova nada.
- O núcleo não conhece o código de erro do eBay. `EBAY_REQUEST_BUDGET_EXHAUSTED`
  não sobe para `packages/collection`; o gateway traduz para um estado genérico
  de truncamento.
- Nenhuma migration nova.
- **Teste existente vermelho se conserta no código.** `milestone4-worker` hoje
  espera 4 gravações de raw e passa a ver 5. Se 5 for o comportamento correto,
  isso é uma mudança de contrato que precisa de justificativa escrita ao
  Engenheiro — não de edição silenciosa da expectativa.

## Caminho de usuário

`POST /api/projects/:id/collection-runs` → `GET /api/projects/:id/listings`
devolve centenas de anúncios. Mesma rota da S1.1; o que muda é que ela passa a
ser útil.

## Fora de escopo

- Família de queries e filtro de camada 1 → **S1.1b-2**.
- Ranqueamento, mediana, custo total, imagem, IA, outras fontes.
- **Rodar a sonda live.** O Dev não lê, não carrega e não executa
  `apps/worker/.dev.vars`. Se a spec precisa de prova live, quem roda é o
  Engenheiro.

## Onde isto pode dar errado

- **Quota diária do eBay.** ~250 chamadas por execução contra ~5.000/dia dá ~20
  execuções por dia. O padrão precisa ser conservador e o consumo diário vira
  dívida registrada em `docs/status.md` se não for medido aqui.
- **Truncar em silêncio vira mentira na tela.** Execução truncada que se declara
  completa faz o usuário achar que viu o mercado inteiro.
- **Volume sem memória de preço é desperdício.** A S1.2 precisa vir logo atrás,
  ou coletamos centenas de anúncios e não guardamos a série.
- **O teste de raw put mudando de 4 para 5 pode ser sintoma, não detalhe.** Se
  paginação está gravando o raw da página de busca além do raw dos itens, isso
  muda custo de R2 e a semântica do endereçamento por conteúdo. Decidir de
  propósito, não por acidente.
