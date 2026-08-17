# Project Scout — Roadmap vivo

Última atualização: **2026-08-17**

Este documento é a fonte rápida de status. Critérios completos de aceitação do
MVP estão em `docs/mvp-plan.md`; fases posteriores estão em
`docs/post-mvp-roadmap.md`.

## Legenda

| Estado       | Significado                                                                    |
| ------------ | ------------------------------------------------------------------------------ |
| Concluído    | Implementado e verificado no nível indicado                                    |
| Em andamento | Há implementação parcial e próximo gate definido                               |
| Parcial      | Existe fundação reaproveitável, mas a capacidade da fase ainda não está pronta |
| Planejado    | Documentado, sem implementação autorizada                                      |
| Bloqueado    | Depende de decisão, infraestrutura ou validação externa                        |

## Panorama executivo

| Fase                     | Estado               | Entregue                                                                                                                                                                                                                                                                                                                                                                    | Próximo gate                                                                                                                                                                                      |
| ------------------------ | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Legado M1–M7 + M6.1      | Concluído localmente | Fundação, auth/RLS, projetos, gateway, eBay, normalização, privacidade e análise textual determinística/mock                                                                                                                                                                                                                                                                | Preservar regressão durante a refatoração                                                                                                                                                         |
| F0 — Core                | Concluído localmente | Contratos, migration, repositórios, eventos de listing e health atômico normal/degradado                                                                                                                                                                                                                                                                                    | Revisão humana do gate antes de abrir F1                                                                                                                                                          |
| F1 — Três fontes         | Parcial              | Contrato/manifests, routing e adapters fixture-first para eBay, Mercado Livre e Xianyu boundary; smoke Production do eBay passou; gate local de títulos reduz peças/acessórios óbvios; telemetria sanitizada, snapshot do orçamento local, health semântico, guard KV local, limiter atômico Production via Durable Object e DLQs de coleta/análise; Mercado Livre suspenso | Fechar quota efetiva/global, alertas e política de replay/retention; DLQ de account deletion depende de revisão de privacidade; ML fica fora da sequência e Xianyu depende de contrato autorizado |
| F2 — Search Intelligence | Em andamento         | Query families, observações, triagem e candidatos cross-source persistidos; revisões humanas disponíveis; cheap filter/identidade/estados disponíveis como serviços                                                                                                                                                                                                         | Exercitar comparação com duas fontes live após os gates F1; enriquecer evidência multimodal                                                                                                       |
| F3 — Opportunity         | Em andamento         | Engine, persistência no consumidor de coleta, histórico por listing, condição, ciclo de vida e ajustes contextuais determinísticos                                                                                                                                                                                                                                          | Revisão de parâmetros por cliente e comparação cross-source live após gates F1                                                                                                                    |
| F4 — Self-healing        | Concluído localmente | F4.1–F4.5: classificação, propostas, histórico de propostas e runs sandbox com RLS/service_role-only                                                                                                                                                                                                                                                                        | Sem patch automático, execução live ou tráfego vinculante                                                                                                                                         |
| F5 — Leilões             | Concluído localmente | F5.1–F5.3: dossiê/custos, documentos/claims versionados e monitoramento por fixtures somente leitura                                                                                                                                                                                                                                                                        | Sem connector live, OCR, polling, lance ou ação automática                                                                                                                                        |
| F6 — Negociação          | Concluído localmente | F6.1–F6.4: contexto, rascunho, auditoria, frescor e follow-up contextual determinísticos, sempre sem envio e com revisão humana obrigatória                                                                                                                                                                                                                                 | Mantido local; integração Eletrofy está pendente                                                                                                                                                  |
| F7 — Local Action        | Concluído localmente | F7.1–F7.4: envelope, gate de expiração/replay, ledger owner-scoped e vínculo de sessão opaca; nenhum executor live, compra, lance, pagamento ou envio                                                                                                                                                                                                                       | Gate humano para qualquer executor; assinatura/integração real continuam pendentes                                                                                                                |

## Repriorização — 2026-08-15

Decisão: a integração/interface da Eletrofy fica pendente e não entra no
trabalho atual. O Mercado Livre também sai da sequência ativa; seus adapters e
fixtures permanecem preservados, mas não haverá novas tentativas live, OAuth,
smoke ou investigação de política até retomada explícita.

