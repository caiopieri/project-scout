# HANDOFF-S3.3a — Desconto sobre a referência, com a conta aberta

> Terceira fatia do Round 3, depois de [S3.1a](./HANDOFF-S3.1a.md) (custo na
> porta) e [S3.2a](./HANDOFF-S3.2.md) (mediana por segmento). Escrita pelo
> Arquiteto em 2026-08-31. O Round 2 segue bloqueado em `GEMINI_API_KEY` e em
> decisão do fundador; esta fatia é independente.
>
> Referência: [ROADMAP](../../ROADMAP.md) S3.3 e
> [custo-total.md §2.2](../custo-total.md).

---

## Objetivo

Fechar a corrente **custo → valor → decisão**: dizer, para um anúncio, quanto
ele está abaixo (ou acima) da referência do seu segmento, com a conta aberta e
com recusa explícita quando faltar qualquer perna.

## O nome importa, e não é "margem"

Esta fatia entrega **desconto sobre a referência de mercado**, não margem e não
ROI.

A `custo-total.md §2.2` define `R_liquida` descontando comissão de plataforma,
taxa de pagamento, imposto e perda — **nada disso existe no sistema hoje**.
Chamar de margem um número que ignora esses componentes é o mesmo erro que a
S3.1a corrigiu: componente ausente virando zero silencioso, e prejuízo
aparecendo como oportunidade.

Então: o campo se chama desconto sobre referência, a documentação diz que **não
é margem**, e a tela não usa a palavra margem. Quando as taxas existirem, aí
sim, e será outra fatia.

## Pronto quando

1. Um anúncio com **custo na porta `known`** e **segmento com amostra
   suficiente** recebe o desconto sobre a referência, com a conta aberta:
   o custo usado, a mediana usada, o `n` e a janela dela, e a versão da
   política.
2. Um anúncio a que falte **qualquer** das duas pernas recebe
   **`NAO_RANQUEAVEL`**, nomeando qual perna faltou — custo indeterminado,
   amostra insuficiente, ou ambas. Sem número, sem estimativa, sem zero.
3. A política (mínimo de observações, janela, versão) é **configuração
   explícita** e viaja no resultado. Ausente, falha fechado.
4. O usuário alcança pela rota de listings que já existe, vendo o número com a
   conta aberta ou o motivo da recusa.

Evidência de fechamento: **integração local** contra o acervo real. Não exige
chamada ao eBay.

## Contrato

- Dinheiro em inteiro menor, moeda explícita, nunca `float`.
- Só compara **dentro da mesma moeda e do mesmo segmento**. Moeda diferente é
  recusa, não conversão — câmbio não existe e não entra aqui.
- Reusa `calculateUsToUsLandedCost` (S3.1a) e `calculateMarketMetrics` (S3.2a).
  **Não reimplemente nenhum dos dois** e não altere o contrato deles.
- O anúncio que originou uma observação **não deve inflar sua própria
  referência** de forma enganosa; declare no contrato como isso é tratado.
- Resultado validado por schema Zod em `packages/schemas`, com versão de
  política.

## Caminho de usuário

`GET /api/projects/:projectId/listings` passa a devolver, por anúncio, o
desconto sobre a referência com a conta aberta, ou `NAO_RANQUEAVEL` com o
motivo. A tela mostra os dois casos.

## Fora de escopo

- Feed, cards, filtros, ordenação e paginação — são S3.4.
- `R_liquida`, `MLR`, `ROI`, `P_max` e qualquer coisa chamada margem.
- Comissão de plataforma, taxa de pagamento, imposto de venda, perda.
- Câmbio, rotas além de `US → US`, componentes de custo novos.
- Dossiê, favoritar, exportação.
- Qualquer coisa de Gemini ou análise de texto.

## Orçamento de diff

**Teto de ~300 linhas.** A S3.2a fechou em 290 e provou que dá. Se não couber,
quebre antes de começar, nunca durante, e nunca cortando teste
([ADR 1.65](../decisions.md)).

## Onde pode dar errado

- **A maioria dos anúncios vai sair `NAO_RANQUEAVEL`, e isso é esperado.** Hoje
  65,6% dos segmentos são `AMOSTRA_INSUFICIENTE` e ~5% dos anúncios têm custo
  indeterminado. Compondo as duas pernas, a recusa será o caso comum. **Isso é
  verdade sobre o acervo, não defeito.** Registre a proporção; não afrouxe
  mínimo, não invente fallback, não preencha com estimativa. Se a proporção
  inviabilizar a tela, é decisão de produto do Arquiteto.
- **Desconto grande é sinal de anúncio ruim, não de oportunidade.** O acervo é
  majoritariamente `for parts`; o item muito abaixo da mediana provavelmente
  está quebrado de um jeito que a mediana não captura. Esta fatia **não** afirma
  oportunidade, afirma distância da referência — e o texto na tela precisa deixar
  isso claro, ou o usuário vai comprar lixo achando que achou barganha.
- **Mediana de anúncio ativo é preço de pedido, não de venda** (herdado da
  S3.2a). Comparar custo real contra preço pedido superestima o desconto.
- **Amostra pequena move a mediana com facilidade.** Com `n` perto de 10, um
  anúncio novo desloca a referência; por isso `n` e janela viajam no resultado e
  precisam aparecer ao lado do número, nunca escondidos.
