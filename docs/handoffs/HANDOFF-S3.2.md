# HANDOFF-S3.2 — Métricas de mercado: mediana limpa, com `n` e janela visíveis

> Round 3, fatia seguinte à [S3.1a](./HANDOFF-S3.1a.md). Escrita pelo Arquiteto
> em 2026-08-31. O Round 2 (S2.x) segue **bloqueado** em `GEMINI_API_KEY` e em
> decisão do fundador; esta fatia é independente dele.
>
> Referência: [memoria-de-mercado.md](../memoria-de-mercado.md) e
> [ROADMAP](../../ROADMAP.md) S3.2.

---

## Objetivo

Dar preço de referência por segmento a partir do acervo já coletado, com a
amostra sempre à vista, e **recusar responder quando a amostra for pequena
demais**.

## Por que agora

A S3.1a fechou o custo de entrada — quanto custa trazer o item. Falta o outro
lado: **quanto ele vale**. Sem isso o sistema não diz o que é barato, e é
exatamente o que o Caio ainda não tem
([BOOTSTRAP-ARQUITETO](../team/BOOTSTRAP-ARQUITETO.md)).

O dado já existe e não exige coleta nova: `price_history` tem **1126
observações em 698 anúncios**, com segmentos grandes e pequenos — os dois
caminhos desta fatia são exercitáveis contra dado real hoje.

## Pronto quando

1. Para um segmento com amostra suficiente, o sistema devolve a **mediana com
   outliers aparados por IQR**, acompanhada de `n` (antes e depois do apara) e
   da **janela temporal** considerada.
2. Para um segmento abaixo do mínimo configurado, devolve
   **`AMOSTRA_INSUFICIENTE`** com o `n` observado e o mínimo exigido. Não devolve
   mediana, não devolve média como consolo, não extrapola.
3. O mínimo é **configuração explícita**; ausente, falha fechado
   ([AGENTS.md §6](../../AGENTS.md)).
4. O usuário alcança isso por rota existente ou nova sob
   `/api/projects/:projectId/...`, e vê `n` e janela junto do número — nunca o
   número sozinho.

Evidência de fechamento: **integração local** contra o acervo real. Não exige
chamada ao eBay.

## Contrato

- Dinheiro em inteiro menor, moeda explícita, nunca `float`.
- **Segmento** nesta fatia = `(produto inferido, condição)`. Se qualquer um dos
  dois for desconhecido, o anúncio **não entra** em nenhum segmento — mesma
  filosofia da S3.1a: desconhecido não vira categoria coringa.
  **Verifique o formato real de `listings.inferred_product` antes de assumir**;
  se não sustentar segmentação, pare e traga ao Arquiteto em vez de inventar
  chave.
- Apara por IQR: `[Q1 − 1.5·IQR, Q3 + 1.5·IQR]`. O resultado carrega `n` bruto,
  `n` aparado e quantos foram descartados.
- Janela temporal é parâmetro com padrão explícito, e viaja no resultado.
- Resultado validado por schema Zod em `packages/schemas`.

## Caminho de usuário

Consultar um projeto devolve, por segmento presente no acervo, a mediana com
`n` e janela — ou `AMOSTRA_INSUFICIENTE`. A tela mostra o número **sempre
acompanhado** de `n` e janela.

## Fora de escopo

- Score, ranqueamento, `MLR`, `ROI`, `P_max` — são S3.3.
- Feed, cards, filtros, ordenação — são S3.4.
- Câmbio, rotas novas e qualquer componente de custo — a S3.1a fechou o que
  havia para fechar agora.
- Séries temporais, tendência, sazonalidade e previsão.
- Dedup cross-source e clustering visual de identidade.
- Qualquer coisa de Gemini ou análise de texto.

## Orçamento de diff

**Teto de ~300 linhas, e desta vez ele vale.** A S3.1a fechou com **602
inserções em 14 arquivos** e isso é violação do
[ADR 1.65](../decisions.md) — o teto não abre exceção porque a maior parte é
teste. A fatia entregue estava correta e por isso não foi desfeita, mas o
padrão não se repete.

Se esta fatia não couber, **quebre antes de começar**, não durante. Nunca corte
teste para caber.

## Onde pode dar errado

- **A janela pode engolir o sinal.** Todo o acervo foi coletado em poucos dias;
  janela larga e janela estreita darão quase o mesmo resultado, então esta fatia
  **não prova** que a janela funciona ao longo do tempo. Diga isso no log em vez
  de sugerir que provou.
- **`n` pequeno em quase todo segmento é o desfecho provável.** Se quase tudo
  responder `AMOSTRA_INSUFICIENTE`, isso é informação verdadeira sobre o acervo,
  **não** motivo para baixar o mínimo. Baixar o mínimo para a tela ficar bonita é
  como o sistema passa a mentir. Registre a proporção e traga ao Arquiteto.
- **IQR em amostra minúscula é instável** e pode descartar observação legítima.
  Por isso o mínimo existe e por isso `n` bruto e `n` aparado viajam juntos.
- **Preço de anúncio não é preço de venda.** O acervo é de anúncios ativos e
  `for parts`; a mediana daqui é referência de **pedido**, não de transação.
  Isso precisa estar explícito no contrato e na tela, ou o número será lido como
  o que não é.
- **Segmentar por produto inferido herda a qualidade da inferência.** Se ela for
  ruim, a mediana mistura mercados diferentes e fica pior que não ter número.
