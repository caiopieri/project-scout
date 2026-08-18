# HANDOFF-S1.1b — Coleta com volume real

> Depende de [S1.1](./HANDOFF-S1.1.md) fechado. Ler antes:
> [funil-e-risco.md](../funil-e-risco.md) §2 (os dois eixos).
>
> **Por que esta fatia existe.** A S1.1 provou o caminho, mas o teto artificial
> `{ maxPages: 1, pageSize: 5, maxItems: 4, maxQueries: 1 }` faz cada coleta real
> voltar com 4 anúncios. Com 4 anúncios não há garimpo, não há mediana, não há
> decisão — toda fatia depois desta fica sem substrato. O princípio de ordenação
> nº 1 do ROADMAP ("a loja precisa comprar agora") manda esta fatia vir antes da
> S1.2.

## Objetivo

Fazer uma coleta real do eBay devolver centenas de anúncios por execução, dentro
de um orçamento de chamadas explícito, gastando chamada cara só em quem
sobreviveu ao filtro barato.

## Pronto quando

1. Uma coleta real de um projeto de MacBook devolve **≥ 100 anúncios
   persistidos** em uma execução, com URLs reais.
2. O orçamento de chamadas por execução é **configuração explícita**
   (`EBAY_BROWSE_BUDGET_PER_RUN`), não constante no código. Ausente em
   `production` → falha fechado, como já é a regra do rate limit.
3. A busca pagina de verdade: mais de uma página de `item_summary/search`, com
   `pageSize` no máximo permitido pela fonte, até acabar o resultado ou o
   orçamento.
4. A família de queries é usada: **mais de uma query por execução** (o gerador
   determinístico já existe em `packages/search-intelligence`).
5. **Camada 1 antes da camada 2.** A chamada de detalhe (`/item/`) só acontece
   para o anúncio que sobreviveu ao filtro barato feito sobre o resultado da
   busca (faixa de preço, correspondência de título, defeito rejeitado). O que
   morreu na camada 1 é registrado como decisão de triagem, não como detalhe
   buscado.
6. A telemetria da S1.1 continua funcionando e agora mostra
   `requestNumber/maxRequests` contra o orçamento novo, sem segredo.
7. Orçamento esgotado **não** é falha: a execução termina `completed` com o que
   coletou e registra que foi truncada.

Evidência exigida: **live** — uma execução real, com contagem de anúncios
persistidos, número de chamadas gastas e 3 URLs conferidas.

## Contrato

- O teto vive no manifesto do connector e no orçamento por execução, **não**
  espalhado em literal dentro de `apps/worker/src/index.ts`.
- `DefaultCollectionGateway` continua a fronteira. Nenhuma regra de eBay sobe
  para o núcleo.
- O filtro da camada 1 usa o critério estruturado do projeto que já existe
  (`researchCriteriaSchema`). Nada de critério novo nesta fatia.
- Nenhuma mudança de schema de banco. `listing_triage_decisions` já existe.
- Reserva no rate limiter continua por chamada. Paginar não pode contornar o
  limitador.

## Caminho de usuário

`POST /api/projects/:id/collection-runs` seguido de
`GET /api/projects/:id/listings` devolve centenas de anúncios, não 4. É a mesma
rota da S1.1 — o efeito é que ela passa a ser útil.

## Fora de escopo

- Ranqueamento, score, mediana, custo total — S3.x.
- Imagem, IA, checkup visual — S2/S4.
- Qualquer outra fonte — S5.
- Paralelizar chamadas. Nesta fatia é sequencial; concorrência interage com o
  limitador e é fatia própria se virar gargalo.

## Onde isto pode dar errado

- **Quota diária do eBay.** Subir de 6 para ~250 chamadas por execução multiplica
  o consumo por 40. Com Browse em 5.000/dia, são ~20 execuções por dia. O
  orçamento por execução precisa ser conservador por padrão e o consumo diário
  precisa aparecer em algum lugar — se não aparecer nesta fatia, é dívida
  registrada, não esquecida.
- **Filtro barato demais descarta o achado.** Título no eBay mente e mente para
  os dois lados; um filtro de título agressivo mata justamente o anúncio mal
  anunciado que é a oportunidade. Na dúvida, a camada 1 deixa passar — custo de
  falso positivo é uma chamada, custo de falso negativo é perder o negócio.
- **Volume sem memória de preço é desperdício.** Se a S1.2 demorar, coletamos
  centenas de anúncios e não guardamos a série. Esta fatia vem antes por causa da
  utilidade imediata; a S1.2 vem logo atrás por causa do acervo.
- **Truncar silenciosamente vira mentira na tela.** Execução que parou por
  orçamento e se declara `completed` sem dizer que truncou faz o usuário achar
  que viu o mercado inteiro.