### Agora — fechar o núcleo

1. Preservar o baseline local F0–F7 e manter a regressão verde.
2. Fazer revisão final de segurança, limites, deploy e observabilidade sem
   habilitar ações vinculantes.
3. Preparar somente o caminho eBay, que é a fonte live prioritária.

### Depois — eBay operacional

1. Credenciais Production server-side confirmadas e smoke controlado passado
   em 2026-08-15, com 1 item retornado e sem persistência.
2. Validar quota efetiva/global, alertas e política de replay/retention; health semântico, telemetria local de requests, guard e limiter atômico, além das DLQs de coleta/análise, já estão verificados.
   O filtro local de títulos já rejeita exclusões explícitas, peças de
   reposição, palmrests, digitizers e caixas vazias antes de buscar detalhes;
   mantém candidatos de reparo como `cracked screen` e `parts only`.
3. Só então decidir se a coleta contínua eBay sai de mock para opt-in
   production.

### Mais tarde — fontes e cliente

1. Retomar Mercado Livre somente após nova decisão e resolução de política.
2. Avaliar Xianyu com contrato/compliance próprio; não contornar CAPTCHA ou
   endpoints privados.
3. Integrar a plataforma no site/interface da Eletrofy quando o núcleo estiver
   aprovado; isso inclui telas, API de apresentação e fluxo de revisão humana.

## Estratégia de representantes por camada de ingestão

O objetivo não é construir vários scrapers ao mesmo tempo. Cada camada terá um
representante autorizado, validado contra o mesmo contrato de identidade,
evidência, custo, limites e `collector_health`.

| Ordem | Camada                     | Representante              | Estado                                                  |
| ----- | -------------------------- | -------------------------- | ------------------------------------------------------- |
| 1     | API oficial                | eBay Browse API            | Prioridade atual; preparar gate Production              |
| 2     | JSON/GraphQL público       | A definir após o gate eBay | Planejado; não iniciar agora                            |
| 3     | WebSocket/SSE/long polling | A definir                  | Posterior, somente se houver acesso autorizado          |
| 4     | HTTP/HTML direto           | A definir                  | Posterior, com limites e compliance próprios            |
| 5     | Browser automatizado       | A definir                  | Posterior; sem contornar CAPTCHA ou controles de acesso |
| 6     | DOM/MutationObserver       | A definir                  | Posterior e dependente de browser autorizado            |
| 7     | Screenshot/OCR/multimodal  | A definir                  | Posterior; evidência auxiliar, não substitui identidade |

O próximo representante só entra depois que o anterior tiver contrato,
health semântico, orçamento de chamadas, deduplicação, observabilidade e
testes de falha verificados. Mercado Livre não é o representante da camada 2
neste momento: sua integração permanece estacionada.

## Estratégia de representantes por tipo de comércio

Além da camada técnica, cada fonte será escolhida para representar um caso de
uso comercial. Isso evita testar cinco fontes com o mesmo comportamento e
permite consolidar o núcleo de identidade, evidência, valuation e oportunidade
antes de ampliar a cobertura. O perfil comercial é uma dimensão do manifest;
não cria um motor separado para cada tipo.

| Ordem | Tipo de comércio                | Representante inicial | Camada técnica                      | Estado                           |
| ----- | ------------------------------- | --------------------- | ----------------------------------- | -------------------------------- |
| 1     | Marketplace de usados           | eBay                  | API oficial                         | Atual; único foco live           |
| 2     | Marketplace de produtos novos   | A definir             | API ou JSON autorizado              | Depois do gate eBay              |
| 3     | Fornecedor/B2B                  | A definir             | API, catálogo ou arquivo autorizado | Depois de consolidar marketplace |
| 4     | Leilão/liquidação               | A definir             | API, JSON ou HTML autorizado        | Depois; somente leitura          |
| 5     | Venda direta de pessoa física   | A definir             | Formulário/API ou fonte autorizada  | Posterior                        |
| 6     | Renovação de parque empresarial | Eletrofy              | Integração própria                  | Pendente; fora do trabalho atual |

