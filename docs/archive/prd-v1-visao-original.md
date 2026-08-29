# PRD — Plataforma Inteligente de Pesquisa e Avaliação de Oportunidades

## 1. Visão geral

### 1.1 Nome provisório

**Opportunity Intelligence Platform**

Nome interno provisório:

**Project Scout**

O nome comercial definitivo deverá ser definido posteriormente.

### 1.2 Resumo do produto

A plataforma será um sistema inteligente de pesquisa, coleta, análise e organização de anúncios publicados em diferentes marketplaces, classificados, lojas, portais e sites especializados.

O usuário poderá descrever em linguagem natural o que deseja encontrar, incluindo características específicas, defeitos aceitáveis, problemas indesejados, orçamento, localização, custo de reparo, risco e finalidade da compra.

Exemplo:

> Quero encontrar um iPhone 13 de 128 GB com a tela quebrada, mas que ligue, tenha touch aparentemente funcional, esteja sem bloqueio de iCloud e custe no máximo R$ 1.800.

O sistema deverá:

1. Interpretar a intenção do usuário.
2. Pesquisar em diferentes fontes.
3. Coletar os anúncios encontrados.
4. Ler títulos, descrições, especificações e dados do vendedor.
5. Analisar imagens e, futuramente, vídeos e documentos.
6. Identificar defeitos declarados, visíveis, inferidos ou desconhecidos.
7. Detectar inconsistências e indícios de fraude.
8. Estimar o custo total da compra.
9. Calcular risco, compatibilidade e oportunidade.
10. Armazenar os resultados em uma base reutilizável.
11. Permitir análise posterior em painel, planilha, API ou MCP.
12. Possibilitar que outras inteligências artificiais utilizem a plataforma como ferramenta.

A primeira versão será especializada em eletrônicos usados, defeituosos e subavaliados. A arquitetura, entretanto, será preparada para expansão futura para veículos, imóveis, máquinas, equipamentos industriais, leilões e outros ativos.

---

# 2. Problema

## 2.1 Problema principal

Encontrar boas oportunidades em produtos usados exige um trabalho manual extenso.

Atualmente, o comprador precisa:

- pesquisar separadamente em vários sites;
- testar diferentes palavras-chave;
- abrir dezenas ou centenas de anúncios;
- interpretar títulos vagos;
- ler descrições incompletas;
- analisar fotografias;
- identificar defeitos escondidos;
- estimar se o restante do produto funciona;
- verificar a reputação do vendedor;
- calcular frete, taxas, impostos e reparos;
- comparar configurações diferentes;
- registrar manualmente os melhores resultados;
- revisar repetidamente os mesmos anúncios;
- acompanhar alterações de preço.

Esse processo é lento, repetitivo e difícil de escalar.

Além disso, buscadores convencionais funcionam melhor quando o usuário procura um produto claramente identificado, como:

> iPhone 13 128 GB.

Eles são menos eficientes para intenções complexas como:

> iPhone 13 com tela quebrada, mas aparentemente funcionando, com Face ID provável, sem problema de placa e com margem para reparo.

## 2.2 Falhas das soluções atuais

As soluções existentes normalmente resolvem apenas uma parte do problema:

- marketplaces possuem busca limitada ao próprio inventário;
- agregadores apenas reúnem links;
- comparadores avaliam principalmente produtos novos;
- ferramentas antifraude analisam apenas risco;
- sistemas de shopping com IA dependem de catálogos estruturados;
- scrapers coletam dados, mas não compreendem o produto;
- modelos de IA analisam um anúncio isolado, mas não mantêm uma base histórica;
- planilhas organizam dados, mas exigem coleta manual.

A oportunidade está em unir:

- pesquisa multissite;
- linguagem natural;
- coleta automatizada;
- análise multimodal;
- avaliação de risco;
- estimativa financeira;
- armazenamento histórico;
- personalização;
- exportação;
- integração com agentes de IA.

---

# 3. Proposta de valor

## 3.1 Proposta principal

> Descreva o que você procura. A plataforma encontra, analisa, classifica e organiza as melhores oportunidades disponíveis na internet.

## 3.2 Diferencial central

A plataforma não buscará apenas produtos pelo nome.

Ela buscará produtos com base em:

- condição real;
- defeitos aceitáveis;
- defeitos proibidos;
- evidências disponíveis;
- nível de confiança;
- preço final;
- reparabilidade;
- risco;
- margem potencial;
- perfil do comprador.

## 3.3 Exemplos de intenção

### Eletrônicos

> Quero um MacBook Pro com pelo menos 64 GB de memória, que possa ter defeitos cosméticos, mas não problema na placa.

### Celulares

> Quero iPhone 13 com tela quebrada e restante aparentemente funcional.

### Revenda

> Encontre celulares até R$ 2.000 com margem líquida estimada acima de R$ 500.

### Veículos

> Quero um carro automático até R$ 70 mil, sem passagem por leilão e sem sinais aparentes de dano estrutural.

### Imóveis

> Quero uma casa até R$ 500 mil com espaço para oficina e sem reforma estrutural pesada.

### Máquinas

> Procuro uma CNC usada que possa precisar de manutenção simples, mas que tenha estrutura aproveitável.

---

# 4. Objetivos do produto

## 4.1 Objetivo do MVP

Validar que a plataforma consegue:

- receber uma intenção de busca;
- coletar anúncios de múltiplas fontes;
- transformar os anúncios em dados estruturados;
- analisar texto e imagens;
- classificar defeitos e evidências;
- produzir uma pontuação útil;
- armazenar os resultados;
- permitir revisão e exportação.

