# HANDOFF-S1.1b-1b — Caminho de escrita em volume

> Fatia descoberta em execução live, não planejada. Depende de
> [S1.1b-1](./HANDOFF-S1.1b-1.md) revisada e mergeada.

## O fato que originou esta fatia

Com o teto de coleta removido, uma execução real do eBay gastou 210 chamadas
Browse, paginou de verdade (offsets 0, 100, 200) e **persistiu 207 anúncios
reais**, legíveis por `GET /api/projects/:id/listings`. Mesmo assim a execução
terminou `failed` com `TRIAGE_PERSISTENCE_UNAVAILABLE`, e os contadores da
execução ficaram em zero.

Diagnóstico parcial já feito:

- 712 linhas entraram em `listing_triage_decisions` — a escrita funciona.
- `CollectionTriageService.process` grava **um POST HTTP por anúncio**, em série.
  Com 200 anúncios são 200 requisições dentro de uma única invocação de Worker,
  somadas a ~210 do eBay e ~200 de ingestão.
- `SupabaseRestListingRepository.findByProjectId` monta `listings?id=in.(...)`
  com todos os IDs do projeto. Com 200 anúncios a URL já devolveu **414**.
- A execução falhou 3 vezes por retry transitório, e **cada tentativa gastou o
  orçamento inteiro de 210 chamadas** — 630 chamadas ao eBay para uma execução
  que não fechou.

O núcleo de coleta funciona em volume. O caminho de escrita e leitura, não.

## Pronto quando

1. Uma coleta real de ≥100 anúncios termina `completed`, com os contadores da
   execução preenchidos (`items_found`, criados, atualizados) — não zero.
2. `GET /api/projects/:id/listings` devolve os ≥100 anúncios sem 414, com
   paginação de resposta se necessário.
3. Gravação de triagem deixa de ser uma requisição por anúncio: lote, com
   tamanho de lote explícito.
4. Leitura por lista de IDs é fatiada em blocos de tamanho explícito. Nenhuma URL
   cresce com o número de anúncios do projeto.
5. **Retry não regasta o orçamento inteiro.** Uma tentativa que já coletou não
   recoleta do zero, ou o retry é negado para falha pós-coleta. Escolher e
   justificar — as duas saídas são aceitáveis, gastar 3× a quota não é.

Evidência exigida: **live** — uma execução real `completed` com ≥100 anúncios,
contadores preenchidos, e a contagem de chamadas ao eBay igual a uma tentativa.

## Contrato

- Sem migration nova. As tabelas existem.
- O limite de lote é constante nomeada, não número solto no meio da função.
- `TRIAGE_PERSISTENCE_UNAVAILABLE` continua transitório, mas a causa original já
  é preservada na mensagem (feito na S1.1b-1) — não voltar a engolir.
- Nada de paralelizar chamadas para "ir mais rápido". Lote reduz requisição;
  concorrência mexe com o limitador e é outra fatia.

## Caminho de usuário

Mesma rota da S1.1. O que muda: a execução deixa de mentir. Hoje ela grava 207
anúncios e se declara `failed` com contador zero.

## Fora de escopo

- Família de queries e filtro de camada 1 → S1.1b-2.
- Memória de preço → S1.2. Tela → S1.3.
- Score, mediana, custo, IA, imagem, outras fontes.

## Onde isto pode dar errado

- **Lote esconde erro individual.** Inserção em lote que falha por causa de um
  anúncio ruim derruba 50 bons junto. Decidir se o lote é atômico ou parcial, e
  registrar o que caiu — nunca descartar em silêncio.
- **Fatiar leitura muda a ordem.** Se os blocos voltam fora de ordem, a lista do
  usuário embaralha entre recarregamentos. A ordem tem que ser reimposta depois
  de juntar os blocos.
- **O limite real pode não ser o que eu diagnostiquei.** O diagnóstico acima é
  parcial: eu vi 414 na leitura e vi a escrita um-a-um, mas não isolei a causa
  exata do `TRIAGE_PERSISTENCE_UNAVAILABLE`. Pode ser limite de sub-requisições
  do Worker, tempo de CPU, ou outra coisa. **Medir antes de consertar** — se a
  causa for outra, esta fatia muda de forma e volta para o arquiteto.
- **O retry gastando quota é o risco de dinheiro, não de código.** Enquanto isso
  não fechar, cada execução malsucedida custa 3× a quota diária do eBay.
