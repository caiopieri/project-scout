# HANDOFF-S1.1b-1b-reliability — Fechamento e execução órfã

> Segunda quebra de [S1.1b-1b](./HANDOFF-S1.1b-1b.md). Só abre depois de
> [S1.1b-1b-volume](./HANDOFF-S1.1b-1b-volume.md) mergeada e verificada.

## Objetivo

Impedir recoleta após trabalho pago e terminar explicitamente somente a
execução comprovadamente órfã.

## Pronto quando

1. Falha transitória depois de `gateway.collect` termina a run preservando o
   código causal, sem `releaseForRetry` nem nova chamada ao connector.
2. Run `running` só termina `failed/COLLECTION_RUN_ORPHANED` quando o lease
   venceu e `Message.attempts > 1`; não resolve nem chama o gateway e dá ack.
3. Lease ativo, ausente ou vencido na primeira entrega não encerra a run.
4. Uma coleta live de pelo menos 100 anúncios termina `completed`, com
   contadores preenchidos e chamadas eBay equivalentes a uma tentativa.

Evidência: integração local do cenário de reentrega e **live** do fechamento,
ambas executadas pelo Engenheiro. O Dev não acessa `.dev.vars`.

## Contrato

- O Worker normaliza `Message.attempts` inválido/ausente para 1.
- Antes de claim, o processador lê o estado. Run `running` nunca passa pelo
  claim de `pending`.
- Claim usa PATCH condicional por `status=pending` e `attempt_count` esperado;
  incrementa uma vez, preserva/inicializa `started_at`, fixa lease de cinco
  minutos, limpa `error`, `error_kind` e `error_code`, e valida a representação.
- Resposta vazia é corrida perdida: não chama gateway nem sobrescreve estado.
- Falha concorrente não sobrescreve run já `completed` ou `failed`.
- Queue body continua mínimo/validado; `service_role` permanece só no consumer.
- Se relógio, atomicidade ou semântica divergirem sem migration, a fatia para.

## Caminho de usuário

A rota de coleta existente deixa de mentir: conclui com contadores ou mostra
falha terminal explícita que o usuário reinicia deliberadamente.

## Fora de escopo

- Batching e leitura chunked, já fechados na fatia volume.
- Migration, heartbeat, cron, orçamento no `wrangler.toml` e paralelismo.
- Família de queries, memória de preço, tela, score e outras fontes.

## Onde isto pode dar errado

- PATCH via relógio do Worker pode alterar a semântica do lease; qualquer drift
  observável bloqueia a implementação, em vez de ser aceito como aproximação.
- Uma corrida entre conclusão e falha órfã pode sobrescrever estado terminal se
  a transição não for condicionada e testada no adapter real.
- Reentrega pode não ocorrer na sonda local; não se cria cron para fabricar a
  condição. A prova local controla `attempts` e o estado, e a sonda live prova o
  fechamento sem recoleta.
