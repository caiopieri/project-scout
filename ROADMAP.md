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

Rotação de IP, limite por fonte, circuit breaker e `collector_health` real por
camada.

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

### S12 — Fornecedores e cadeia

O mesmo produto nos níveis fábrica → fornecedor → distribuidor → revendedor, com
preço, MOQ e prazo comparados.

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
