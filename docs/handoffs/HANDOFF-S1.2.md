# HANDOFF-S1.2 — Memória de preço desde o dia zero

> Depende de [S1.1](./HANDOFF-S1.1.md) fechado. Ler antes:
> [memoria-de-mercado.md](../memoria-de-mercado.md).

## Objetivo

Fazer toda coleta real gravar observação de preço com data, para que o acervo
comece a existir agora. Histórico não se recupera depois.

## Pronto quando

1. Uma coleta real grava uma linha em `price_history` por anúncio observado, com
   preço, moeda, fonte e timestamp da observação.
2. Um snapshot completo é gravado em `listing_snapshots` **apenas quando algo
   relevante muda** — detectado pelo hash canônico do raw que já existe.
3. Recoletar a mesma busca no dia seguinte, sem mudança na fonte, acrescenta
   observação de preço e **não** cria snapshot novo.
4. Um anúncio cujo preço mudou entre coletas produz observação nova **e**
   snapshot novo.
5. Consultar as observações de um anúncio devolve a série em ordem, com as datas.

Evidência exigida: **live** — duas coletas reais em dias (ou execuções)
diferentes, com o resultado das duas colado no log.

## Contrato

- Escrita acontece no consumidor de coleta, dentro da mesma transação da ingestão
  normalizada. Coleta que persiste anúncio e não persiste observação é bug.
- Preço em **inteiro menor** com moeda explícita. Nunca `float`.
- A observação registra o **momento da observação**, não o momento do anúncio.
- Nenhuma métrica, agregação ou mediana nesta fatia. Só gravação. Cálculo é S3.2.
- Nenhuma mudança de schema além do necessário: `price_history` e
  `listing_snapshots` já existem em `20260728160000_initial_schema.sql`. Confira
  antes de criar migration.

## Caminho de usuário

O dossiê/lista mostra a idade da observação ("visto há 2 dias") e, quando houver
mais de uma, a série de preço do anúncio. Sem isso o usuário não alcança a fatia.

## Fora de escopo

- Mediana, IQR, FMV, tendência, liquidez — tudo isso é S3.2.
- Eventos `removed` / `reappeared` / `description_changed` — S3.2.
- Preço realizado (leilão fechado, compra registrada) — fatias próprias.

## Onde isto pode dar errado

- **Gravar observação a cada coleta infla a tabela rapidamente.** Com coleta
  frequente e nada mudando, sobram milhões de linhas idênticas. Considerar
  granularidade mínima (uma observação por anúncio por janela) antes de aumentar
  volume de coleta.
- **A idade do dado engana.** "Visto há 2 dias" pode significar anúncio já
  vendido. A UI precisa mostrar idade, não fingir atualidade.
- **Snapshot por hash depende de a fonte ser estável.** Campos voláteis no
  payload (contadores de visualização, timestamps internos) fazem o hash mudar
  sempre e geram snapshot a cada coleta. Se acontecer, normalizar o payload antes
  de hashear — e registrar o que foi excluído do hash.
- **Dado de vendedor entra junto.** O eBay exige exclusão sob demanda; a série
  histórica precisa continuar respeitando o webhook de deleção.
