# Estado real — verificado em 2026-08-31

> Este é o único documento que declara o que **existe**. Roadmap declara o que
> vai existir; arquitetura declara como deve ser feito. Se algum outro documento
> afirmar capacidade, ele está errado — corrija-o, não este.
>
> Regra: uma linha só sai de ❌ ou 🟡 quando alguém executou o caminho e colou a
> evidência em `LOG-VERIFICACAO.md`.

## Legenda

- ✅ existe e foi executado de verdade
- 🟡 existe em código, mas só roda com fixture/mock ou não tem caminho de usuário
- ❌ não existe

## Núcleo de coleta

| Capacidade                                          | Estado | Observação                                                                                                                                                                                                                                               |
| --------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Camada 1 — API oficial (eBay Browse)                | ✅     | OAuth, orçamento explícito e rate limit atômico; família adaptativa de até três queries, filtro barato antes do detalhe, previews rejeitados preservados para triagem, memória de preço e leitura em lotes de 50 foram exercitados live com fonte real; custo monetário segue em zero |
| Camada 2 — endpoint JSON/GraphQL                    | ❌     | Nenhuma implementação                                                                                                                                                                                                                                    |
| Camada 3 — WebSocket/SSE                            | ❌     | Nenhuma implementação                                                                                                                                                                                                                                    |
| Camada 4 — HTTP/HTML direto                 | 🟡     | `HttpScrapingProvider` com robots.txt, ritmo por host, UA identificado e bloqueio como estado terminal; extrator JSON-LD schema.org; connector Swappa provado com página gravada (coleta live proibida pelos termos) |
| Camada 5 — navegador automatizado           | 🟡     | Playwright com perfil persistente do usuário no Local Agent; para em login/CAPTCHA/bloqueio |
| Camada 6 — DOM/MutationObserver                     | ❌     | Nenhuma implementação                                                                                                                                                                                                                                    |
| Camada 7 — screenshot/OCR                           | ❌     | Nenhuma implementação                                                                                                                                                                                                                                    |
| `ScrapingProvider` (porta genérica)                 | 🟡     | Implementação HTTP (camada 4); navegador ainda não |
| Proxy / rotação de IP                               | ❌     | Nenhuma implementação                                                                                                                                                                                                                                    |
| Local Agent (coleta na máquina do usuário)  | 🟡     | `apps/local-agent` puxa tarefas com token próprio, usa a sessão do usuário e devolve só registros; credencial não sai da máquina (verificado no banco). Provado contra site de login em loopback |
| Fonte sob demanda (URL colada)             | 🟡     | Extrator genérico JSON-LD → LLM com verificação ancorada nos links da própria página; auditoria por extração; provado live em loja de prática (116/117) |
| Auto-cura (detectar quebra → diagnosticar → propor) | ❌     | Removido em `1291a6e`; eram funções puras sem chamador                                                                                                                                                                                                   |

## Fontes

| Fonte                                     | Estado | Observação                                                                                                                                                                                                                                                                           |
| ----------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| eBay                                      | ✅     | Browse Production foi exercitado live: runs concluídas com 136, 137 e 22 anúncios observados, família de queries, triagem, reobservação de preço e funil live da UI; URLs reais foram conferidas. Quota efetiva, custo monetário e replay operacional seguem pendentes |
| Mercado Livre                             | 🟡     | Adapter + OAuth escritos, nunca rodaram live; suspenso por decisão de 2026-08-15                                                                                                                                                                                                     |
| Xianyu                                    | ❌     | Apenas boundary "indisponível"                                                                                                                                                                                                                                                       |
| Swappa                                    | 🟡     | Connector camada 4 com fixture; live desligado por política (termos proíbem robôs) |
| OLX, Facebook Marketplace                 | ❌     | Nunca iniciados                                                                                                                                                                                                                                                                      |
| Leilões (AllSurplus, BidSpotter, Freitas) | ❌     | Nunca iniciados                                                                                                                                                                                                                                                                      |
| Fornecedores China / fabricantes          | ❌     | Nunca iniciados                                                                                                                                                                                                                                                                      |