## 4.2 Objetivos de médio prazo

- reduzir o tempo gasto em pesquisa manual;
- aumentar a quantidade de anúncios avaliados;
- melhorar a identificação de oportunidades;
- criar uma base histórica própria;
- permitir monitoramento contínuo;
- oferecer conexão por API e MCP;
- permitir criação rápida de novos conectores.

## 4.3 Objetivo de longo prazo

Tornar-se uma infraestrutura universal de inteligência de aquisição, capaz de encontrar, compreender e avaliar qualquer ativo anunciado em fontes digitais acessíveis.

---

# 5. Não objetivos iniciais

O MVP não deverá:

- comprar produtos automaticamente;
- negociar automaticamente com vendedores;
- garantir que um anúncio não seja fraude;
- garantir funcionamento interno não demonstrado;
- realizar inspeção física;
- substituir laudo técnico;
- substituir análise jurídica;
- integrar centenas de fontes no lançamento;
- construir infraestrutura própria completa de proxies;
- criar um modelo de visão próprio;
- automatizar ações irreversíveis;
- operar contas de usuário sem autorização explícita.

A primeira versão será uma ferramenta de pesquisa e apoio à decisão.

---

# 6. Público-alvo

## 6.1 Usuário inicial

O usuário inicial será um comprador técnico que procura oportunidades em eletrônicos usados, danificados ou subavaliados.

Características:

- conhece reparo ou revenda;
- aceita determinados defeitos;
- deseja economizar;
- pesquisa em vários sites;
- entende algum nível de risco;
- precisa comparar muitos anúncios;
- deseja armazenar resultados.

## 6.2 Perfis futuros

### Comprador pessoal

Busca um produto específico pelo melhor custo-benefício.

### Técnico ou assistência

Procura equipamentos reparáveis e peças.

### Revendedor

Busca margem de compra e revenda.

### Colecionador

Procura itens raros e difíceis de encontrar.

### Comprador corporativo

Procura máquinas, equipamentos ou lotes.

### Investidor

Analisa veículos, imóveis ou leilões.

### Desenvolvedor

Usa a inteligência da plataforma por API ou MCP.

### Empresa

Integra os dados ao próprio sistema, ERP ou agente de IA.

---

# 7. Personas

## 7.1 Caio — comprador técnico

Deseja encontrar eletrônicos usados com defeitos específicos, analisar o risco, estimar o custo de reparo e registrar oportunidades para revisão posterior.

### Necessidades

- busca detalhada;
- análise de imagens;
- detecção de defeitos;
- armazenamento;
- exportação;
- comparação;
- pesquisa em lote;
- acesso via IA.

## 7.2 Revendedor profissional

Pesquisa dezenas ou centenas de produtos por semana.

### Necessidades

- volume;
- alertas rápidos;
- cálculo de margem;
- múltiplas fontes;
- histórico de preço;
- exportação;
- colaboração.

## 7.3 Usuário comum

Quer comprar um produto usado, mas não sabe interpretar todos os riscos.

### Necessidades

- explicações simples;
- classificação clara;
- perguntas ao vendedor;
- sinais de golpe;
- comparação com preço de mercado.

## 7.4 Agente de IA externo

Precisa utilizar a plataforma como fonte de pesquisa e análise.

### Necessidades

- API;
- MCP;
- ferramentas bem definidas;
- dados estruturados;
- citações e evidências;
- controle de custo.

---

# 8. Princípios do produto

## 8.1 Evidência antes de conclusão

Toda classificação deverá mostrar a origem da conclusão.

Estados possíveis:

- declarado pelo vendedor;
- confirmado visualmente;
- confirmado por documento;
- muito provável;
- provável;
- possível;
- desconhecido;
- contraditório;
- provavelmente defeituoso;
- confirmado como defeituoso.

## 8.2 A incerteza deve ser explícita

A plataforma não deverá apresentar inferências como fatos.

Exemplo:

Errado:

> O touch funciona.

Correto:

> O aparelho aparece desbloqueado com um aplicativo aberto. Isso sugere que o touch funciona, mas não comprova todas as áreas da tela.

## 8.3 A análise deve ser explicável

Toda pontuação deverá apresentar:

- fatores positivos;
- fatores negativos;
- informações ausentes;
- contradições;
- evidências.

## 8.4 Banco primeiro, planilha depois

A base principal será relacional e estruturada.

Planilhas serão utilizadas como:

- visualização;
- exportação;
- compartilhamento;
- análise externa.

## 8.5 Coleta desacoplada da análise

A plataforma não deverá depender de uma única tecnologia de coleta.

Cada fonte poderá utilizar:

- API oficial;
- feed;
- HTML;
- dados estruturados;
- navegador automatizado;
- serviço externo;
- conector comunitário.

## 8.6 Fornecedores substituíveis

O MVP poderá usar um serviço externo de coleta com plano gratuito ou baixo custo.

Entretanto, a arquitetura deverá permitir troca de fornecedor sem alterar:

- banco;
- análise;
- interface;
- API;
- MCP;
- regras de negócio.

## 8.7 Segurança por padrão

Conteúdo coletado deverá ser tratado como dado não confiável.

Descrições, imagens, documentos e avaliações não poderão instruir diretamente agentes ou executar ferramentas.

---

# 9. Escopo do MVP

## 9.1 Categoria inicial

Eletrônicos usados, com foco em:

- iPhones;
- MacBooks;
- notebooks;
- celulares;
- computadores;
- peças e equipamentos reparáveis.

## 9.2 Fontes iniciais

