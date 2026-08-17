# Arquitetura — Project Scout

> Como construir. O que **já está construído** está em [status.md](./status.md);
> não deduza capacidade a partir deste documento.

---

## 1. A divisão que organiza tudo: núcleo × vertical

O erro mais caro possível aqui é deixar vocabulário de comércio entrar no
núcleo. Ele já entrou (ver dívidas 1 e 2 em [status.md](./status.md)) e será
desfeito na fatia S5.

```
┌─────────────────────────────────────────────────────┐
│ VERTICAL — "comércio de eletrônicos"                │
│ preço · condição · defeito · frete · imposto        │
│ reparo · margem · vendedor · golpe · oportunidade   │
└───────────────────────▲─────────────────────────────┘
                        │  mapper + schema da vertical
┌───────────────────────┴─────────────────────────────┐
│ NÚCLEO — coleta e entendimento genéricos            │
│ SourceDocument · cascata · sessão · proxy · saúde   │
│ identidade · dedup · extração dirigida por schema   │
│ fila · idempotência · raw store · proveniência      │
└─────────────────────────────────────────────────────┘
```

**A costura é `SourceDocument`:**

```ts
interface SourceDocument {
  sourceId: string;
  externalId: string; // identidade dentro da fonte
  url: string;
  fetchedAt: Date;
  contentHash: string; // SHA-256 canônico
  schemaVersion: string;
  layer: IngestionLayer; // qual camada da cascata produziu isto
  payload: JsonObject; // cru, como veio
}
```

Sem preço. Sem título obrigatório além da identidade. O núcleo transporta,
versiona, deduplica e mede saúde; **quem sabe o que é "preço" é o mapper da
vertical**. Um vídeo do YouTube ou uma thread de fórum atravessa o mesmo núcleo
sem uma linha nova nele.

Teste mental antes de qualquer PR: _"esta linha faria sentido se a fonte fosse
um fórum?"_ Se não, ela pertence ao connector ou à vertical.

---

## 2. Cascata de coleta

`CollectionGateway` escolhe a camada por fonte, declarada no `ConnectorManifest`
com primária e fallback. Trocar de camada em execução é comportamento normal.

| #   | Camada                                | Quando                                   | Custo  | Estado  |
| --- | ------------------------------------- | ---------------------------------------- | ------ | ------- |
| 1   | API oficial / webhook                 | Existe e cobre a necessidade             | mínimo | eBay ✅ |
| 2   | Endpoint JSON/GraphQL do próprio site | Frontend consome API interna pública     | baixo  | ❌      |
| 3   | WebSocket / SSE / long polling        | Lance, preço vivo, mudança em tempo real | baixo  | ❌      |
| 4   | HTTP/HTML direto                      | Dado vem no HTML, sem JS                 | baixo  | ❌ (S5) |
| 5   | Navegador automatizado                | JS, sessão, interação                    | alto   | ❌ (S6) |
| 6   | DOM / MutationObserver                | Página viva sem fonte estruturada        | alto   | ❌      |
| 7   | Screenshot + OCR / multimodal         | Só é confiável visualmente               | máximo | ❌      |

Portas:

```ts
interface ScrapingProvider {
  // uma implementação por camada
  readonly layer: IngestionLayer;
  fetch(input: FetchInput): Promise<FetchedContent>;
  health(): Promise<ProviderHealth>;
}

interface SourceConnector {
  // uma implementação por fonte
  readonly source: string;
  readonly manifest: ConnectorManifest; // camadas, limites, perfil comercial
  search(input: ConnectorSearchInput): Promise<ConnectorSearchPage>;
  fetchDetails(externalId: string): Promise<SourceDocument>;
}
```

O connector **nunca** faz `fetch()` direto: ele pede ao provider da camada. É
isso que permite trocar HTML por navegador sem reescrever o connector, e é onde
a auto-cura vai atuar.

**Limites inegociáveis:** sem contornar CAPTCHA, sem burlar controle de acesso,
sem credencial de terceiro, com limite de taxa próprio por fonte.

---

## 3. Três planos de execução, um contrato

| Plano           | Onde roda                          | Para quê                                           |
| --------------- | ---------------------------------- | -------------------------------------------------- |
| **Nuvem**       | Cloudflare Worker + Queues         | Volume, agendado, fonte pública                    |
| **Local Agent** | Processo na máquina do Caio        | Fonte com login próprio, leilão vivo, fonte hostil |
| **Híbrido**     | Descoberta na nuvem, detalhe local | O caso comum quando há sessão envolvida            |

