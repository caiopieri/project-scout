# Interface

> Arquitetura de informação do console. Direção visual (tipografia, cor, espaço)
> ainda não definida — este documento trata de estrutura, estados e contrato de
> dado, que independem dela.

---

## 1. O que este produto é, em termos de UI

Não é marketplace e não é chat. É um **console de pesquisa operacional**. O laço
real do usuário:

```
formular intenção → ver a coleta acontecer → triar em massa
    → aprofundar em um → decidir → voltar amanhã
```

Três princípios que decidem quase todas as dúvidas de design:

1. **Filtro é lente, não exclusão.** Nada some do acervo. Ver
   [funil-e-risco.md §1](./funil-e-risco.md).
2. **Todo número se explica.** Score, custo total e "oportunidade" são clicáveis
   e abrem a conta. Número sem origem destrói a confiança na primeira vez que
   erra.
3. **Densidade acima de beleza.** Referência mental: Linear, cliente de e-mail,
   terminal financeiro — não vitrine de loja. Cor é sinal (risco, oportunidade,
   saúde), não decoração.

---

## 2. Mapa de telas

| Tela                | Papel                                                   | Fatia   |
| ------------------- | ------------------------------------------------------- | ------- |
| **Shell**           | barra de comando (⌘K) + drawer do agente                | S3      |
| **Hoje**            | o que mudou desde ontem                                 | S10     |
| **Pesquisa rápida** | campo grande → cards ao vivo, multi-fonte               | S1 + S3 |
| **Workspace**       | pesquisa salva: funil, triagem, comparação, critério    | S3      |
| **Inventário**      | o acervo inteiro, filtro, coração, preço de referência  | S3      |
| **Leilões**         | lotes, edital parseado, custo real, histórico de lances | S11     |
| **Monitores**       | buscas, itens e lotes vigiados                          | S10     |
| **Fornecedores**    | fábrica → fornecedor → distribuidor                     | S12     |
| **Fontes & saúde**  | camada usada, sucesso, custo, quando quebrou            | S8      |
| **Dossiê**          | drawer sobre qualquer card                              | S3      |

Pesquisa rápida e Workspace são **a mesma tela em dois estados**: a rápida é o
workspace sem pesquisa salva e com o painel de execução colapsado. Não
implementar duas vezes.

---

## 3. Pesquisa rápida

```
┌──────────────────────────────────────────────────────────────┐
│   ┌────────────────────────────────────────────────────┐     │
│   │ macbook m4 tela quebrada até 900 dólares          ⏎│     │
│   └────────────────────────────────────────────────────┘     │
│   Buscando de 6 formas ▾   eBay ✅312  OLX ⏳  Xianyu ⏸       │
├──────────────────────────────────────────────────────────────┤
│ ⊞ cards ≡ tabela   25▾ por página   ordenar: custo total ▾   │
│ filtrar: fonte ▸ preço ▸ condição ▸ país ▸ risco   🔍 dentro │
├──────────────────────────────────────────────────────────────┤
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                  │
│ │ [foto] │ │ [foto] │ │ [foto] │ │ [foto] │ ← chegando       │
│ └────────┘ └────────┘ └────────┘ └────────┘   ao vivo        │
│                        ‹ 1 2 3 4 ›                           │
└──────────────────────────────────────────────────────────────┘
     J/K navega · X descarta · S shortlist · M monitora · ↵ abre
```

### 3.1 O banco responde primeiro

O enter é instantâneo; a coleta não é. eBay responde em segundos, HTML e
navegador em minutos. Portanto:

1. Resultados **já existentes no acervo** aparecem em menos de um segundo.
2. Resultados novos entram por cima, com contador por fonte.
3. Além de parecer rápido, corta custo: não recoleta o que está fresco.

### 3.2 Paginação estável

Paginar um conjunto que cresce embaralha a página sob o dedo do usuário. A
paginação corre sobre um **snapshot ordenado estável**; os novos ficam numa barra
no topo: _"+37 novos · atualizar"_. Nada se reordena sozinho.

### 3.3 Família de queries visível e editável

O painel "Buscando de N formas" expande:

```
▾ macbook m4 tela quebrada
  ✓ macbook m4 tela quebrada          exata
  ✓ macbook m4 cracked screen         condição · en
  ✓ macbook pro 14 2024               geração ← aprendido
  ✓ 苹果 笔记本 屏幕碎                  idioma da fonte
  ✗ macbook m4 defeito                rejeitado por você
  + adicionar termo
```

O usuário vê o que o sistema fez, corrige na hora, e a correção vira termo
`learned` para as próximas pesquisas. É onde ele ensina o sistema em vez de
brigar com ele.

### 3.4 Ordenação honesta

Até existir score (S3), ordenar por: custo total, preço, novidade, desconto sobre
a mediana da própria busca. Não inventar "oportunidade" antes de haver lastro.

---

## 4. Os cards

Três tipos, porque forçar os três num só estraga os três.

### 4.1 Anúncio