Fontes do MVP refatorado (DOCX v1.1, Fase 1 — 3 fontes):

- **Mercado Livre** (API oficial BR, OAuth) — fonte nacional fácil
- **eBay** (API oficial já integrada com webhook de privacidade verificado) — fonte internacional
- **Xianyu** (fonte difícil — ingestão multi-camada endpoint/browser, risco documentado em `docs/v1.1-deltas.md`)

Fontes fora do escopo do MVP refatorado: **OLX, AliExpress, Goofish, Amazon**. Veículos, imóveis e leilões permanecem fora também. F4–F7 do DOCX (self-healing, leilões, negociação, Local Agent) ficam adiadas — ver `docs/post-mvp-roadmap.md`.

## 9.3 Estratégia de coleta do MVP

Utilizar um fornecedor externo que ofereça:

- API de scraping;
- renderização de JavaScript;
- extração estruturada;
- plano gratuito ou créditos iniciais;
- execução sob demanda;
- suporte a proxy;
- retorno em HTML, Markdown ou JSON.

O fornecedor deverá ser encapsulado por uma interface interna.

Exemplo:

```typescript
interface CollectionProvider {
  fetchPage(input: FetchPageInput): Promise<RawPage>;
  searchSite(input: SearchSiteInput): Promise<RawSearchResult[]>;
  extractStructured<T>(input: ExtractInput, schema: JsonSchema<T>): Promise<T>;
}
```

## 9.4 Funções do MVP

### Pesquisa em linguagem natural

O usuário poderá descrever o que procura.

### Interpretação da intenção

A IA transformará o pedido em filtros estruturados.

### Execução da coleta

O sistema pesquisará nas fontes selecionadas.

### Armazenamento

Todo anúncio encontrado será salvo.

### Normalização

Os dados serão convertidos para um formato comum.

### Análise de texto

A plataforma analisará:

- título;
- descrição;
- condição;
- especificações;
- observações do vendedor.

### Análise de imagens

A plataforma analisará:

- danos visíveis;
- tela ligada;
- aplicativos abertos;
- configuração exibida;
- sinais de bloqueio;
- ausência de peças;
- inconsistências visuais.

### Classificação de evidências

Cada conclusão será associada a uma evidência.

### Pontuação

O sistema calculará:

- correspondência com a busca;
- risco técnico;
- risco de fraude;
- qualidade das evidências;
- oportunidade.

### Painel de resultados

O usuário poderá:

- ordenar;
- filtrar;
- favoritar;
- descartar;
- comparar;
- adicionar observações;
- alterar status.

### Exportação

O usuário poderá exportar:

- CSV;
- Excel;
- JSON.

### Projetos de pesquisa

Cada busca poderá ser salva como projeto.

---

# 10. Fluxo principal do usuário

## 10.1 Criar pesquisa

O usuário acessa o sistema e informa:

> Quero iPhone 13 de 128 GB com tela quebrada. O aparelho deve ligar e não pode ter iCloud. Aceito traseira quebrada. Quero pagar até R$ 1.800.

## 10.2 Interpretar intenção

O sistema cria:

```json
{
  "category": "smartphone",
  "models": ["iPhone 13"],
  "storage_gb": [128],
  "maximum_total_cost_brl": 1800,
  "accepted_defects": ["cracked_screen", "broken_back_glass"],
  "rejected_defects": ["activation_lock", "no_power"],
  "preferred_evidence": [
    "device_powered_on",
    "device_unlocked",
    "seller_declares_other_functions_working"
  ]
}
```

## 10.3 Selecionar fontes

O usuário escolhe:

- eBay;
- OLX;
- outras fontes disponíveis.

## 10.4 Coletar anúncios

O sistema envia as buscas para os conectores.

## 10.5 Criar registros

Cada anúncio é salvo com:

- URL;
- título;
- descrição;
- imagens;
- preço;
- vendedor;
- origem;
- data da coleta.

## 10.6 Analisar

A plataforma analisa texto e imagens.

## 10.7 Pontuar

Cada anúncio recebe classificações.

## 10.8 Revisar

O usuário visualiza os resultados.

## 10.9 Exportar

O usuário exporta a seleção para uma planilha.

---

# 11. Fluxos secundários

## 11.1 Atualizar pesquisa

O usuário executa novamente uma pesquisa salva.

O sistema deverá:

- buscar novos anúncios;
- evitar duplicatas;
- atualizar anúncios existentes;
- registrar alterações de preço;
- identificar anúncios encerrados.

## 11.2 Comparar anúncios

O usuário seleciona dois ou mais anúncios.

O sistema compara:

- preço;
- defeitos;
- evidências;
- risco;
- custo estimado;
- oportunidade.

## 11.3 Gerar perguntas ao vendedor

O sistema identifica informações ausentes e gera perguntas.

Exemplo:

> O Face ID está funcionando? O aparelho está sem bloqueio de iCloud? O touch responde em toda a tela? O sinal de operadora funciona normalmente?

## 11.4 Registrar resultado real

Após uma compra, o usuário poderá informar:

- produto recebido;
- defeitos reais;
- custo real;
- reparo;
- valor de revenda;
- lucro;
- erro ou acerto da análise.

Esses dados alimentarão o histórico e o aprendizado futuro.

---

# 12. Modelo de dados

## 12.1 Tabela `users`

```text
id
name
email
plan
created_at
```

## 12.2 Tabela `research_projects`

```text
id
user_id
name
description
category
natural_language_query
structured_query
status
created_at
updated_at
```

## 12.3 Tabela `sources`