O Local Agent (S6) **puxa** tarefas — nunca expõe porta de entrada. Ele
autentica contra a API, recebe tarefa, executa com o perfil de navegador do
usuário e devolve `SourceDocument`. Regra dura: **credencial e cookie do usuário
não saem da máquina dele**; sobe documento coletado, nunca sessão.

---

## 4. Funil de custo

Gastar informação na ordem certa é a economia do sistema. Não baixe 12 imagens
de um anúncio cujo título já diz "somente caixa".

| Camada          | Trabalho                                      | Custo               |
| --------------- | --------------------------------------------- | ------------------- |
| 0 Descoberta    | ID, título, preço, URL, miniatura, vendedor   | muito baixo         |
| 1 Filtro barato | Relevância, isca, categoria errada, duplicata | baixo               |
| 2 Detalhe       | Descrição, condição, frete, atributos         | baixo/médio         |
| 3 Mídia         | Imagens só dos candidatos                     | médio               |
| 4 IA multimodal | Produto real, condição, incoerência, risco    | médio/alto          |
| 5 Investigação  | Mercado, liquidez, histórico, documentação    | alto, só finalistas |

Cada camada registra custo e completude em `collector_health`. Circuit breaker
por fonte e por camada evita tempestade de retry.

---

## 5. Pipeline

```
Intenção em linguagem natural
   └─► Interpretação → critério estruturado revisável
        └─► Famílias de query por fonte
             └─► CollectionGateway → cascata → SourceDocument
                  ├─► Raw store R2 (content-addressed, proveniência)
                  └─► Mapper da vertical → normalização → upsert transacional
                       └─► Triagem barata (determinística, sem IA)
                            └─► Análise de texto (LLM, dirigida por schema)
                                 └─► Análise visual (multimodal, só finalistas)
                                      └─► Evidência graduada
                                           └─► Custo total + oportunidade
                                                └─► Feed ranqueado / alerta / export
```

Identidade canônica: `(source_id, external_id)`. Hash SHA-256 do raw suprime
snapshot duplicado e detecta atualização. IDs diferentes **nunca** são fundidos
automaticamente — viram candidato cross-source com revisão humana.

---

## 6. Fronteira de IA

```ts
interface StructuredExtractor {
  readonly provider: string;
  readonly model: string;
  readonly promptVersion: string;
  extract<T>(input: ExtractionInput, schema: JsonSchema<T>): Promise<T>;
}
```

O extrator **não conhece o domínio**. Quem passa o schema de saída é o chamador
— a vertical de comércio pede defeitos e evidências; uma futura vertical de
fórum pediria outra coisa. É o mesmo trabalho de implementar, e é o que impede
o núcleo de nascer amarrado a eletrônicos.

Regras:

- Conteúdo coletado entra sempre em tag estrita e nunca decide chamada de
  ferramenta.
- Saída validada por Zod. Saída inválida é erro, não "melhor esforço".
- Provider, modelo e versão de prompt persistidos junto do resultado.
- Teste usa resposta gravada (cassete). Nenhuma suíte chama a rede.
- Modelo caro só depois que o barato aprovou o candidato.

---

## 7. Segurança estrutural

- **RLS owner-scoped** em tudo que pertence ao usuário. Rota de usuário usa o
  JWT dele; `service_role` só existe no consumidor de fila.
- **Falha fecha**: configuração ausente, limite indisponível ou payload
  inesperado resultam em recusa explícita.
- **Segredo nunca em log.** Telemetria carrega operação, tentativa, status,
  código estável e posição no orçamento — nada mais.
- **Ação vinculante** (comprar, dar lance, pagar, enviar) exige envelope de
  autorização humana com limite, expiração e idempotência. O executor não existe
  e só entra na fatia S12.
- **Privacidade de fonte**: quando a fonte exigir (eBay já exige), o webhook de
  deleção verifica assinatura, enfileira de forma durável e apaga R2 antes de
  finalizar no PostgreSQL, sem identificador de conta em auditoria ou log.

---

## 8. Infraestrutura

- `apps/web` — Next.js SPA. Fala só com a API por JSON.
- `apps/worker` — Cloudflare Worker: API, consumidores de fila, Durable Object
  de rate limit.
- **Cloudflare Queues** — coleta e análise, com DLQ. Mensagem carrega só
  `{version, runId}`; o consumidor recarrega o critério canônico do banco.
- **KV** — apenas configuração operacional e feature flag. Nunca conteúdo.
- **R2** — raw store endereçado por conteúdo; imagens quando S4 entrar.
- **Supabase PostgreSQL** — dado normalizado, RLS, migrations versionadas.
- **Durable Object** — reserva atômica de rate limit por fonte.
