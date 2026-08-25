# Estado real — verificado em 2026-08-25

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

| Capacidade                                          | Estado | Observação                                                                                                                                                                                                                                           |
| --------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Camada 1 — API oficial (eBay Browse)                | 🟡     | OAuth, orçamento explícito e rate limit atômico; `d147ad3` adicionou triagem e leitura em lotes de 50, com 123 registros provados em fixture e CI verde; a prova live ≥100 não rodou porque o ambiente do Engenheiro limita a execução a 50 chamadas |
| Camada 2 — endpoint JSON/GraphQL                    | ❌     | Nenhuma implementação                                                                                                                                                                                                                                |
| Camada 3 — WebSocket/SSE                            | ❌     | Nenhuma implementação                                                                                                                                                                                                                                |
| Camada 4 — HTTP/HTML direto                         | ❌     | Nenhuma implementação                                                                                                                                                                                                                                |
| Camada 5 — navegador automatizado                   | ❌     | Sem Playwright, sem Browser Rendering                                                                                                                                                                                                                |
| Camada 6 — DOM/MutationObserver                     | ❌     | Nenhuma implementação                                                                                                                                                                                                                                |
| Camada 7 — screenshot/OCR                           | ❌     | Nenhuma implementação                                                                                                                                                                                                                                |
| `ScrapingProvider` (porta genérica)                 | 🟡     | Interface existe em `packages/domain`; zero implementações                                                                                                                                                                                           |
| Proxy / rotação de IP                               | ❌     | Nenhuma implementação                                                                                                                                                                                                                                |
| Local Agent (coleta na máquina do usuário)          | ❌     | Nenhuma implementação                                                                                                                                                                                                                                |
| Auto-cura (detectar quebra → diagnosticar → propor) | ❌     | Removido em `1291a6e`; eram funções puras sem chamador                                                                                                                                                                                               |

## Fontes

| Fonte                                     | Estado | Observação                                                                                                                                                                                                                         |
| ----------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| eBay                                      | 🟡     | A busca Production anterior fez 210 chamadas e deixou a run `running`; S1.1b-1b-volume está mergeada/CI-verde, mas live segue pendente por orçamento efetivo 50; fechamento completo depende de volume live e S1.1b-1b-reliability |
| Mercado Livre                             | 🟡     | Adapter + OAuth escritos, nunca rodaram live; suspenso por decisão de 2026-08-15                                                                                                                                                   |
| Xianyu                                    | ❌     | Apenas boundary "indisponível"                                                                                                                                                                                                     |
| OLX, Facebook Marketplace                 | ❌     | Nunca iniciados                                                                                                                                                                                                                    |
| Leilões (AllSurplus, BidSpotter, Freitas) | ❌     | Nunca iniciados                                                                                                                                                                                                                    |
| Fornecedores China / fabricantes          | ❌     | Nunca iniciados                                                                                                                                                                                                                    |

## Inteligência

| Capacidade                                 | Estado | Observação                                                                              |
| ------------------------------------------ | ------ | --------------------------------------------------------------------------------------- |
| Interpretação de intenção                  | 🟡     | `DeterministicIntentInterpreter` — regras, sem LLM                                      |
| Análise de texto                           | 🟡     | `DeterministicTextAnalyzer` / `MockTextAnalyzer` — regex, sem LLM                       |
| LLM real (qualquer provedor)               | ❌     | `GEMINI_API_KEY` está no `.env.example` e **não é lido por nenhuma linha**              |
| Análise de imagem / checkup visual         | ❌     | Nenhuma implementação                                                                   |
| Triagem barata (filtro determinístico)     | ✅     | `CollectionTriageService`, decisões persistidas                                         |
| Identidade de produto / dedup cross-source | 🟡     | Candidatos gerados e revisáveis; sem clustering visual                                  |
| Valuation / oportunidade                   | 🟡     | `DeterministicValuationEngine` roda no consumidor, mas sem dados históricos suficientes |
| Score final e ranking de oportunidades     | ❌     | `packages/scoring` era só uma constante; removido                                       |
| Exportação CSV/XLSX                        | ❌     | `packages/exports` era só uma constante; removido                                       |
| Memória de mercado / histórico de preço    | ❌     | `price_history` e `listing_snapshots` existem no banco, nada escreve neles              |
| Preço de referência por produto            | ❌     | Depende do acervo acumular ao longo do tempo                                            |
| Detecção de golpe                          | ❌     | 13 sinais especificados no PRD original §17, nenhum implementado                        |
| Risco de vendedor                          | ❌     | Nenhuma implementação                                                                   |
| Agente conversacional                      | ❌     | Contrato definido em `agente.md`; nada construído                                       |
| Leilões (edital, custo real, lances)       | ❌     | Removido em `1291a6e`; volta na S11                                                     |
| Fornecedores / cadeia de suprimento        | ❌     | Nunca iniciado                                                                          |
| Favoritar (coração)                        | ❌     | `user_listing_actions` existe desde o M1, sem endpoint nem tela                         |

## Plataforma

| Capacidade                                         | Estado | Observação                                                                                                                                |
| -------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Auth + RLS owner-scoped                            | ✅     | Supabase, testado com usuário cruzado                                                                                                     |
| CRUD de projetos de pesquisa                       | ✅     | API + UI                                                                                                                                  |
| Fila de coleta com idempotência, lease, retry, DLQ | ✅     | Cloudflare Queues                                                                                                                         |
| Raw store content-addressed (R2)                   | ✅     | SHA-256, schema version                                                                                                                   |
| Normalização + upsert transacional                 | ✅     | Identidade `(source_id, external_id)`                                                                                                     |
| Webhook de privacidade eBay                        | ✅     | Assinatura verificada, fila durável, R2 antes de PostgreSQL                                                                               |
| UI de resultados                                   | 🟡     | Repositório lê IDs em blocos de 50 e recompõe ordem em fixture de 123; live ≥100 pendente; página segue sem ranking, filtro ou comparação |
| `/api/*` em produção                               | ❌     | Desabilitado (`PUBLIC_API_ENABLED=false`)                                                                                                 |

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
6. `collection_runs.estimated_cost` permanece em zero; a telemetria de chamadas
   da S1.1 fica apenas em log sanitizado e será tratada junto do histórico/tela
   nas próximas fatias.