```text
id
name
domain
country
currency
connector_type
status
capabilities
created_at
updated_at
```

## 12.4 Tabela `collection_runs`

```text
id
project_id
source_id
status
started_at
finished_at
items_found
items_created
items_updated
estimated_cost
provider
error
```

## 12.5 Tabela `listings`

```text
id
source_id
external_id
url
title
description
condition
currency
price
shipping_cost
total_visible_cost
seller_id
location
status
first_seen_at
last_seen_at
published_at
raw_data
```

## 12.6 Tabela `listing_images`

```text
id
listing_id
url
storage_path
position
hash
perceptual_hash
created_at
```

## 12.7 Tabela `sellers`

```text
id
source_id
external_id
name
rating
positive_percentage
review_count
location
account_type
raw_data
```

## 12.8 Tabela `products`

```text
id
category
brand
model
variant
year
specifications
```

## 12.9 Tabela `listing_product_matches`

```text
listing_id
product_id
confidence
extraction_source
```

## 12.10 Tabela `evidence`

```text
id
listing_id
evidence_type
source_type
source_reference
claim
status
confidence
severity
created_at
```

Exemplos de `source_type`:

- title;
- description;
- image;
- video;
- seller;
- document;
- external_lookup;
- user_feedback.

## 12.11 Tabela `defects`

```text
id
listing_id
component
defect_type
status
confidence
severity
declared
visible
inferred
estimated_repair_cost
evidence_ids
```

## 12.12 Tabela `scores`

```text
listing_id
query_match_score
technical_risk_score
fraud_risk_score
evidence_quality_score
price_score
opportunity_score
score_version
explanation
created_at
```

## 12.13 Tabela `price_history`

```text
id
listing_id
price
shipping_cost
status
collected_at
```

## 12.14 Tabela `user_listing_actions`

```text
id
user_id
listing_id
project_id
status
favorite
notes
decision
created_at
updated_at
```

## 12.15 Tabela `purchase_outcomes`

```text
id
user_id
listing_id
purchase_price
actual_defects
actual_repair_cost
sale_price
outcome
user_rating
notes
created_at
```

---

# 13. Taxonomia de evidências

## 13.1 Estados funcionais

```text
confirmed_working
probably_working
possibly_working
unknown
probably_defective
confirmed_defective
```

## 13.2 Origem da conclusão

```text
seller_declared
visually_confirmed
document_confirmed
system_inferred
historical_pattern
user_confirmed
```

## 13.3 Exemplo

```json
{
  "component": "touchscreen",
  "status": "probably_working",
  "confidence": 0.74,
  "evidence": [
    {
      "source": "image_4",
      "claim": "O aparelho aparece desbloqueado com um aplicativo aberto."
    }
  ],
  "limitations": ["A imagem não comprova funcionamento em todas as áreas da tela."]
}
```

---

# 14. Motor de pontuação

## 14.1 Pontuações principais

### Correspondência com a busca

Mede o quanto o anúncio atende ao pedido do usuário.

### Risco técnico

Mede a probabilidade e gravidade de defeitos.

### Risco de fraude

Mede sinais de golpe, inconsistência ou vendedor suspeito.

### Qualidade das evidências

Mede quanto o anúncio demonstra o que afirma.

### Preço

Compara o preço com anúncios equivalentes.

### Oportunidade

Combina compatibilidade, custo, risco e evidência.

## 14.2 Fórmula inicial

A fórmula deverá ser configurável.

Exemplo:

```text
Oportunidade =
35% correspondência
25% vantagem de preço
15% qualidade das evidências
15% risco técnico invertido
10% risco de fraude invertido
```

## 14.3 Personalização

O peso deverá variar de acordo com o usuário.

Exemplo:

Um técnico pode aceitar:

- bateria ruim;
- tela quebrada;
- carcaça danificada.

Mas rejeitar:

- placa defeituosa;
- iCloud;
- MDM;
- ausência de sinal.

---

# 15. Análise de texto

## 15.1 Dados analisados

- título;
- descrição;
- condição;
- especificações;
- perguntas e respostas;
- avaliações;
- observações do vendedor.

## 15.2 Extrações esperadas

- produto;
- modelo;
- armazenamento;
- memória;
- cor;
- condição;
- defeitos;
- peças ausentes;
- funcionamento declarado;
- ausência de testes;
- bloqueios;
- reparos anteriores;
- contradições;
- termos vagos;
- risco.

## 15.3 Frases importantes

O sistema deverá reconhecer termos como:

- no further testing;
- sold as is;
- untested;
- for parts;
- occasionally;
- no returns;
- previous repair;
- liquid damage;
- activation locked;
- remote management;
- unknown password;
- only screen damaged;
- everything else works.

O sistema deverá traduzir e interpretar expressões equivalentes em outros idiomas.

---

# 16. Análise de imagens

## 16.1 Objetivos

Detectar:

- trincas;
- amassados;
- riscos;
- peças ausentes;
- tela ligada;
- tela sem imagem;
- manchas;
- linhas;
- oxidação visível;
- parafusos ausentes;
- carcaça aberta;
- tela de configuração;
- tela de bloqueio;
- informações do sistema;
- mensagens de erro;
- configuração diferente da anunciada.

## 16.2 Inferências permitidas

Exemplo:

```text
Imagem mostra o aparelho desbloqueado
→ aparelho provavelmente inicializa
→ bloqueio total é improvável
→ touch possivelmente funciona
```

A interface deverá deixar claro que isso é uma inferência.

## 16.3 Ausência de evidência

O sistema também deverá registrar o que não foi mostrado.

