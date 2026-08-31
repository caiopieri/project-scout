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
| eBay                                      | ✅     | Browse Production foi exercitado live: runs concluídas com 136, 137 e 22 anúncios observados, família de queries, triagem, reobservação de preço e funil live da UI; URLs reais foram conferidas. Quota efetiva, custo monetário e replay operacional seguem pendentes |
| Mercado Livre                             | 🟡     | Adapter + OAuth escritos, nunca rodaram live; suspenso por decisão de 2026-08-15                                                                                                                                                                                                     |
| Xianyu                                    | ❌     | Apenas boundary "indisponível"                                                                                                                                                                                                                                                       |
| OLX, Facebook Marketplace                 | ❌     | Nunca iniciados                                                                                                                                                                                                                                                                      |
| Leilões (AllSurplus, BidSpotter, Freitas) | ❌     | Nunca iniciados                                                                                                                                                                                                                                                                      |
| Fornecedores China / fabricantes          | ❌     | Nunca iniciados                                                                                                                                                                                                                                                                      |

## Inteligência

| Capacidade                                 | Estado | Observação                                                                                                                                                                                                                    |
| ------------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Interpretação de intenção                  | 🟡     | `DeterministicIntentInterpreter` — regras, sem LLM                                                                                                                                                                            |
| Análise de texto                           | 🟡     | `DeterministicTextAnalyzer` / `MockTextAnalyzer` e lote Gemini opt-in; evidência/defeito têm persistência transacional e unknown explícito, mas a prova com anúncio live e leitura detalhada ainda pendem de fonte/credencial |
| LLM real (qualquer provedor)               | 🟡     | Adapter Gemini REST com JSON estruturado, orçamento, timeout e fila local/produção declarada existe; chamada live, privacidade, quota e provisionamento remoto ainda pendentes                                                |
| Análise de imagem / checkup visual         | ❌     | Nenhuma implementação                                                                                                                                                                                                         |
| Triagem barata (filtro determinístico)     | ✅     | `CollectionTriageService`, decisões persistidas                                                                                                                                                                               |
| Identidade de produto / dedup cross-source | 🟡     | Candidatos gerados e revisáveis; sem clustering visual                                                                                                                                                                        |
| Valuation / oportunidade                   | 🟡     | `DeterministicValuationEngine` roda no consumidor, mas sem dados históricos suficientes; custo na porta US→US agora expõe preço/frete com origem explícita e custo indeterminado fica fora da valuation                                                                                                                                       |
| Score final e ranking de oportunidades     | ❌     | `packages/scoring` era só uma constante; removido                                                                                                                                                                             |
| Exportação CSV/XLSX                        | ❌     | `packages/exports` era só uma constante; removido                                                                                                                                                                             |
| Memória de mercado / histórico de preço    | ✅     | Ingestão transacional live gravou duas observações por 135 anúncios reobservados; 279 observações contra 189 snapshots confirmaram snapshots condicionados ao hash |
| Preço de referência por segmento           | ✅     | Rota e tela exibem mediana de preço pedido em minor units por produto inferido + condição; janela de 30 dias, mínimo 10 e IQR 1,5; amostras menores falham fechado                                                                 |
| Detecção de golpe                          | ❌     | 13 sinais especificados no PRD original §17, nenhum implementado                                                                                                                                                              |
| Risco de vendedor                          | ❌     | Nenhuma implementação                                                                                                                                                                                                         |
| Agente conversacional                      | ❌     | Contrato definido em `agente.md`; nada construído                                                                                                                                                                             |
| Leilões (edital, custo real, lances)       | ❌     | Removido em `1291a6e`; volta na S11                                                                                                                                                                                           |
| Fornecedores / cadeia de suprimento        | ❌     | Nunca iniciado                                                                                                                                                                                                                |
| Favoritar (coração)                        | ❌     | `user_listing_actions` existe desde o M1, sem endpoint nem tela                                                                                                                                                               |

## Plataforma

| Capacidade                                         | Estado | Observação                                                                                                                                                                                                 |
| -------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth + RLS owner-scoped                            | ✅     | Supabase, testado com usuário cruzado                                                                                                                                                                      |
| CRUD de projetos de pesquisa                       | ✅     | API + UI                                                                                                                                                                                                   |
| Fila de coleta com idempotência, lease, retry, DLQ | ✅     | Cloudflare Queues                                                                                                                                                                                          |
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