O primeiro representante de cada tipo será implementado e validado como um
adaptador fino sobre o núcleo comum. Depois de os representantes estarem
consolidados, adicionar outra opção dentro do mesmo tipo deverá ser uma nova
conexão, com manifesto, mapeamento, health check e testes específicos — não a
reinvenção do pipeline de pesquisa, identidade, valuation ou oportunidade.

Sequência de consolidação:

1. Fechar eBay como marketplace de usados/API.
2. Escolher e validar um representante de produtos novos.
3. Escolher e validar um representante B2B/fornecedor.
4. Escolher e validar um representante de leilão/liquidação em modo somente
   leitura.
5. Consolidar os resultados cross-source e as diferenças de política por
   perfil.
6. Conectar fontes adicionais dentro de cada perfil, conforme autorização,
   custo e viabilidade.

## Baseline reaproveitado — M1–M7 e Marco 6.1

Estado: **concluído localmente**, com limites de produção preservados.

- Monorepo TypeScript, Next.js, Cloudflare Worker/Queues/KV/R2 e Supabase.
- Auth, RLS, CRUD de projetos e interpretação determinística revisável.
- `CollectionGateway`, mensagens mínimas `{version, runId}`, leases, retries e
  idempotência.
- Adapter oficial do eBay, OAuth, busca/detalhes, orçamento rígido de chamadas,
  fixtures e smoke tests.
- Normalização, raw content-addressed em R2, snapshots, preço e deduplicação por
  `(source_id, external_id)`.
- Privacy gate eBay com assinatura, fila durável, exclusão R2-first e auditoria
  sem identificadores de conta.
- Análise textual determinística/mock com evidências, defeitos e metadados de
  versão.

Limites atuais:

- Produção continua em modo de coleta mock.
- `/api/*` público continua desabilitado em produção.
- Queue de análise e LLM real não estão provisionados em produção.
- Análise visual real não está implementada.

## F0 — Core, eventos e saúde semântica

Estado: **concluído e verificado localmente**.

Concluído nesta fase:

- Schemas Zod e tipos de domínio para eventos versionados.
- Estados de health: `NORMAL`, `LOGIN_REQUIRED`, `CAPTCHA`, `EMPTY_RESULTS`,
  `RATE_LIMITED`, `ERROR`, `MODAL_BLOCKING` e `CONTENT_CHANGED`.
- Completude semântica de listing ID, preço e título.
- Deduplicação de eventos por fonte e chave.
- Migration `20260811160000_f0_observation_events_health.sql` para
  `observation_events` e `collector_health_checks`.
- RLS habilitada; leitura e escrita reservadas a `service_role` nesta fase.
- Reset completo do Supabase local e testes PostgreSQL reais de constraints,
  grants, RLS e idempotência.
- Ports e adapter PostgreSQL para eventos e health.
- Trigger transacional para descoberta, atualização, preço, descrição, remoção e
  reaparecimento de listings.
- Conclusão atômica da collection run com health `NORMAL` ou `EMPTY_RESULTS`,
  deduplicado por `collection_run_id`.
- Transições de retry/falha registram health degradado por tentativa, usando
  somente códigos internos sanitizados.
- Classificação inicial de `RATE_LIMITED`, `LOGIN_REQUIRED`, `CONTENT_CHANGED`
  e `ERROR`.
- Testes unitários, estruturais e de integração dos contratos, repositórios,
  migration e Worker.

Gate verificado:

1. Migrations aplicam do zero e seed dispara eventos canônicos.
2. Reentrega idêntica não duplica evento nem health da mesma tentativa/estado.
3. Mudanças de preço, descrição e status geram fatos separados.
4. Runs concluídas e runs degradadas persistem status + health atomicamente.
5. `authenticated` não consegue ler ou mutar eventos/telemetria internos.
6. Suíte completa, typecheck, lint e build passaram.

## F1 — Boundary de três fontes

Estado: **parcial**; o fluxo está roteado, mas fontes live exigem credenciais e gates próprios.

Concluído nesta fatia:

- `SourceConnector.source` agora é vendor-neutral e cada connector declara um
  manifest validado por Zod.
