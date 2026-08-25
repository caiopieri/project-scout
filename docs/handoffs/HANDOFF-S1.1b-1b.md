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

## Segundo fato, observado depois (sonda do engenheiro, 2026-08-24)

Uma segunda execução live gastou as 210 chamadas (3 buscas + 207 detalhes, todas
HTTP 200, `requestNumber` de 1 a 210 contra `maxRequests` 210) e persistiu apenas
**3 anúncios** antes de o processo do Worker morrer. A execução ficou
**`running` para sempre**: `finished_at` nulo, contadores zerados, nenhum
`error_code`, e o lease venceu sem ninguém reivindicar de volta.

Isto acrescenta um sintoma ao anterior e muda o alvo da fatia: além de escrever
em volume, é preciso **terminar** a execução. Consumidor que morre no meio deixa
execução órfã, e nenhum caminho a recupera.

## Decisão após a medição local de 2026-08-25

A medição não reproduziu o caminho live de triagem e, portanto, **não refutou**
o diagnóstico de volume. Encontrou duas lacunas adjacentes que não entram neste
corte: orçamento ausente do `wrangler.toml` e ausência de heartbeat do lease.

O contrato de orfandade fica fechado: uma execução só é órfã quando já está
`running`, o lease venceu **e** a mensagem atual é uma reentrega da fila
(`attempts > 1`). Nesse caso termina `failed`, com
`COLLECTION_RUN_ORPHANED`, sem chamar o connector. Lease vencido sozinho não
encerra nem reivindica a execução. Se não for possível preservar esta condição
sem corrida usando as portas existentes, a implementação para e volta ao
arquiteto; não se introduz migration ou heartbeat por atalho.

## Pronto quando

1. Uma coleta real de ≥100 anúncios termina `completed`, com os contadores da
   execução preenchidos (`items_found`, criados, atualizados) — não zero.
2. `GET /api/projects/:id/listings` devolve os ≥100 anúncios sem 414, com
   paginação de resposta se necessário.
3. Gravação de triagem deixa de ser uma requisição por anúncio: lote, com
   tamanho de lote explícito.
4. Leitura por lista de IDs é fatiada em blocos de tamanho explícito. Nenhuma URL
   cresce com o número de anúncios do projeto.
5. **Execução órfã termina explicitamente.** Somente uma mensagem reentregue
   (`attempts > 1`) diante de run `running` com lease vencido encerra como
   `failed/COLLECTION_RUN_ORPHANED`, sem chamar o connector. Lease ativo, lease
   ausente ou primeira entrega não encerram a run.
6. **Retry não regasta o orçamento inteiro.** Falha transitória depois que a
   coleta já retornou torna a execução terminal com o código causal preservado;
   não há nova chamada ao eBay. Falha transitória anterior à coleta conserva o
   retry limitado existente.

Evidência exigida: **live** — uma execução real `completed` com ≥100 anúncios,
contadores preenchidos, e a contagem de chamadas ao eBay igual a uma tentativa.

## Contrato

- Sem migration nova. As tabelas existem.
- O Worker entrega ao processador o número de tentativas da mensagem; valor
  ausente ou inválido é tratado conservadoramente como primeira entrega. A
  propriedade oficial `Message.attempts` começa em 1 e cresce a cada tentativa
  de entrega.
- O caminho de claim não pode reivindicar run já `running` antes de classificar
  lease e reentrega. Corrida com conclusão concorrente deve falhar fechado sem
  sobrescrever estado terminal.
- Os limites são constantes nomeadas de valor 50:
  `TRIAGE_DECISION_BATCH_SIZE` e `LISTING_ID_BATCH_SIZE`. POSTs e leituras são
  sequenciais; a leitura recompõe a ordem original após juntar os blocos.
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
- Configurar orçamento base no `wrangler.toml` e introduzir/renovar heartbeat de
  lease. São achados reais da medição, mas não explicam a falha live e ampliam o
  contrato operacional; voltam como fatia própria se continuarem necessários.
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
- **Recuperar execução órfã pode duplicar coleta.** Se o lease vencido devolve à
  fila e a tentativa anterior já gravou parte dos anúncios, a segunda tentativa
  recoleta e regasta a quota. A idempotência por `(source_id, external_id)`
  protege o banco, não a conta do eBay.
- **Escolher "termina como falha" em vez de "volta para a fila" é aceitável e
  provavelmente melhor aqui**, justamente por causa da quota. Decidir de
  propósito e escrever o porquê.
- **O retry gastando quota é o risco de dinheiro, não de código.** Enquanto isso
  não fechar, cada execução malsucedida custa 3× a quota diária do eBay.
