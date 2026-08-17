# Roadmap — Project Scout

> Now / Next / Later. Uma fatia por vez, na ordem. Cada fatia tem um
> **pronto quando** verificável — se não dá para executar e mostrar, não está
> pronta.
>
> O que **existe** hoje está em [docs/status.md](./docs/status.md). Este
> documento é só o que ainda não existe.

## Princípio de ordenação

1. **A loja precisa comprar agora.** As primeiras fatias entregam garimpo real
   na fonte que já está viva (eBay), porque valor na mão financia o resto.
2. **O núcleo próprio é o produto.** A partir da S5, cada fatia derruba uma
   camada da cascata de coleta.
3. **Nenhuma abstração antes do segundo caso concreto.**

Não há "fase". Há fila.

---

## Fontes por tier de dificuldade

Fonte não é uma coisa só. Começar pela errada custa meses. A ordem de ataque
segue o tier, não o desejo.

| Tier  | Natureza                     | Fontes                                                                                          | Custo de construir | Custo de manter                      |
| ----- | ---------------------------- | ----------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------ |
| **A** | API oficial                  | eBay ✓, Mercado Livre, BestBuy, Amazon PA-API (com requisitos de conta)                         | dias               | baixo                                |
| **B** | HTML / endpoint público      | OLX, Swappa, BidSpotter, AllSurplus, leiloeiros BR, GovDeals                                    | 1–2 semanas cada   | médio — quebra algumas vezes por ano |
| **C** | Adversarial                  | Taobao, Tmall, Xianyu, 1688                                                                     | meses              | **alto e permanente**                |
| **D** | Diretório / dado de comércio | Alibaba, Made-in-China, Global Sources, listas de expositores de feira, registros de importação | variável           | baixo, mas dado envelhece            |

**Tier C não é questão de esforço, é de adversário.** O grupo Alibaba tem times
dedicados a bloquear coleta: fingerprint de dispositivo, risk control por conta,
exigência de login, detecção de ritmo. Não é "difícil de programar", é "alguém
trabalha todo dia para quebrar o que foi feito ontem". Exige sessão real do
usuário, IP local e ritmo humano — ou seja, **Local Agent (S6) é pré-requisito**.
Caminhos legítimos alternativos (plataformas abertas de parceiro, agentes de
sourcing) devem ser avaliados antes de investir em raspagem.

Regra: **nenhuma fonte de tier C antes de duas fontes de tier B estarem estáveis
e a auto-cura existir.** O produto vale com A + B; C é ampliação, não requisito.

## Agora — primeiro garimpo real

### S1 — eBay real, memória de preço e execução visível

Coleta contínua persistindo dado real, com orçamento de chamadas medido, health
por fonte e alerta de DLQ. **Grava observação de preço com data desde a primeira
coleta** — histórico não se recupera depois. Entra também a tela de execução: o
funil ao vivo, fonte por fonte.

**Pronto quando:** uma pesquisa real grava anúncios reais no banco, o usuário vê
o funil acontecendo na tela, o custo de chamadas está medido e `price_history`
tem linhas.
Handoff: [docs/handoffs/HANDOFF-S1.md](docs/handoffs/HANDOFF-S1.md)

### S2 — IA de texto de verdade

LLM real atrás da porta de extração, **dirigida por schema** (o chamador passa o
schema de saída; o extrator não conhece "defeito de iPhone"). Análise **em lote**
de 10–20 anúncios por requisição, com isolamento por item. Defesa de injeção
obrigatória. Testes com resposta gravada, nunca com rede. Medidor de cota que
para antes do 429 e degrada sem falhar.

**Pronto quando:** um anúncio real produz defeitos, evidências e afirmações do
vendedor com origem e grau — e um anúncio malicioso não muda o comportamento do
sistema nem contamina os outros do lote.

### S3 — Decisão na tela

O maior salto de valor. Reúne: custo total real (landed cost multi-país), score
explicável, feed ranqueado com cards, dossiê, inventário do acervo, coração,
métricas de mercado por segmento e o agente conversacional.

Inclui a correção de `user_listing_actions` para favoritar por `(user, listing)`,
e a exportação CSV/XLSX.

**Pronto quando:** o Caio abre a tela, pergunta ao agente "achou algo bom?", e
decide o que comprar sem abrir o site da fonte.

### S4 — Checkup visual

IA multimodal nos finalistas: dano visível, tela ligada, peça faltando, foto
genérica reusada, incoerência com a descrição. Política de imagem de
[funil-e-risco.md §3](docs/funil-e-risco.md): exibir é grátis, miniatura vira
hash, alta resolução só para 3 fotos dos finalistas.

**Pronto quando:** o sistema aponta um dano que não estava escrito na descrição,
com a evidência ao lado da conclusão, e o custo por anúncio analisado está medido.

---

## Depois — o núcleo próprio

### S5 — Cascata camada 4 e a primeira fonte BR

`ScrapingProvider` próprio (HTTP/HTML direto), a costura `SourceDocument` (preço
deixa de ser obrigatório no núcleo; enums de categoria e marca saem do critério
global) e a primeira fonte sem API oficial: **OLX**.

**Pronto quando:** anúncios de OLX e eBay aparecem no mesmo feed ranqueado, sem
nenhuma regra específica de OLX vazando para fora do connector.