```
┌──────────────┐
│    [foto]    │   ← da CDN da fonte, sem download
│ 87 ⬤         │   score (quando existir), cor = faixa
│ US$ 420      │   preço pedido
│ tot US$ 613  │   custo total ← é aqui que mora o garimpo
│ eBay ⚑2      │   fonte + sinais de risco
│ 3 iguais ▸   │   agrupamento cross-source, quando houver
└──────────────┘
```

Dois preços sempre visíveis. A diferença entre eles (frete, taxa, imposto,
reparo) é o produto — escondê-la num clique é esconder o valor.

### 4.2 Lote de leilão

Lance atual · incremento · **comissão e taxas** · custo real estimado · custo por
unidade útil · prazo de retirada · **relógio até o fechamento**.

### 4.3 Fornecedor

MOQ · preço por faixa de quantidade · prazo · nível na cadeia (fábrica /
fornecedor / distribuidor) · rota logística.

---

## 5. Triagem por teclado

Triar 500 itens com mouse não acontece. Obrigatório desde a primeira versão da
lista:

| Tecla     | Ação                            |
| --------- | ------------------------------- |
| `J` / `K` | navegar                         |
| `X`       | descartar (etiqueta, não apaga) |
| `S`       | shortlist                       |
| `M`       | monitorar                       |
| `↵`       | abrir dossiê                    |
| `⌘K`      | comando global                  |

---

## 6. Dossiê

Abre em drawer, sem perder a lista.

- Galeria com marcações da IA sobre a foto.
- **Evidências graduadas**: origem (declarado / visto na foto / inferido) e grau
  (confirmado / muito provável / provável / possível / desconhecido /
  contraditório).
- **A conta do custo total aberta, linha a linha.**
- Perguntas prontas ao vendedor para o que ficou desconhecido.
- Histórico de preço do anúncio e do segmento.
- O mesmo produto nos outros níveis da cadeia, quando existir.

---

## 7. Inventário

O acervo inteiro, independente de pesquisa. Filtros: período, fonte, categoria,
faixa de preço, status (ativo / vendido / sumiu), risco, coração.

**Sobre o coração**: a tabela `user_listing_actions` já existe com `favorite`,
`decision` e `notes`, mas nunca ganhou endpoint. Tem um defeito a corrigir antes
de haver dado: a unicidade é `(user_id, listing_id, project_id)` — ou seja,
favoritar é por pesquisa. Para um acervo global, deve ser `(user_id, listing_id)`.

Semântica separada, para não competirem:

- **coração** = "quero olhar depois"
- **decision** = "o que eu fiz" (`approved` / `rejected` / `purchased`)

---

## 8. Monitores

Três tipos na mesma tela, com relógios diferentes:

| Tipo               | Cadência                  | Dispara quando                           |
| ------------------ | ------------------------- | ---------------------------------------- |
| Busca monitorada   | horas                     | apareceu item acima do corte             |
| Item monitorado    | horas                     | preço caiu, sumiu, vendeu                |
| **Lote de leilão** | minutos → segundos no fim | lance passou de X, faltam 30 min, fechou |

As duas primeiras são a mesma máquina com relógio diferente. A terceira exige a
camada 3 da cascata (WebSocket/SSE) e é o caso onde rodar no Local Agent faz mais
sentido — sessão do usuário e menor latência.

---

## 9. Onde o agente aparece

Mesmo agente, duas embalagens (contrato completo em [agente.md](./agente.md)):

- **Drawer lateral** — contextual; sabe qual pesquisa está aberta e quais filtros
  estão ativos. Responder aqui **muda a lista da esquerda**.
- **Tela cheia** — conversa sobre o sistema inteiro.

Quando ele filtra, **mostra o filtro que aplicou**, editável.

---

## 10. Estados que toda tela de lista precisa ter

Frequentemente esquecidos, e são metade da experiência real:

- **vazio inicial** — nunca pesquisou nada
- **vazio por filtro** — com botão para afrouxar
- **carregando primeira página** vs. **coletando ao vivo**
- **parcial** — "eBay ok, OLX falhou" (nunca fingir sucesso total)
- **cota esgotada** — "142 aguardando análise", não erro
- **fonte degradada** — visível, com motivo
- **dado velho** — idade da observação no card

---

## 11. Ordem de implementação

1. **S1** — shell + tela de execução (o funil ao vivo) + card mínimo. É o que
   torna a coleta real visível.
2. **S3** — workspace completo, cards com score, dossiê, inventário, agente.
3. **S8** — fontes & saúde.
4. **S10** — hoje + monitores.
5. **S11** — leilões. **S12** — fornecedores.

---

## 12. Onde isto pode dar errado

- Construir tela sobre mock otimiza o design para dados falsos e bonitos. Só
  construir sobre dado real.
- O copiloto lateral é a parte que mais promete e mais decepciona; lançar
  mostrando o filtro aplicado, não como mágica.
- Nove telas é escopo grande para um sistema que hoje tem uma página.
- Densidade alta não cabe em mobile. Alerta de leilão no celular é requisito
  provável e ainda não foi desenhado.
- O volume real de triagem é desconhecido. Se for milhares por dia, triagem
  manual não escala e a tela vira revisão de amostra.
