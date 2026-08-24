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

## O que é um round

**Um round = uma fatia numerada, do handoff à evidência.** Fecha quando o gate do
[AGENTS.md §5](AGENTS.md) está verde e a linha entra no `LOG-VERIFICACAO.md` com
o nível de evidência correto. Uma fatia que não cabe em ~300 linhas de diff é
quebrada antes de começar, não durante.

Round seguinte só abre com o anterior fechado. Se um round travar por dependência
externa (credencial, decisão do fundador), ele é marcado como bloqueado e o
próximo **independente** assume — nunca se abre um round adiantado do "Depois".

---

## Agora — primeiro garimpo real

### Round 1 — eBay deixa de ser mock

| #        | Fatia                             | Pronto quando                                                                                                                                        |
| -------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S1.1** | Coleta real do eBay persistida    | Uma pesquisa real grava anúncios reais no banco; 3 URLs conferidas manualmente existem; consumo de chamadas medido; nenhum segredo em log            |
| **S1.1b-1** | Orçamento e paginação           | Uma execução real devolve ≥100 anúncios persistidos dentro de orçamento de chamadas explícito; orçamento ausente falha fechado; truncamento é registrado                                                |
| **S1.1b-1c** | Orçamento na rota de sonda      | `/internal/ebay/probe` lê e valida `EBAY_BROWSE_BUDGET_PER_RUN`, recusa sem ele, e o teste exercita a rota — não o construtor                                                                             |
| **S1.1b-1b** | Caminho de escrita em volume   | Uma coleta de ≥100 anúncios termina `completed` com contadores preenchidos; nenhuma URL cresce com o número de anúncios; retry não regasta o orçamento inteiro                                            |
| **S1.1b-2** | Família de queries e camada 1   | Mais de uma query por execução; chamada de detalhe só para quem sobreviveu ao filtro barato; o descartado vira triagem persistida                                                                        |
| **S1.2** | Memória de preço desde o dia zero | `price_history` recebe uma observação por anúncio observado; recoletar no dia seguinte acrescenta observação sem duplicar snapshot quando nada mudou |
| **S1.3** | Tela de execução                  | O usuário vê o funil ao vivo: total coletado, o que sobrou em cada camada, estado por fonte, e o custo gasto                                         |

Handoffs: [S1.1](docs/handoffs/HANDOFF-S1.1.md) ·
[S1.1b-1](docs/handoffs/HANDOFF-S1.1b-1.md) ·
[S1.1b-1c](docs/handoffs/HANDOFF-S1.1b-1c.md) ·
[S1.1b-1b](docs/handoffs/HANDOFF-S1.1b-1b.md) ·
[S1.1b-2](docs/handoffs/HANDOFF-S1.1b-2.md) ·
[S1.2](docs/handoffs/HANDOFF-S1.2.md) · [S1.3](docs/handoffs/HANDOFF-S1.3.md)

### Round 2 — IA de texto de verdade

| #        | Fatia                                        | Pronto quando                                                                                                                                                                |
| -------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S2.1** | Porta de extração + provedor real            | Um provedor LLM real responde atrás da porta, com cassete nos testes (a suíte não chama rede), medidor de cota que para antes do 429 e degradação sem falha                  |
| **S2.2** | Extração dirigida por schema, em lote        | 10–20 anúncios por requisição, cada um envelopado; saída em array validado com id de retorno; anúncio malicioso não altera o comportamento nem contamina os vizinhos do lote |
| **S2.3** | Evidência e defeito a partir de anúncio real | Um anúncio real do eBay produz defeitos e evidências com origem e grau persistidos, e o desconhecido é registrado como desconhecido                                          |

### Round 3 — Decisão na tela

| #        | Fatia                                                  | Pronto quando                                                                                                                                                                     |
| -------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S3.1** | **Custo total na porta** ([spec](docs/custo-total.md)) | Um item importado tem a conta aberta linha a linha com origem por componente; componente ausente bloqueia o ranqueamento em vez de virar zero; câmbio persistido com data e fonte |
| **S3.2** | Métricas de mercado                                    | Mediana limpa por IQR por segmento, com `n` e janela visíveis; abaixo do mínimo responde "amostra insuficiente"                                                                   |
| **S3.3** | Score explicável                                       | Todo score abre a conta: fatores positivos, negativos, ausentes e contraditórios, com a versão da política                                                                        |
| **S3.4** | Feed, cards e filtros                                  | Lista ranqueada, filtro como lente, paginação estável, triagem por teclado, estados de vazio/parcial/degradado                                                                    |
| **S3.5** | Dossiê, inventário e coração                           | Acervo navegável fora da pesquisa; favoritar corrigido para `(user, listing)`; dossiê com evidência graduada                                                                      |
| **S3.6** | Agente conversacional ([contrato](docs/agente.md))     | Responde por filtro estruturado citando IDs, mostra o filtro aplicado, e exige confirmação antes de gastar                                                                        |
| **S3.7** | Exportação                                             | CSV/XLSX da seleção atual                                                                                                                                                         |

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

### S8 — Resiliência, proxy e observabilidade

Nível 0 da auto-cura: o que mantém o sistema de pé **sem IA nenhuma**, mais o
substrato que a S9 vai ler.

**Infraestrutura de IP é contratada, não construída** (ver
[vision.md §2.1](docs/vision.md)). O que é nosso: escolha de rota por fonte,
circuit breaker por fonte e camada, failover de camada na cascata,
`collector_health` real, DLQ com alerta e procedimento de replay.

Entra também o substrato de observabilidade que ainda não existe:

- **sonda canário por fonte** — busca conhecida com resultado esperado, rodando
  periodicamente; é ela que detecta a quebra antes do usuário;
- **orçamento de erro por fonte** — taxa de sucesso abaixo do limiar abre
  incidente automaticamente;
- **trilha de auditoria** de ações de manutenção.

**Pronto quando:** uma fonte bloqueada degrada de forma ordenada e visível, sem
tempestade de retry, e a queda de uma fonte abre incidente sozinha — sem ninguém
ter percebido antes do sistema.

### S9 — Auto-cura ([spec](docs/auto-cura.md))

Três níveis de autoridade, executados em ordem. O substrato (sonda canário,
orçamento de erro, incidente) vem na S8; aqui entra o agente.

| #        | Fatia                            | Pronto quando                                                                                                                                                                              |
| -------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **S9.1** | Diagnóstico autônomo             | Uma quebra real gera relatório com classe da falha, diff entre o raw que funcionava e o que quebrou, e proposta de correção com fixture — **sem tocar em código**                          |
| **S9.2** | Correção com canário e aprovação | A proposta roda em sandbox, a fixture antiga continua passando, o canário mede, o rollback é automático — e o merge exige humano                                                           |
| **S9.3** | Autonomia estreita               | Correção aplicada sem humano **apenas** em arquivos de whitelist explícita (mapeamento/seletor de connector), com gate de CI verde, canário medido, rollback testado e trilha de auditoria |

**Fora da whitelist, autonomia é proibida.** O agente nunca toca em teste,
migration, RLS, autenticação, política de custo, credencial, limite de taxa ou
qualquer coisa que execute ação vinculante — ver
[auto-cura.md §5](docs/auto-cura.md).

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
