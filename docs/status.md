# Estado real — verificado em 2026-08-28

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
| Camada 1 — API oficial (eBay Browse)                | 🟡     | OAuth, orçamento explícito e rate limit atômico; família de até três queries, filtro barato antes do detalhe, previews rejeitados preservados para triagem e leitura em lotes de 50 têm prova local/fixture; a prova live ≥100 ainda depende do Engineer |
| Camada 2 — endpoint JSON/GraphQL                    | ❌     | Nenhuma implementação                                                                                                                                                                                                                                    |
| Camada 3 — WebSocket/SSE                            | ❌     | Nenhuma implementação                                                                                                                                                                                                                                    |
| Camada 4 — HTTP/HTML direto                         | ❌     | Nenhuma implementação                                                                                                                                                                                                                                    |
| Camada 5 — navegador automatizado                   | ❌     | Sem Playwright, sem Browser Rendering                                                                                                                                                                                                                    |
| Camada 6 — DOM/MutationObserver                     | ❌     | Nenhuma implementação                                                                                                                                                                                                                                    |
| Camada 7 — screenshot/OCR                           | ❌     | Nenhuma implementação                                                                                                                                                                                                                                    |
| `ScrapingProvider` (porta genérica)                 | 🟡     | Interface existe em `packages/domain`; zero implementações                                                                                                                                                                                               |
| Proxy / rotação de IP                               | ❌     | Nenhuma implementação                                                                                                                                                                                                                                    |
| Local Agent (coleta na máquina do usuário)          | ❌     | Nenhuma implementação                                                                                                                                                                                                                                    |
| Auto-cura (detectar quebra → diagnosticar → propor) | ❌     | Removido em `1291a6e`; eram funções puras sem chamador                                                                                                                                                                                                   |

## Fontes

| Fonte                                     | Estado | Observação                                                                                                                                                                                                                                                                           |
| ----------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| eBay                                      | 🟡     | A busca Production anterior fez 210 chamadas e deixou a run `running`; volume, filtro pré-detalhe, família de queries e reliability têm prova local/fixture, mas o aceite live segue pendente por orçamento efetivo 50; fechamento completo depende da execução live pelo Engenheiro |
| Mercado Livre                             | 🟡     | Adapter + OAuth escritos, nunca rodaram live; suspenso por decisão de 2026-08-15                                                                                                                                                                                                     |
| Xianyu                                    | ❌     | Apenas boundary "indisponível"                                                                                                                                                                                                                                                       |
| OLX, Facebook Marketplace                 | ❌     | Nunca iniciados                                                                                                                                                                                                                                                                      |
| Leilões (AllSurplus, BidSpotter, Freitas) | ❌     | Nunca iniciados                                                                                                                                                                                                                                                                      |
| Fornecedores China / fabricantes          | ❌     | Nunca iniciados                                                                                                                                                                                                                                                                      |

## Inteligência

| Capacidade                                 | Estado | Observação                                                                                                                                                  |
| ------------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Interpretação de intenção                  | 🟡     | `DeterministicIntentInterpreter` — regras, sem LLM                                                                                                          |
| Análise de texto                           | 🟡     | `DeterministicTextAnalyzer` / `MockTextAnalyzer` e lote Gemini opt-in; evidência/defeito têm persistência transacional e unknown explícito, mas a prova com anúncio live e leitura detalhada ainda pendem de fonte/credencial                                                                                           |
| LLM real (qualquer provedor)               | 🟡     | Adapter Gemini REST com JSON estruturado, orçamento, timeout e fila local/produção declarada existe; chamada live, privacidade, quota e provisionamento remoto ainda pendentes           |
| Análise de imagem / checkup visual         | ❌     | Nenhuma implementação                                                                                                                                       |
| Triagem barata (filtro determinístico)     | ✅     | `CollectionTriageService`, decisões persistidas                                                                                                             |
| Identidade de produto / dedup cross-source | 🟡     | Candidatos gerados e revisáveis; sem clustering visual                                                                                                      |
| Valuation / oportunidade                   | 🟡     | `DeterministicValuationEngine` roda no consumidor, mas sem dados históricos suficientes                                                                     |
| Score final e ranking de oportunidades     | ❌     | `packages/scoring` era só uma constante; removido                                                                                                           |
| Exportação CSV/XLSX                        | ❌     | `packages/exports` era só uma constante; removido                                                                                                           |
| Memória de mercado / histórico de preço    | 🟡     | Ingestão transacional grava uma observação por coleta e mantém snapshots condicionados ao hash; API/UI de série passaram em integração local, live pendente |
| Preço de referência por produto            | ❌     | Depende do acervo acumular ao longo do tempo                                                                                                                |
| Detecção de golpe                          | ❌     | 13 sinais especificados no PRD original §17, nenhum implementado                                                                                            |
| Risco de vendedor                          | ❌     | Nenhuma implementação                                                                                                                                       |
| Agente conversacional                      | ❌     | Contrato definido em `agente.md`; nada construído                                                                                                           |
| Leilões (edital, custo real, lances)       | ❌     | Removido em `1291a6e`; volta na S11                                                                                                                         |
| Fornecedores / cadeia de suprimento        | ❌     | Nunca iniciado                                                                                                                                              |
| Favoritar (coração)                        | ❌     | `user_listing_actions` existe desde o M1, sem endpoint nem tela                                                                                             |

## Plataforma

| Capacidade                                         | Estado | Observação                                                                                                                                                                                                 |
| -------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth + RLS owner-scoped                            | ✅     | Supabase, testado com usuário cruzado                                                                                                                                                                      |
| CRUD de projetos de pesquisa                       | ✅     | API + UI                                                                                                                                                                                                   |
| Fila de coleta com idempotência, lease, retry, DLQ | ✅     | Cloudflare Queues                                                                                                                                                                                          |
| Raw store content-addressed (R2)                   | ✅     | SHA-256, schema version                                                                                                                                                                                    |
| Normalização + upsert transacional                 | ✅     | Identidade `(source_id, external_id)`                                                                                                                                                                      |
| Webhook de privacidade eBay                        | ✅     | Assinatura verificada, fila durável, R2 antes de PostgreSQL                                                                                                                                                |
| UI de resultados                                   | 🟡     | Repositório lê IDs em blocos de 50 e recompõe ordem em fixture de 123; painel de execução mostra estado/funil, motivos, posição de chamadas e estado parcial; live ≥100 e custo monetário seguem pendentes |
| `/api/*` em produção                               | ❌     | Desabilitado (`PUBLIC_API_ENABLED=false`)                                                                                                                                                                  |

## Dívidas conhecidas

1. `researchCriteriaSchema` fixa `category: 'smartphone' | 'laptop'` e
   `brands: ['Apple']` como enum global — o núcleo é, hoje, tipado para iPhone e
   MacBook.
2. `rawListingPreviewSchema` exige `price`, o que impede qualquer documento não
   comercial de atravessar o pipeline.
3. Tabelas de F4–F7 continuam no banco, órfãs, até uma migration de limpeza
   revisada.
4. `npm run format:check` global está vermelho por ~25 arquivos legados.
5. Quota efetiva do eBay, alerta de DLQ e política de replay/retention seguem
   pendentes.
6. `collection_runs.estimated_cost` permanece em zero porque não representa
   chamadas. A posição de requests passa a ser persistida quando o connector a
   reporta; quota efetiva, custo monetário e replay operacional seguem pendentes.