## Inteligência

| Capacidade                                 | Estado | Observação                                                                                                                                                                                                                    |
| ------------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Interpretação de intenção                  | 🟡     | `DeterministicIntentInterpreter` — regras, sem LLM                                                                                                                                                                            |
| Análise de texto                           | 🟡     | Cadeia `llm` (Groq qwen3.8-27b → Gemini 3.5 Flash) com fallback por item, prompt com regras em `system` e dados hostis em `user`; rota e tela para disparar e ler defeitos/evidências com o modelo que os produziu. Provado live contra Groq com anúncios sintéticos; falta anúncio real do eBay |
| LLM real (qualquer provedor)               | ✅     | Groq respondeu live; Gemini respondeu live mas oscila com 503; Cerebras recusou com 402 (sem cota paga). Orçamento por provedor, leitura de cabeçalhos de rate limit e fallback; consumidor não roda em `wrangler dev` local porque o workerd ignora o proxy do container |
| Análise de imagem / checkup visual         | 🟡     | Checkup visual dos finalistas (até 3 fotos, cache por hash dos bytes, orçamento por pedido) com Gemini multimodal; achados por foto e marcados quando não estão na descrição; tokens medidos. Provado live com fotos sintéticas; não alimenta o score ainda; sem hash perceptual |
| Triagem barata (filtro determinístico)     | ✅     | `CollectionTriageService`, decisões persistidas                                                                                                                                                                               |
| Identidade de produto / dedup cross-source | 🟡     | Candidatos gerados e revisáveis; sem clustering visual                                                                                                                                                                        |
| Valuation / oportunidade                   | 🟡     | `DeterministicValuationEngine` roda no consumidor, mas sem dados históricos suficientes; custo na porta US→US agora expõe preço/frete com origem explícita e custo indeterminado fica fora da valuation                                                                                                                                       |
| Score final e ranking de oportunidades     | 🟡     | `listing-score.v1` explicável (fatores positivos, negativos, ausentes e contraditórios), `INCOMPLETO` sem valor quando falta perna; ordenação por score no feed. Pesos não calibrados com resultado de compra |
| Exportação CSV/XLSX                        | 🟡     | Exporta a seleção atual (lente, ordem e snapshot) em CSV e XLSX, com neutralização de fórmula; provado pela tela em integração local |
| Memória de mercado / histórico de preço    | ✅     | Ingestão transacional live gravou duas observações por 135 anúncios reobservados; 279 observações contra 189 snapshots confirmaram snapshots condicionados ao hash |
| Preço de referência por segmento           | ✅     | Rota e tela exibem mediana de preço pedido em minor units por produto inferido + condição; janela de 30 dias, mínimo 10 e IQR 1,5; amostras menores falham fechado                                                                 |
| Desconto sobre a referência                | 🟡     | `reference-discount.v1`: custo `known` vs mediana do segmento sem o próprio anúncio, conta aberta na rota de listings e na tela; recusa `NAO_RANQUEAVEL` nomeia cada perna faltante. Provado só em integração local com acervo sintético |
| Lista ordenada e paginação estável         | 🟡     | Rota `/feed` e tela com grupos ranqueável/sem lastro, ordenação honesta, snapshot estável e aviso `+N novos`; provado em integração local com acervo sintético |
| Detecção de golpe                          | ❌     | 13 sinais especificados no PRD original §17, nenhum implementado                                                                                                                                                              |
| Risco de vendedor                          | ❌     | Nenhuma implementação                                                                                                                                                                                                         |
| Agente conversacional                      | 🟡     | `/api/agent/chat` com ferramentas de leitura livres e de gasto com confirmação, citação verificada de IDs, filtro aplicado visível e aplicável; provado live (Groq) com acervo sintético pela tela |
| Monitors, alerts and "Hoje" (S10)           | 🟡     | Search monitor (cutoff by score, % below reference or max landed cost; unknown never passes) and listing monitor (price drop with optional minimum, ended, out of stock); cron claims due monitors atomically, evaluates on stored data and requests one collection per cadence slot through the circuit; a completed collection re-evaluates the monitors that asked for it; alerts deduplicated per event; `/api/today`, Hoje panel, M key creates a listing monitor, agent tool `criar_monitor`. In-app alerts only (no e-mail/push yet); auction lots are S11 |
| Leilões (edital, custo real, lances)       | ❌     | Removido em `1291a6e`; volta na S11                                                                                                                                                                                           |
| Fornecedores / cadeia de suprimento        | ❌     | Nunca iniciado                                                                                                                                                                                                                |
| Favoritar (coração), etiquetas e inventário | 🟡     | Coração/etiqueta/decisão por (usuário, anúncio) com RLS, triagem por teclado, lente no feed, inventário global e dossiê em gaveta; provado em integração local pela tela |

