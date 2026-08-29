# HANDOFF-S2.2 — Extração dirigida por schema em lote

## Objetivo

Enviar 10–20 anúncios por chamada LLM, devolver cada resultado identificado e
validado pelo schema do chamador, isolando conteúdo hostil e falha de um item.

## Pronto quando

Uma tarefa de análise com 10–20 IDs é agrupada em um único payload do provedor;
cada item sai com seu `returnId`; um resultado inválido ou referência desconhecida
é rejeitado sem aceitar os vizinhos; e uma falha transitória libera todos os
itens para retry limitado. O caminho continua alcançável pela coleta → fila de
análise existente.

A chamada live ao Gemini, quota efetiva e revisão de privacidade continuam
pendentes de `GEMINI_API_KEY` e aprovação.

## Contrato

- Tarefa: `text-analysis-batch`, versão `1`, contendo somente IDs de
  `analysis_runs`.
- Entrada do provedor: itens com `returnId` e campos de texto delimitados como
  dados não confiáveis; nenhum listing inteiro ou credencial fora do payload
  estritamente necessário.
- Saída: `{ items: [{ returnId, value }] }`; `returnId` deve ser único e
  corresponder exatamente ao conjunto enviado.
- Schema: JSON Schema do chamador no request e parser Zod do chamador na saída.
- Tamanho: 10–20 itens por requisição; lote residual menor que 10 é permitido
  somente no fim da fila para não perder anúncios.

## Caminho de usuário

Coleta persistida → `TextAnalysisQueueScheduler` → `analysis-queue` →
`TextAnalysisBatchTaskProcessor` → persistência individual de evidência/defeito.

## Fora de escopo

- Prompt de intenção, análise de imagem, ranking ou ação vinculante.
- Gerar código de connector.
- Fazer fallback que apresente dado determinístico como resposta LLM.

## Onde pode dar errado

- O provedor pode omitir, duplicar ou inventar `returnId`; o agregador deve falhar
  fechado antes de persistir.
- Um item malicioso pode tentar alterar o schema ou instruir o modelo; cada item
  precisa de envelope estrito e a saída precisa de validação independente.
- Batches grandes podem exceder contexto ou quota; tamanho, timeout e retry
  precisam permanecer limitados.