Exemplo:

- sem foto da parte traseira;
- sem foto das laterais;
- sem foto da saúde da bateria;
- sem foto do sistema;
- sem vídeo usando o touch.

---

# 17. Análise de risco de fraude

## 17.1 Sinais considerados

- preço muito abaixo do mercado;
- vendedor sem histórico;
- conta com histórico incompatível;
- tentativa de pagamento externo;
- descrição copiada;
- imagens duplicadas;
- imagens de catálogo;
- números de série divergentes;
- localização inconsistente;
- política de devolução ausente;
- linguagem de urgência;
- produto diferente da variação exibida;
- item incompleto disfarçado de produto completo.

## 17.2 Resultado

O sistema deverá retornar:

```text
baixo
moderado
alto
crítico
revisão obrigatória
```

Nunca deverá afirmar categoricamente que um vendedor é golpista sem comprovação externa.

---

# 18. Coleta de dados

## 18.1 Princípio

O MVP deverá terceirizar parte da infraestrutura de coleta para reduzir tempo de desenvolvimento.

## 18.2 Roteamento

A plataforma deverá possuir uma camada interna chamada:

**Collection Gateway**

Ela receberá uma tarefa de coleta e decidirá qual adaptador utilizar.

```text
API oficial
→ fornecedor externo
→ HTML
→ navegador
→ conector específico
```

## 18.3 Interface do conector

```typescript
interface SourceConnector {
  search(input: SearchInput): Promise<ListingPreview[]>;
  fetchListing(input: FetchListingInput): Promise<RawListing>;
  refreshListing(input: RefreshInput): Promise<ListingUpdate>;
  healthCheck(): Promise<ConnectorHealth>;
}
```

## 18.4 Interface do fornecedor

```typescript
interface ScrapingProvider {
  fetch(input: ProviderFetchInput): Promise<ProviderResponse>;
  extract<T>(input: ProviderExtractInput<T>): Promise<T>;
  healthCheck(): Promise<ProviderHealth>;
}
```

## 18.5 Requisitos do fornecedor para o MVP

- créditos gratuitos ou plano inicial acessível;
- API simples;
- suporte a JavaScript;
- saída estruturada;
- documentação;
- limite de uso observável;
- estatísticas de consumo;
- capacidade de buscar ou coletar URLs;
- possibilidade de troca futura.

## 18.6 Cache

A plataforma deverá evitar coletar repetidamente a mesma página.

Exemplo de validade:

- busca: 15 a 60 minutos;
- anúncio ativo: 6 a 24 horas;
- vendedor: 24 horas;
- imagem: armazenada uma única vez;
- anúncio encerrado: atualização menos frequente.

---

# 19. Fábrica de conectores

## 19.1 Objetivo futuro

Permitir que novas fontes sejam adicionadas com menor esforço.

## 19.2 Fluxo

```text
Domínio informado
→ pesquisa de API
→ análise do site
→ identificação de páginas
→ escolha da estratégia
→ geração do conector
→ testes
→ revisão
→ publicação
```

## 19.3 Tipos de conectores

### Verificado

Criado e mantido oficialmente.

### Comunitário

Criado por terceiros.

### Genérico

Baseado em extração orientada por IA.

### Sob demanda

Executado apenas para uma pesquisa específica.

## 19.4 Manifesto de fonte

```yaml
source:
  id: marketplace_x
  name: Marketplace X
  domain: marketplace.example
  country: BR

capabilities:
  search: true
  listing_details: true
  seller_profile: false
  images: true

collection:
  primary: provider_api
  fallback: browser
  authentication: none

quality:
  expected_title_rate: 0.98
  expected_price_rate: 0.95
  expected_description_rate: 0.80
```

---

# 20. Interface

## 20.1 Tela inicial

Elementos:

- campo de busca em linguagem natural;
- pesquisas recentes;
- projetos;
- fontes disponíveis;
- resumo de oportunidades.

## 20.2 Criar pesquisa

Campos:

- descrição livre;
- categoria;
- orçamento;
- fontes;
- defeitos aceitos;
- defeitos rejeitados;
- localização;
- preferências avançadas.

A IA deverá preencher automaticamente os campos com base no texto.

## 20.3 Tela de resultados

Visualização em:

- cartões;
- tabela;
- comparação.

Colunas principais:

- imagem;
- título;
- fonte;
- preço;
- custo estimado;
- condição;
- defeitos;
- evidências;
- risco;
- oportunidade;
- status.

## 20.4 Página do anúncio

Seções:

- resumo;
- preço;
- vendedor;
- especificações;
- descrição;
- imagens;
- evidências;
- defeitos;
- contradições;
- informações ausentes;
- pontuações;
- perguntas ao vendedor;
- histórico;
- observações.

## 20.5 Planilha interna

O usuário poderá escolher colunas e filtros.

Exemplos:

- preço;
- armazenamento;
- liga;
- touch;
- Face ID;
- câmera;
- iCloud;
- risco;
- margem;
- status.

## 20.6 Exportação

A exportação deverá respeitar os filtros atuais.

---

# 21. API

## 21.1 Endpoints iniciais

```http
POST /projects
GET /projects
GET /projects/{id}

POST /projects/{id}/runs
GET /projects/{id}/listings

GET /listings/{id}
POST /listings/{id}/analyze
POST /listings/{id}/refresh

POST /compare
POST /exports
```

## 21.2 Endpoints futuros

```http
POST /search
POST /watch
POST /sources/discover
POST /sources/onboard
GET /market-values
POST /seller-questions
POST /repair-estimates
```

