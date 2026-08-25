# HANDOFF-S1.1b-1b-volume — Escrita e leitura em volume

> Primeira quebra de [S1.1b-1b](./HANDOFF-S1.1b-1b.md). O diff conjunto chegou
> a 417 inserções antes de commit; esta fatia preserva o limite natural de I/O.

## Objetivo

Persistir decisões de triagem e ler listings em volume sem uma requisição por
item nem URL proporcional ao tamanho do projeto.

## Pronto quando

1. Uma coleta live persiste pelo menos 100 anúncios e suas decisões; o caminho
   usa lotes sequenciais `50/50/resto`, sem POST por anúncio.
2. `GET /api/projects/:id/listings` devolve os pelo menos 100 anúncios sem 414;
   cada consulta contém no máximo 50 IDs e a ordem original é recomposta.
3. Testes cobrem 123 registros, falha no segundo lote e interrupção observável
   sem descarte silencioso ou paralelismo.

Evidência de implementação: fixture e gate completo. Fechamento da fatia:
**live**, executado pelo Engenheiro; o Dev não acessa `.dev.vars`.

## Contrato

- `TriageDecisionRepository.saveMany` recebe entrada tipada.
- `TRIAGE_DECISION_BATCH_SIZE = 50`; arrays JSON e POSTs sequenciais.
- `LISTING_ID_BATCH_SIZE = 50`; leituras sequenciais e ordem restaurada após
  juntar os blocos.
- Erro do lote preserva causa/status e interrompe os lotes seguintes.
- Sem mudança de lifecycle, claim, retry, fila, migration ou configuração.

## Caminho de usuário

A rota de coleta existente grava os dados; a rota existente
`GET /api/projects/:id/listings` permite ao usuário ler o conjunto completo.

## Fora de escopo

- Claim, lease, órfão e retry pós-coleta → S1.1b-1b-reliability.
- Heartbeat e orçamento no `wrangler.toml`.
- Família de queries, memória de preço, tela, score e outras fontes.

## Onde isto pode dar errado

- Lote atômico pode perder até 50 decisões por um item inválido; o erro deve ser
  visível e nenhum lote posterior roda em silêncio.
- Juntar blocos na ordem de resposta embaralha o feed; a ordem vem dos links do
  projeto, não do PostgreSQL.
- A sonda live ainda pode expor outra causa de término do Worker. Nesse caso a
  fatia não fecha e volta ao arquiteto; não se amplia o diff por diagnóstico.