- O gateway usa limites e camada primária do manifest, mantendo overrides locais
  explícitos para testes.
- eBay declara API oficial como camada 1 e fallbacks futuros desabilitados.
- Mercado Livre possui adapter API/OAuth BR, schemas, conversão de preço em
  minor units, paginação limitada e fixtures sem rede.
- O bootstrap OAuth local do Mercado Livre abre a autorização oficial, usa o
  callback HTTPS registrado no Eletrofy, valida `state`, troca o código pelo
  par de tokens e grava o resultado atomicamente em `.dev.vars`; o callback
  público nunca retorna tokens.
- Worker só roteia Mercado Livre para o adapter oficial quando `ML_CONNECTOR_MODE`
  é explicitamente `production` e existe `ML_ACCESS_TOKEN` ou o trio completo
  `ML_CLIENT_ID`/`ML_CLIENT_SECRET`/`ML_REFRESH_TOKEN`; sem credencial de acesso
  ou refresh completa, a fonte permanece indisponível.
- O bootstrap OAuth usa `state` e PKCE (`S256`); o adapter renova o access token
  somente após `401`, uma única vez por requisição, e coalesce refreshes
  concorrentes, sem enviar credenciais OAuth ao frontend.
- O smoke live do Mercado Livre está pendente: o token atual foi aceito por
  `/users/me`, mas as buscas retornaram `403` de política. Esse caso não consome
  refresh token e é classificado como `ML_POLICY_UNAUTHORIZED`.

Pendente: habilitar cada fonte somente após credenciais, termos e limites serem
revisados; Xianyu permanece indisponível até existir contrato autorizado. A
coleta live do eBay continua opt-in por `EBAY_CONNECTOR_MODE` e nunca é ativada
por default.

## F2 — Search Intelligence e Product Identity

Estado: **em andamento**; a expansão de consultas já é acionada pelo pipeline de
collection e observações candidatas podem ser revisadas pelo proprietário.

Concluído nesta fatia:

- Famílias versionadas com termos exatos, aliases, abreviações, idioma local e
  typo controlado.
- Termos aprendidos só entram em execução quando a observação está `accepted`
  e carrega evidência; candidatos continuam fora da busca.
- Cheap filter para duplicata, exclusão explícita, categoria incompatível e
  preço-isca com revisão em vez de rejeição automática.
- Product Identity Engine com confiança, evidências e `mergeEligible=false`.
- Classificador de estados com `NEEDS_HUMAN_REVIEW`, `PRICE_BAIT`, `DUPLICATE`,
  `WRONG_PRODUCT` e `DISCOVERED`.
- Persistência owner-scoped das decisões de triagem por anúncio, com versão,
  identidade, motivos e indicação de revisão humana.
- Persistência owner-scoped da família efetivamente usada por coleta, com
  observações candidatas idempotentes; somente observações `accepted` são
  recarregadas para expansão futura.
- Interface e rota autenticada para listar observações e aceitar/rejeitar apenas
  o status, com `UPDATE(status)` owner-scoped no RLS.
- Termos aceitos substituem a variante automática equivalente na família auditada
  e aparecem como `learned`, sem duplicar consultas.
- Decisões determinísticas são exibidas junto aos anúncios coletados e podem
  receber revisão humana persistida separadamente, sem sobrescrever a decisão
  original.
- A revisão de anúncio passa por RPC owner-scoped com validação do vínculo
  projeto/anúncio; `service_role` continua reservado ao consumidor de coleta.
- Identidade aproveita atributos estruturados e presença de mídia somente após
  validação; evidências registram se vieram de atributo, título ou mídia.
- Comparador cross-source conservador exige fontes distintas, identidades
  `MATCHED`, chave canônica igual e marca/modelo estruturados corroborados;
  resultados incompletos vão para revisão e `mergeEligible` permanece `false`.
- Conflitos estruturados de marca, modelo, variante, armazenamento ou memória
  são rejeitados como não correspondentes; título/preço isolados nunca geram
  candidato de fusão.
- Candidatos `MATCH_CANDIDATE` e `REVIEW` são persistidos por par determinístico,
  expostos na API e revisáveis pelo proprietário via RPC; aceitar um candidato
  não altera as identidades canônicas nem habilita fusão automática.