---

# 22. MCP

## 22.1 Objetivo

Permitir que uma IA externa utilize a plataforma como ferramenta.

## 22.2 Ferramentas previstas

```text
search_listings
get_listing
analyze_listing
compare_listings
get_project_results
estimate_total_cost
generate_seller_questions
export_research
create_watch
```

## 22.3 Restrições

O MCP não deverá expor:

- cookies;
- credenciais;
- scraping irrestrito;
- navegação livre;
- operações de compra;
- ações irreversíveis.

---

# 23. RAG e memória

## 23.1 Uso do RAG

O RAG será utilizado para recuperar:

- casos semelhantes;
- anúncios históricos;
- defeitos comuns;
- resultados reais;
- padrões de vendedores;
- custos de reparo;
- preferências do usuário;
- documentos técnicos.

## 23.2 Dados estruturados continuam prioritários

Preço, modelo, condição e pontuações deverão permanecer no PostgreSQL.

Embeddings serão utilizados para:

- busca semântica;
- similaridade de descrições;
- recuperação de casos;
- agrupamento de anúncios.

## 23.3 Memória do usuário

O sistema aprenderá:

- defeitos aceitos;
- defeitos rejeitados;
- marcas preferidas;
- orçamento;
- tolerância ao risco;
- finalidade da compra;
- critérios usados nas decisões.

---

# 24. Arquitetura técnica

## 24.1 Stack sugerida

### Frontend

- Next.js;
- TypeScript;
- componente de tabela avançada;
- interface responsiva.

### Backend

- Python com FastAPI ou TypeScript com NestJS;
- arquitetura modular;
- filas assíncronas.

### Banco

- Supabase/PostgreSQL;
- pgvector;
- Row Level Security;
- Storage para imagens.

### Processamento

- fila de tarefas;
- workers;
- jobs de coleta;
- jobs de análise;
- jobs de atualização.

### IA

- modelo textual para extração e análise;
- modelo multimodal para imagens;
- embeddings;
- schemas JSON rígidos.

### Coleta

- fornecedor externo no MVP;
- conectores próprios posteriormente;
- Playwright/Crawlee como fallback futuro.

### Monitoramento

- logs;
- métricas;
- erros por fonte;
- custo por execução;
- completude da extração;
- taxa de falha.

---

# 25. Pipeline

```text
Pedido do usuário
        ↓
Interpretação estruturada
        ↓
Planejamento de busca
        ↓
Conectores e fornecedor de coleta
        ↓
Dados brutos
        ↓
Normalização
        ↓
Deduplicação
        ↓
Análise textual
        ↓
Análise visual
        ↓
Motor de evidências
        ↓
Pontuação
        ↓
Banco e histórico
        ↓
Painel, planilha, API e MCP
```

---

# 26. Deduplicação

O sistema deverá identificar anúncios repetidos por:

- ID externo;
- URL;
- título;
- vendedor;
- imagens;
- hash perceptual;
- descrição;
- número de série;
- combinação de campos.

Anúncios semelhantes em fontes diferentes poderão ser vinculados, mas não mesclados automaticamente sem confiança suficiente.

---

# 27. Segurança

## 27.1 Prompt injection

Todo conteúdo externo será tratado como não confiável.

O modelo analisador receberá instruções fixas para:

- ignorar comandos presentes na descrição;
- não executar ferramentas;
- retornar apenas JSON;
- separar evidência de inferência.

## 27.2 Credenciais

- armazenadas em cofre de segredos;
- nunca expostas à IA;
- separadas por ambiente;
- rotacionadas.

## 27.3 Ações

O MVP será somente leitura.

## 27.4 Dados pessoais

A plataforma deverá evitar armazenar dados pessoais desnecessários.

## 27.5 Auditoria

Cada análise deverá registrar:

- modelo utilizado;
- versão do prompt;
- data;
- evidências;
- versão da pontuação.

---

# 28. Custos

## 28.1 Custos principais

- coleta;
- proxy;
- navegador;
- modelos multimodais;
- armazenamento de imagens;
- banco;
- processamento;
- embeddings.

## 28.2 Estratégias de redução

- cache;
- deduplicação;
- análise por etapas;
- regras antes da IA;
- modelos menores para triagem;
- análise visual apenas para candidatos;
- reaproveitamento de resultados;
- limites por plano.

## 28.3 Pipeline econômico

```text
Coleta
→ validação barata
→ extração determinística
→ classificação textual leve
→ descarte de resultados irrelevantes
→ análise multimodal dos melhores
```

Não será necessário analisar profundamente todas as imagens de todos os anúncios.

---

# 29. Monetização

## 29.1 Gratuito

- poucas pesquisas;
- fontes limitadas;
- resultados limitados;
- análise básica;
- sem monitoramento contínuo.

## 29.2 Pessoal

Faixa hipotética:

**R$ 39 a R$ 79 por mês**

- mais pesquisas;
- projetos salvos;
- exportação;
- análise de imagens;
- alertas básicos.

## 29.3 Profissional

Faixa hipotética:

**R$ 149 a R$ 399 por mês**

- alto volume;
- múltiplas fontes;
- análise completa;
- histórico;
- monitoramento;
- MCP;
- exportações avançadas.

## 29.4 Empresa

Preço negociado.

- API;
- equipes;
- conectores privados;
- limites elevados;
- regras personalizadas;
- SLA.

## 29.5 Créditos

Operações de alto custo poderão consumir créditos:

- navegador;
- proxy;
- análise de muitas imagens;
- documentos longos;
- atualização frequente;
- coleta em fontes difíceis.

