# HANDOFF-S3.1a — Custo na porta US→US, com desconhecido bloqueando o ranking

> Primeira quebra da **S3.1** ([spec](../custo-total.md)). A spec inteira tem 13
> componentes, 6 rotas, câmbio e tributo: não cabe em ~300 linhas e não se
> implementa numa fatia. Esta fatia entrega a **regra fundamental** da spec (§1)
> na rota mais simples e com o dado que já temos coletado ao vivo.
>
> Escrita pelo Arquiteto em 2026-08-30, depois de o Round 2 (S2.x) ficar
> bloqueado em credencial e decisão do fundador. [AGENTS.md §3](../../AGENTS.md)
> manda assumir o próximo round **independente**; este é.

---

## Objetivo

Calcular o custo na porta de um anúncio na rota `US → US` a partir de
componentes com origem explícita, e **impedir que componente desconhecido vire
zero**.

## Por que esta fatia, e por que agora

Não é escolha de conveniência. O defeito já existe no código e o dado live já o
expõe:

`packages/ebay-connector/src/ListingMapper.ts:97`

```ts
totalVisibleCostMinor: record.preview.price.amountMinor + (shippingCostMinor ?? 0),
```

Quando o eBay não declara frete, a linha 57 corretamente produz `null` — e a
linha 97 o coage a `0`. O total visível passa a **subestimar** o custo em
silêncio. A spec abre dizendo que este é "o número mais perigoso do sistema" e
que "um custo subestimado transforma prejuízo em oportunidade no topo do feed".

O connector já carrega o sinal certo (`shippingCostKnown`, linha 122); ninguém o
usa. Esta fatia faz o núcleo respeitá-lo.

## Pronto quando

Verificável executando, não lendo:

1. Um anúncio com preço e frete conhecidos produz custo na porta **aberto linha
   a linha**, cada componente com valor, moeda e origem (`informado`,
   `tabelado`, `estimado`, `desconhecido`).
2. Um anúncio com frete **não declarado** produz `custo indeterminado`, fica
   **fora** do ranqueamento de oportunidade, e nomeia o componente que falta.
   Não vira zero, não vira estimativa silenciosa.
3. `totalVisibleCostMinor` deixa de somar `?? 0` para componente desconhecido.
4. O usuário alcança isso pela rota de listings que já existe, vendo a conta
   aberta ou o motivo de estar indeterminada.

Evidência de implementação: fixture e gate completo. **Fechamento: integração
local** — não exige coleta live nova, o acervo de 396 anúncios reais coletados
em 2026-08-30 basta e já contém os dois casos.

## Contrato

- Dinheiro em **inteiro menor**, com moeda explícita. Nunca `float`
  ([AGENTS.md §6](../../AGENTS.md)).
- Todo componente carrega `{ valorMinor, moeda, origem }`. `origem` é enum
  fechado, validado em `packages/schemas`.
- Rota única nesta fatia: `US → US`. Componentes obrigatórios: **preço do item**
  e **frete**. Nenhum outro componente da spec entra.
- Resultado persistido guarda a versão da política e a lista de componentes
  desconhecidos.
- Falha fecha: componente obrigatório ausente ⇒ `INDETERMINADO`, nunca zero.

## Caminho de usuário

`GET /api/projects/:projectId/listings` passa a devolver, por anúncio, o custo
na porta aberto ou o estado `INDETERMINADO` com a lista do que falta. A tela de
resultados exibe a conta; anúncio indeterminado aparece marcado e fora de
qualquer ordenação por oportunidade.

## Fora de escopo

Tudo isto é da S3.1 completa ou de fatias posteriores e **não entra**:

- Câmbio, spread e qualquer rota que não seja `US → US`.
- Imposto de importação, ICMS, despacho, handling, seguro, prep center.
- Prêmio de comprador em leilão e taxa administrativa de edital.
- Estimativa de reparo e regularização.
- Perfis de categoria (§4 da spec), incluindo bateria de lítio e carga perigosa.
- `R_liquida`, `MLR`, `ROI` e `P_max` — são S3.3.
- Métricas de mercado e mediana por IQR — são S3.2.
- Substituir `opportunityPolicy` inteiro (spec §8). Estender só o necessário.
- Comparador de caminhos com prazo, garantia e risco (spec §6).

## Onde pode dar errado

- **A regra pode esvaziar o feed.** Se muitos anúncios tiverem frete não
  declarado, quase tudo vira `INDETERMINADO` e a tela fica inútil. Isso é
  informação, não motivo para relaxar a regra: se acontecer, **registre a
  proporção e traga ao Arquiteto** — a decisão de tratar "frete não declarado"
  como retirada em mãos, ou como `tabelado` por rota, é de produto e não do
  implementador.
- **`shipping_cost = 0.00` é ambíguo hoje no banco.** Frete grátis declarado e
  frete desconhecido podem ter colapsado no mesmo `0.00` na persistência, ainda
  que o mapper distinga. Verifique antes de assumir; se colapsaram, o dado
  histórico não distingue os dois casos e só coleta nova separa.
- **Mexer em `totalVisibleCostMinor` toca o que já foi coletado.** Não reescreva
  histórico nem migre linha existente nesta fatia.
- **A tentação é generalizar para as 6 rotas.** Não. O segundo caso concreto
  ainda não existe ([AGENTS.md §2](../../AGENTS.md)).
- **Número fiscal nenhum entra aqui**, nem como constante "temporária". A spec é
  explícita: errar tributo não é bug, é autuação.