Pendente:

- Executar a comparação com duas fontes live após os gates de credenciais,
  limites e saúde semântica de F1.

## F3 — Opportunity Intelligence

Estado: **em andamento**. O engine determinístico é acionado após a ingestão
quando o projeto declara `opportunityPolicy`; o pacote de scoring legado continua
separado.

Concluído nesta fatia:

- Comparáveis na mesma moeda com remoção de outliers por IQR.
- Estimativa de mercado e preço máximo de compra derivados de política
  parametrizada: processamento, reparo, taxa transacional e margem.
- Scores versionados de deal, trend, liquidity, seller pressure e
  risk/confidence.
- Histórico de preço, evidências, lacunas e explicação determinística.

Concluído nesta integração:

- Valuation por listing após normalização, com saída versionada persistida por
  service role no consumidor de coleta.
- Consulta `GET /api/projects/:projectId/listings/:listingId/valuation`, somente
  leitura e limitada pelo vínculo owner-scoped do projeto.
- Política de custos/margem pertence aos critérios do projeto; nenhuma regra da
  Eletrofy está codificada no núcleo.
- Política de valuation revisável na interface (processamento, reparo, margem e
  taxa), com mercado estimado, compra máxima e deal score junto aos anúncios.
- Comparáveis são filtrados por condição informada, com fallback explícito e
  lacuna registrada quando não há amostra compatível.
- O consumidor de coleta lê o histórico de preço persistido por listing via
  adapter Supabase server-side, converte unidades monetárias com arredondamento
  explícito e registra a evidência longitudinal somente quando há pelo menos
  dois pontos.
- O valuation lê eventos F0 persistidos por `(source_id, external_id)` no
  consumidor server-side, conta remoções, retornos e alterações de descrição,
  registra a evidência de ciclo de vida e reduz a confiança de forma limitada
  quando o anúncio demonstra instabilidade.

Concluído nesta fatia:

- Contexto opcional e validado por listing para versão ranqueada, localização,
  frete conhecido e quantidade do lote.
- Comparáveis são convertidos para custo unitário; versões com ranking explícito
  recebem ajuste parametrizado e localidades diferentes recebem ajuste
  conservador configurável.
- A política mantém defaults neutros para fontes sem contexto e registra no
  output quais ajustes foram aplicados.

Pendente:

- Parâmetros adicionais por cliente para garantia e preço máximo, sem acoplar
  regras da Eletrofy ao núcleo.
- Suporte posterior a lotes como composição de unidades, sem iniciar leilões ou
  compra automática.

## F4–F7 — Execução incremental pós-MVP

Estado: **autorizado incrementalmente pelo fundador**; credenciais, termos,
tráfego live e ações vinculantes continuam pendentes de ação humana.

- F4: AI Maintainer connector-scoped com replay, testes, canary, repair budget
  e rollback.
- F5: dossiê de leilão, documentos versionados, custo total e monitoramento ao
  vivo.
- F6: negociação assistida, pedido de evidências e follow-up dentro de política.
- F7: Local User Plane, GUI fallback, autorização assinada, idempotência e
  execução controlada.

F4.1 concluído nesta fatia: falhas são classificadas de forma determinística
em parser, network, auth, proxy, semantic ou source; nenhum patch é aplicado.
F4.2 concluído nesta fatia: propostas `PROPOSED` e não executáveis exigem
fixture, canary de até 25%, orçamento limitado, rollback e aprovação humana.
F4.3 concluído nesta fatia: propostas são persistidas em tabela interna com
contrato validado no adapter, RLS habilitado e acesso restrito a `service_role`;
nenhum acesso browser ou RPC foi criado.
F4.4 concluído nesta fatia: replay aceita somente proposta `APPROVED` em
`sandbox`, aplica canary/orçamento determinísticos e converte falha em
`ROLLED_BACK`; nenhum patch, rede, fila ou connector é mutado.
F4.5 concluído nesta fatia: resultados de replay são persistidos em tabela
interna com adapter validado, migration oficial, RLS e acesso apenas interno;
nenhum endpoint browser foi criado.