## Plataforma

| Capacidade                                         | Estado | Observação                                                                                                                                                                                                 |
| -------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth + RLS owner-scoped                            | ✅     | Supabase, testado com usuário cruzado                                                                                                                                                                      |
| CRUD de projetos de pesquisa                       | ✅     | API + UI                                                                                                                                                                                                   |
| Fila de coleta com idempotência, lease, retry, DLQ | ✅     | Cloudflare Queues                                                                                                                                                                                          |
| Source circuit breaker, canaries, incidents (S8)   | 🟡     | Per-source circuit (block opens at once, 3 ordinary failures open for 15 min, single half-open probe), canary every 30 min via cron, error budget with hysteresis, DLQ messages become incidents, audited circuit reset, `/api/ops/health`; proven in local integration with a loopback 403 source |
| Self-heal for selector-based connectors (S9)       | 🟡     | Swappa only (the one HTML connector with selectors). Canary keeps each page by SHA-256; diagnosis classifies the failure and diffs markup tokens (no collected text reaches the agent); an LLM proposes an additive selector map (data, not code); sandbox replays the old page (must be identical) and the broken page, guards price meaning; trial canary; human approval or, with `SELF_HEAL_AUTONOMY=on`, autonomous apply; real canary after apply with automatic rollback; no autonomous retry after a rollback. Proven against a loopback redesign of the recorded page, not a live source |
| Raw store content-addressed (R2)                   | ✅     | SHA-256, schema version                                                                                                                                                                                    |
| Normalização + upsert transacional                 | ✅     | Identidade `(source_id, external_id)`                                                                                                                                                                      |
| Webhook de privacidade eBay                        | ✅     | Assinatura verificada, fila durável, R2 antes de PostgreSQL                                                                                                                                                |
| UI de resultados                                   | ✅     | Repositório lê IDs em blocos de 50 e recompõe ordem; painel de execução foi exercitado por coleta live no eBay Production com fonte, estado, funil, motivos e posição de chamadas até o terminal; a reidratação de runs históricas não existe |
| `/api/*` em produção                               | ❌     | Desabilitado (`PUBLIC_API_ENABLED=false`)                                                                                                                                                                  |

## Dívidas conhecidas

1. `researchCriteriaSchema` fixa `category: 'smartphone' | 'laptop'` e
   `brands: ['Apple']` como enum global — o núcleo é, hoje, tipado para iPhone e
   MacBook.
2. `rawListingPreviewSchema` exige `price`, o que impede qualquer documento não
   comercial de atravessar o pipeline.
3. Tabelas de F4–F7 continuam no banco, órfãs, até uma migration de limpeza
   revisada.
4. Quota efetiva do eBay, alerta de DLQ e política de replay/retention seguem
   pendentes.
5. `collection_runs.estimated_cost` permanece em zero porque não representa
   chamadas. A posição de requests passa a ser persistida quando o connector a
   reporta; quota efetiva, custo monetário e replay operacional seguem pendentes.
6. O painel de execução não reidrata uma run histórica; ele só preenche o funil
   após iniciar uma coleta. Duas tentativas do R4 perderam a conexão do
   Wrangler após a 17ª chamada; a execução seguinte pelo Miniflare/workerd
   direto chegou ao terminal, enquanto a run `0c39189b-971e-4234-9e72-f644392ccf72`
   permanece `running` com `finished_at` nulo como evidência honesta do abandono.