---

# 30. Métricas do MVP

## 30.1 Métricas técnicas

- taxa de coleta bem-sucedida;
- taxa de extração de título;
- taxa de extração de preço;
- taxa de extração de descrição;
- custo médio por anúncio;
- tempo médio de processamento;
- taxa de duplicatas;
- erros por fonte.

## 30.2 Métricas de análise

- precisão de modelo;
- precisão de armazenamento;
- precisão de condição;
- precisão de defeitos;
- concordância com o usuário;
- quantidade de inferências corrigidas.

## 30.3 Métricas de produto

- pesquisas criadas;
- anúncios analisados;
- anúncios favoritados;
- exportações;
- retorno semanal;
- tempo economizado;
- oportunidades compradas;
- satisfação do usuário.

## 30.4 North Star Metric

> Quantidade de oportunidades relevantes identificadas e validadas pelo usuário por pesquisa.

---

# 31. Critérios de sucesso do MVP

O MVP será considerado validado quando:

1. O usuário conseguir criar uma pesquisa detalhada.
2. A plataforma coletar resultados de pelo menos duas fontes.
3. Pelo menos 80% dos resultados tiverem título e preço corretos.
4. Pelo menos 70% tiverem descrição utilizável.
5. A plataforma identificar corretamente defeitos explícitos na maioria dos testes.
6. A análise visual produzir evidências úteis.
7. O usuário conseguir filtrar e exportar resultados.
8. O usuário considerar que a ferramenta economiza tempo.
9. Pelo menos algumas oportunidades reais forem encontradas.
10. O custo por pesquisa permanecer aceitável.

---

# 32. Roadmap

> **ATUALIZADO para DOCX v1.1 — F0–F3 como MVP.** O roadmap operacional vivo está em `docs/mvp-plan.md` (F0–F3) e `docs/post-mvp-roadmap.md` (F4–F7). As fases listadas abaixo deste aviso são a versão histórica do PRD original e permanecem como referência; em caso de conflito, `mvp-plan.md` e `post-mvp-roadmap.md` vencem.

## Fase 0 — Descoberta e validação manual

### Objetivo

Confirmar o fluxo antes de desenvolver a plataforma completa.

### Entregas

- definir categoria inicial;
- selecionar fontes;
- definir taxonomia de defeitos;
- testar fornecedores de coleta;
- coletar manualmente amostras;
- testar modelos de texto e imagem;
- criar planilha de referência;
- definir fórmula inicial.

### Resultado esperado

Um conjunto de 100 a 500 anúncios analisados para validar o modelo.

---

## Fase 1 — MVP interno

### Objetivo

Criar uma ferramenta funcional para uso próprio.

### Fontes

- eBay;
- OLX.

### Funcionalidades

- criação de projeto;
- busca em linguagem natural;
- interpretação estruturada;
- coleta por fornecedor externo;
- armazenamento no Supabase;
- normalização;
- análise de texto;
- análise básica de imagens;
- pontuação;
- tabela;
- filtros;
- exportação CSV e Excel;
- favoritar;
- descartar;
- observações.

### Fora do escopo

- cobrança;
- multiusuário complexo;
- MCP público;
- monitoramento contínuo avançado;
- conectores automáticos.

---

## Fase 2 — MVP privado

### Objetivo

Permitir uso por um pequeno grupo de testadores.

### Entregas

- autenticação;
- planos internos;
- limites de uso;
- projetos salvos;
- atualização de anúncios;
- histórico de preço;
- análise de vendedor;
- perguntas ao vendedor;
- feedback sobre análise;
- painel de custos;
- melhoria da deduplicação;
- logs e observabilidade.

### Testadores

- técnicos;
- revendedores;
- compradores frequentes.

---

## Fase 3 — Beta comercial de eletrônicos

### Objetivo

Começar a cobrar por uma solução especializada.

### Posicionamento

> Encontre eletrônicos usados e defeituosos que realmente valem a pena.

### Entregas

- onboarding;
- assinatura;
- créditos;
- alertas;
- pesquisas recorrentes;
- importação de planilhas;
- exportação avançada;
- comparação;
- estimativa de reparo;
- custo final;
- histórico de mercado;
- relatórios;
- API limitada.

### Fontes adicionais

- AliExpress;
- Mercado Livre;
- fonte chinesa selecionada;
- fontes regionais.

---

## Fase 4 — MCP e plataforma para agentes

### Objetivo

Permitir que outras IAs utilizem a plataforma.

### Entregas

- servidor MCP;
- API estável;
- SDK;
- autenticação por token;
- limites;
- webhooks;
- ferramentas de pesquisa;
- ferramentas de análise;
- ferramentas de exportação;
- documentação para desenvolvedores.

### Ferramentas

```text
search_listings
analyze_listing
compare_listings
get_research_project
estimate_cost
export_results
```

---

## Fase 5 — Fábrica de conectores

### Objetivo

Reduzir o esforço para adicionar novas fontes.

### Entregas

- catálogo de fontes;
- manifesto;
- testes automáticos;
- monitor de saúde;
- conector genérico;
- agente de onboarding;
- sugestão automática de estratégia;
- geração assistida de conectores;
- revisão e publicação;
- fallback entre fornecedores.

### Resultado

Adicionar fontes simples em horas ou dias, não semanas.

---

## Fase 6 — Inteligência histórica

### Objetivo

Transformar a base acumulada em vantagem competitiva.

### Entregas

- preços históricos;
- similaridade de anúncios;
- imagens duplicadas;
- padrões de vendedor;
- defeitos por modelo;
- custo real de reparo;
- previsão de margem;
- aprendizado com compras;
- RAG;
- personalização.