F6.1 concluído nesta fatia: contexto de negociação para eletrônicos aceita
somente eBay, Mercado Livre e Xianyu; evidências são referências validadas;
oferta sugerida fica limitada ao alvo, preço pedido e máximo explícito do
usuário; o builder produz apenas rascunho com revisão humana, `sent=false` e
`executable=false`, sem rede, LLM, credencial, fila ou envio.

F6.2 concluído nesta fatia: snapshots já validados de contexto e sugestão são
persistidos em `negotiation_drafts`; authenticated possui somente leitura
owner-scoped via RLS e `service_role` é o único escritor. Não há endpoint,
RPC, transporte ou alteração de status de aprovação.

F6.3 concluído nesta fatia: checker determinístico usa a evidência mais recente
e uma janela fornecida pelo chamador; contexto expirado ou com timestamp futuro
fica `usable=false` e exige revalidação. Não há consulta live nem relógio
implícito do sistema.

F6.4 concluído nesta fatia: respostas observadas geram rascunho contextual ou
`DO_NOT_FOLLOW_UP`; recusa não cria blacklist permanente, texto hostil não é
interpolado e qualquer possível resposta permanece manual, não enviada e não
executável.

F7.1 concluído nesta fatia: envelope `authorization-envelope.v1` exige ação
permitida, listing/fonte, custo total igual a preço vezes quantidade, limite
explícito, emissão, expiração e chave idempotente. O resultado fica pendente de
aprovação humana, não aprovado e não executável; nenhum executor foi criado.

F7.2 concluído nesta fatia: gate determinístico recebe timestamps fornecidos
pelo chamador e indicação externa de consumo; prioriza `REPLAYED`, depois
`EXPIRED`, e nunca sai de `AWAITING_HUMAN_APPROVAL` para execução. Não há ledger
ou executor nesta unidade.

F7.3 concluído nesta fatia: `authorization_envelope_ledger` persiste snapshots
já validados, chave idempotente e estado de consumo com RLS owner-scoped;
repetição idêntica é estável e envelope divergente falha. `service_role` é o
único escritor e nenhuma mudança chama executor.

F7.4 concluído nesta fatia: gate de sessão compara usuário, sessão opaca e
janela de vínculo; mismatch/expiração falham fechado. `SESSION_MATCH` não é
autorização nem execução, e o checker não valida Supabase Auth por conta própria.

## Qualidade e verificação

Último baseline completo executado em 2026-08-15:

- `npm run typecheck`: passou.
- `npm run lint`: passou.
- `npm run build`: passou.
- `npm run test`: **295/295 passaram, sem skips**.
- A migration F0 aplica do zero no Supabase local.
- `npm run db:test`: **71/71 passaram**.
- Formatação dos arquivos tocados: passou.
- `npm run format:check` global continua vermelho por 25 arquivos legados e
  artefatos de `supabase/.temp`; nenhum deles foi reformatado nesta fatia.

## Próxima fatia autorizada

Smoke técnico do eBay Production passou em 2026-08-15, o gate local de títulos,
a telemetria sanitizada do orçamento e o health semântico foram implementados e
verificados, mas a coleta contínua ainda não foi habilitada:
vínculo de sessão local e contratos seguros estão
verificados, mas não há executor live, compra, lance, pagamento ou envio.
Mercado Livre está suspenso e a integração Eletrofy está explicitamente
pendente. O guard configurável de rate limit já está aplicado ao connector
Production, e as DLQs de coleta/análise estão configuradas. A quota efetiva,
alertas e a política de replay/retention continuam pendentes; o smoke permanece
opt-in e a coleta persistente em mock até
revisão explícita.

## Onde isto pode dar errado

- O status fica obsoleto se não for atualizado junto com cada gate.
- Teste unitário de SQL não substitui aplicação real da migration.
- Xianyu pode exigir revisão de viabilidade e compliance antes de qualquer
  implementação.
- Valuation sem dados longitudinais suficientes pode transmitir falsa precisão.
- Regras específicas da Eletrofy devem entrar por configuração ou integração,
  não como lógica fixa do Project Scout.
- F4–F7 devem avançar somente por handoffs separados, com revisão e testes.
