# Memória de mercado

> O acervo é o ativo. Sem referência de preço, "oportunidade" é chute.
> Fórmulas e índices: [pesquisa-de-mercado.md](./pesquisa-de-mercado.md) EIXO 8.

---

## 1. Por que isto é o centro do sistema

Barato e caro só existem contra uma referência. Todo o resto — score, detecção de
preço-isca, margem, negociação, decisão de comprar — depende desta camada.

É também o único componente que **melhora sozinho**: cada pesquisa alimenta a
base sem trabalho adicional. E é a única parte do produto que um concorrente
novo não copia, porque ele não tem o histórico.

> **Histórico não se recupera. Começar a gravar hoje é de graça; começar daqui a
> seis meses custa seis meses.**

Por isso a gravação de observações de preço entra na **S1**, muito antes da
primeira métrica aparecer na tela.

---

## 2. O anúncio não pertence à pesquisa

Modelo mental correto: existe **um acervo** — tudo que já foi observado — e a
pesquisa é uma consulta sobre ele. Hoje o código faz o contrário: listings são
lidos por projeto (`GET /api/projects/:id/listings`), e o valuation usa como
comparáveis **apenas os itens da mesma coleta**, o que é a razão de ele ser fraco.

---

## 3. Duas séries que nunca se misturam

| Série               | Origem                                                             | Volume    | Viés             |
| ------------------- | ------------------------------------------------------------------ | --------- | ---------------- |
| **Preço pedido**    | todo anúncio observado                                             | abundante | puxado para cima |
| **Preço realizado** | leilão fechado, anúncio que sumiu (proxy fraco), compra registrada | escasso   | é a verdade      |

Anúncio a R$ 5.000 parado há 90 dias não é preço de mercado — é fantasia.

Fontes de preço realizado, em ordem de qualidade:

1. **Compra própria registrada** (`purchase_outcomes`) — verdade absoluta, poucos
   pontos. É também o laço de calibração do sistema inteiro.
2. **Leilão fechado** — real, público, exato. Mais um motivo para a aba de
   leilões existir cedo.
3. **Anúncio que desapareceu** — proxy fraco: pode ter expirado, sido removido ou
   o vendedor desistiu. Peso menor.

---

## 4. Segmentação: "o produto" não é uma coisa só

A métrica só existe por combinação:

```
canonical_product_id × condição × grade × região/moeda × janela temporal
```

MacBook Pro M4 14" 16/512 lacrado, 24/1TB usado, com tela quebrada e com iCloud
travado são **quatro mercados diferentes**. Misturá-los produz uma mediana que
não descreve nenhum deles.

Consequência: **a métrica de mercado é subproduto da identidade de produto**. Se
a resolução de identidade errar, a estatística mente com cara de autoridade.

---

## 5. Estatística mínima obrigatória

- **Mediana, nunca média.** Distribuição de usado tem cauda longa e lixo.
- **Limpeza por IQR** antes de calcular: manter `Q1 − 1.5·IQR ≤ P ≤ Q3 + 1.5·IQR`.
- **Janela móvel** (30/90 dias). Eletrônico desvaloriza; comparável de 6 meses é
  ruído. Preço antigo não pode justificar oportunidade num mercado que já caiu.
- **`n` sempre visível.** Abaixo de um mínimo por segmento, a resposta é
  `amostra insuficiente` — não um número.
- **Intervalo, não ponto.** "Entre R$ 2.900 e R$ 3.400, mediana R$ 3.150, n=47,
  últimos 30 dias."

---

## 6. Métricas derivadas

| Métrica               | Responde                                     | Base                                                                                                    |
| --------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Fair Market Value** | quanto vale hoje, nesta condição             | mediana limpa por IQR, ajustada por grade (A 1.0 · B 0.85 · C 0.70 · D 0.45)                            |
| **Deal Margin**       | está barato contra o mercado atual?          | preço vs. FMV                                                                                           |
| **Trend**             | o mercado sobe, cai ou está em região baixa? | série temporal do FMV                                                                                   |
| **Liquidez**          | a que preço isso vende rápido?               | tempo ativo por faixa de preço                                                                          |
| **Seller Pressure**   | o vendedor está cedendo?                     | reduções de preço, dias ativo, linguagem de urgência multilíngue ("desapego", "急售", "priced to sell") |
| **Confiança**         | quão consistente é o anúncio?                | evidência, identidade, coerência foto × texto                                                           |

Opportunity Score de partida (relatório, EIXO 8 §2):

```
Score = clamp(0.45·DealMargin + 0.25·SellerPressure + 0.15·Liquidez + 0.15·Confiança)
```

**Estes pesos estão errados.** São ponto de partida, não verdade. Só a comparação
entre previsto e realizado, via `purchase_outcomes`, os corrige. Enquanto não
houver dezenas de compras registradas, o score sai com incerteza declarada.

---

## 7. Preço de referência por produto ("FIPE do usado")

Produto direto do acervo: tabela de preço por modelo, condição e grade, com
amostra, intervalo e data. Vira capacidade que nenhum concorrente tem — e não
custa quase nada além do acervo.

Requisito: volume e tempo. Com 200 observações em um mês ela mente. Deve nascer
sempre acompanhada de `n` e janela.

---

## 8. O que gravar, e desde quando

As tabelas `price_history` e `listing_snapshots` já recebem dados pelo pipeline
transacional desde a implementação local da S1.2. A validação com duas coletas
live ainda está pendente.

| Evento                                                          | Quando                     | Fatia  |
| --------------------------------------------------------------- | -------------------------- | ------ |
| observação de preço com data                                    | toda coleta                | **S1** |
| snapshot completo                                               | quando algo relevante muda | S1     |
| `price_changed`, `removed`, `reappeared`, `description_changed` | detecção por hash          | S3     |
| métricas agregadas por segmento                                 | recálculo periódico        | S3     |
| `bid_changed`, `auction_ended`                                  | monitor de leilão          | S11    |
| resultado real da compra                                        | manual, após comprar       | S3     |

---

## 9. Onde isto pode dar errado

- **Amostra pequena mente com autoridade.** Mediana de 6 anúncios apresentada
  como "preço de mercado" é pior que não ter métrica.
- **O acervo é enviesado pelo que se procura.** Só se enxerga o mercado
  pesquisado; se o usuário só busca com defeito, a referência fica torta.
- **Desaparecimento não é venda.** Usar como proxy infla a taxa de sucesso.
- **eBay tem dados de vendidos, mas o acesso é restrito.** A Browse API usada
  hoje não os entrega; a API específica exige aprovação. Não contar com o atalho
  até alguém confirmar.
- **Identidade errada contamina tudo.** Um "iPhone 13" que na verdade é peça
  entrando na mediana derruba a referência de um segmento inteiro.