---

## Fase 7 — Novas categorias

### Ordem sugerida

1. Celulares e notebooks.
2. Eletrônicos gerais.
3. Máquinas e equipamentos.
4. Veículos.
5. Leilões.
6. Imóveis.

Cada categoria deverá possuir:

- taxonomia;
- campos;
- evidências;
- regras;
- modelo de risco;
- fórmula de pontuação;
- fontes especializadas.

---

## Fase 8 — Plataforma universal

### Objetivo

Permitir pesquisa inteligente de qualquer tipo de ativo.

### Promessa

> Descreva o que você procura. A plataforma encontra, analisa e organiza as melhores oportunidades disponíveis.

### Componentes

- busca multissite;
- análise multimodal;
- conectores sob demanda;
- especialistas por categoria;
- inteligência histórica;
- API;
- MCP;
- marketplace de conectores;
- integrações corporativas.

---

# 33. Backlog inicial

## Fundação

- configurar repositório;
- configurar Supabase;
- criar esquema inicial;
- configurar autenticação;
- criar workers;
- configurar armazenamento.

## Coleta

- avaliar fornecedores;
- criar `Collection Gateway`;
- criar conector eBay;
- criar conector OLX;
- armazenar dados brutos;
- implementar cache.

## Normalização

- criar schema universal;
- mapear produtos;
- normalizar preço;
- normalizar condição;
- normalizar vendedores.

## IA

- criar parser de intenção;
- criar analisador textual;
- criar analisador visual;
- criar schema de evidências;
- criar explicações;
- versionar prompts.

## Produto

- criar projetos;
- criar tabela de resultados;
- criar filtros;
- criar página do anúncio;
- criar comparação;
- criar exportação.

## Qualidade

- criar conjunto de testes;
- validar extração;
- comparar análise com avaliação humana;
- criar monitoramento de custos;
- criar monitoramento de erros.

---

# 34. Riscos

## 34.1 Dependência de fornecedor

Mitigação:

- camada abstrata;
- múltiplos adaptadores;
- armazenamento próprio;
- possibilidade de migração.

## 34.2 Custo elevado

Mitigação:

- cache;
- análise em etapas;
- limites;
- triagem;
- créditos;
- processamento seletivo.

## 34.3 Falsos positivos

Mitigação:

- confiança;
- evidências;
- revisão humana;
- feedback;
- comparação entre modelos.

## 34.4 Mudanças nos sites

Mitigação:

- monitoramento;
- testes;
- conectores versionados;
- fallback;
- fornecedor externo.

## 34.5 Risco jurídico ou contratual

Mitigação:

- priorizar APIs e fontes acessíveis;
- revisar termos;
- limitar coleta;
- permitir remoção;
- obter parcerias;
- separar fontes por nível de autorização.

## 34.6 Escopo excessivo

Mitigação:

- foco inicial em eletrônicos;
- duas fontes;
- poucas funções essenciais;
- roadmap gradual.

## 34.7 Usuário confiar demais na IA

Mitigação:

- não garantir condição;
- mostrar incerteza;
- apresentar evidências;
- recomendar inspeção;
- diferenciar declaração e inferência.

---

# 35. Decisões recomendadas para o MVP

## Produto

- começar com eletrônicos;
- focar em iPhone e MacBook;
- oferecer busca, tabela e exportação;
- não construir marketplace universal inicialmente.

## Coleta

- usar fornecedor externo;
- começar com duas fontes;
- encapsular o fornecedor;
- armazenar dados brutos.

## IA

- regras e extração determinística primeiro;
- modelo textual depois;
- visão apenas nos candidatos relevantes;
- saída sempre em schema.

## Banco

- PostgreSQL como fonte principal;
- Storage para imagens;
- pgvector apenas quando necessário.

## Interface

- painel web;
- tabela poderosa;
- filtros;
- página detalhada;
- exportação.

## Arquitetura

- modular desde o início;
- conectores substituíveis;
- análise independente da coleta;
- API interna como núcleo.

---

# 36. Primeira versão recomendada

A primeira versão utilizável deverá permitir:

1. Criar uma pesquisa chamada “iPhone 13 para reparo”.
2. Escrever os critérios em linguagem natural.
3. Selecionar eBay e OLX.
4. Executar a pesquisa.
5. Salvar os anúncios.
6. Extrair modelo, memória, preço e condição.
7. Ler a descrição.
8. Analisar até algumas imagens por anúncio.
9. Classificar defeitos e evidências.
10. Calcular pontuação.
11. Filtrar resultados.
12. Marcar favoritos.
13. Adicionar observações.
14. Exportar para Excel.

Essa versão já será capaz de substituir parte significativa do trabalho manual e gerar aprendizado real para as fases seguintes.

---

# 37. Visão final

A plataforma deverá evoluir de:

> Uma ferramenta pessoal para encontrar eletrônicos usados.

Para:

> Uma plataforma de pesquisa e inteligência de oportunidades.

E finalmente para:

> Uma infraestrutura universal de aquisição de ativos, utilizada por pessoas, empresas e agentes de IA.

O diferencial não será apenas coletar páginas.

O diferencial será transformar informação desorganizada em:

- dados;
- evidências;
- risco;
- contexto;
- histórico;
- oportunidade;
- decisão explicável.

O produto final deverá funcionar como um pesquisador técnico que examina milhares de anúncios, organiza os resultados e mostra não apenas o que foi encontrado, mas o que realmente parece valer a pena.