### S6 — Navegador e Local Agent

Camada 5 da cascata, rodando também na máquina do Caio com a sessão dele. O
agente local **puxa** tarefas e nunca expõe porta de entrada.

**Pronto quando:** uma fonte que exige login é coletada da máquina local e cai no
mesmo pipeline, sem credencial saindo da máquina.

### S7 — Fonte sob demanda

O usuário cola uma URL, diz o que quer extrair, e o extrator genérico dirigido
por schema devolve dado estruturado — **sem gerar código de connector**. Fonte
que se provar recorrente vira connector dedicado, escrito e revisado por humano.

**Pronto quando:** uma fonte nunca vista antes entrega anúncios ao pipeline a
partir de uma URL colada pelo usuário.

### S8 — Proxy, rotação e saúde por fonte

**Infraestrutura de IP é contratada, não construída** (ver
[vision.md §2.1](docs/vision.md)). Esta fatia integra um provedor de proxy atrás
de uma porta própria, e implementa o que é nosso: escolha de rota por fonte,
limite, circuit breaker e `collector_health` real por camada.

**Pronto quando:** uma fonte bloqueada degrada de forma ordenada e visível, sem
tempestade de retry.

### S9 — Auto-cura

Detectar quebra a partir de `observation_events` reais → classificar → propor
correção com fixture, canário e rollback → aprovação humana.

**Pronto quando:** uma quebra real gera diagnóstico e proposta antes de alguém
perceber.

### S10 — Hoje, monitores e alertas

Busca monitorada, item monitorado e a tela "Hoje". Pesquisa salva que roda
sozinha e avisa quando aparece oportunidade acima do corte.

### S11 — Leilões, somente leitura

AllSurplus, BidSpotter, Freitas e afins. **Edital lido e convertido em custo
real** (comissão do leiloeiro, taxa administrativa, retirada, débitos),
monitoramento de lote com registro de todos os lances, custo por unidade útil.
Sem lance.

### S12 — Fornecedores, cadeia e contatos

Segundo produto do sistema, com entidade própria: não é anúncio, é **fornecedor**.
O que se guarda é quem vende o quê, em que nível da cadeia, a que preço por faixa
de quantidade, com que MOQ, prazo, rota logística e **contato verificado**.

Fontes deste produto (tier D, mais leilão/ITAD do tier B):

| Fonte                                                            | O que entrega                                                                                     |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Diretórios B2B (Alibaba, 1688, Made-in-China, Global Sources)    | fabricante e trading company, MOQ, faixa de preço                                                 |
| Listas de expositores de feira (Canton Fair, Computex, IFA, CES) | quem fabrica o quê, com contato — dado público e de alta qualidade                                |
| **Registros públicos de importação/exportação**                  | quem realmente importa de quem, em que volume — é como se descobre o fornecedor real de uma marca |
| Listas de distribuidores autorizados dos fabricantes             | canal legítimo para produto novo de marca                                                         |
| Leiloeiros, ITADs e liquidadores                                 | o canal real de notebook de marca a preço baixo                                                   |

Saída: escada do mesmo produto — fábrica → fornecedor → distribuidor →
revendedor — com preço, prazo e **o que é acessível no volume atual do usuário**,
já que preço de fábrica é função de MOQ.

**Pronto quando:** para um produto alvo, o sistema lista fornecedores em pelo
menos dois níveis da cadeia, com contato, MOQ e faixa de preço, e diz
explicitamente quais estão fora do alcance no volume atual.

---

## Mais tarde

- **S13 — Ação sob autorização**: envelope assinado, ledger idempotente e
  executor local para lance e compra, incluindo lance de última hora em leilão.
  Exige valor máximo, expiração, chave idempotente e aprovação por ação. É a
  única funcionalidade do sistema que pode custar dinheiro por bug.
- **S14 — Segunda vertical** (vídeo ou fórum): o teste de verdade da genericidade
  do núcleo.
- **S15 — Mercado Livre retomado**; Xianyu apenas com contrato e compliance.

---

## Pendente de decisão do fundador

| Item                     | Por que precisa de decisão                                                                                                                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vertical de veículos** | O núcleo aguenta; a vertical não existe. Carro traz taxonomia, FIPE, chassi, sinistro, documentação, débito e risco jurídico próprios. Não é extensão pequena e come tempo do garimpo de eletrônicos. |
| **Mobile**               | Alerta de leilão no celular é requisito provável. Console denso não cabe em tela pequena; muda a estrutura da interface.                                                                              |
| **Memória do agente**    | Preferências persistentes tornam o agente útil, mas viram viés invisível que filtra oportunidade sem o usuário saber.                                                                                 |

---

## Congelado (com motivo)

| Item                                    | Motivo                                                                                                         |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Integração com a Eletrofy               | Decisão do fundador em 2026-08-15; entra depois do núcleo aprovado                                             |
| Mercado Livre                           | Suspenso até nova decisão de política/OAuth                                                                    |
| Xianyu                                  | Sem contrato ou endpoint autorizado                                                                            |
| MCP público / API para terceiros        | Só depois do núcleo próprio maduro                                                                             |
| Fábrica geradora de código de connector | Código gerado sem revisão vira dívida invisível. O extrator genérico da S7 cobre a necessidade sem esse risco. |
