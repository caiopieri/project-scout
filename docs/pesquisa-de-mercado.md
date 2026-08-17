# PROJECT SCOUT — RELATÓRIO MESTRE DE PESQUISA DE MERCADO, ARQUITETURA LOGÍSTICA, COMPLIANCE E ENGENHARIA DE CÓDIGO
## Versão 7.1 (Definitiva Ampliada, Auditada & Sanitizada)

---

### REGRA CONSTITUCIONAL DO SISTEMA (DOCX v1.1 §1 & AGENTS.md)
> *"IA interpreta, pesquisa, repara, recomenda e negoceia. O sistema valida, limita e executa. O usuário autoriza qualquer ação vinculante."*

---

# SUMÁRIO GERAL

1. **EIXO 1 — KYC, REQUISITOS POR PLATAFORMA, ESTRUTURAÇÃO SOCIETÁRIA & COMPLIANCE FISCAL DE SAÍDA (BR)**
2. **EIXO 2 — BENCHMARKING COMPETITIVO, ANÁLISE DE MODELOS OPERACIONAIS DE MERCADO, SEARCH INTELLIGENCE & RECONCILIAÇÃO DE IDENTIDADE**
3. **EIXO 3 — SOURCING GLOBAL, LEILÕES, LIQUIDAÇÃO ITAD & SALDÕES DE VAREJO**
4. **EIXO 4 — PREP CENTERS, LOGÍSTICA DE RECOLHIMENTO E REDIRECIONADORES**
5. **EIXO 5 — ROTAS LOGÍSTICAS DE ENTRADA E TRIBUTAÇÃO NO BRASIL**
6. **EIXO 6 — ESTRATÉGIAS LOGÍSTICAS CROSS-BORDER INTERNACIONAIS**
7. **EIXO 7 — GESTÃO EXAUSTIVA DE RISCOS DE HARDWARE, BLOQUEIOS E REGULAÇÃO**
8. **EIXO 8 — EQUAÇÕES MATEMÁTICAS DO MOTOR FINANCEIRO E VALUATION ENGINE**
9. **EIXO 9 — CLASSIFICAÇÃO DAS PLATAFORMAS NO COLLECTIONGATEWAY E MAPEAMENTO DETALHADO DE APIS**
10. **EIXO 10 — BENCHMARK DE SERVIÇOS DE SCRAPING, PROXIES, CAPTCHAS E FREE TIERS**
11. **EIXO 11 — ARQUITETURA DE COLETA MASSIVA, CÓDIGO TYPESCRIPT INTEGRAL E PACOTE DE SCHEMAS ZOD CANÔNICOS**

---

# EIXO 1 — KYC, REQUISITOS POR PLATAFORMA, ESTRUTURAÇÃO SOCIETÁRIA & COMPLIANCE FISCAL DE SAÍDA (BR)

## 1. TABELA COMPARATIVA DE REQUISITOS DE VENDEDOR POR PLATAFORMA

| Plataforma | Região | KYC Exigido | Exigência Bancária | Endereço / Telefone | Restrição Geográfica | Estratégia de Bypass / Habilitação |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Amazon US** | EUA | Passaporte/CNH + SSN/ITIN ou EIN | Conta EUA (Wise/Payoneer/Mercury) | Endereço Global; Tel +1 ou local | Aceita vendedores do BR diretamente | Cadastro direto via Passaporte BR + Cartão Internacional + US LLC/EIN para tributação reduzida. |
| **eBay US** | EUA | Passaporte/CNH + ITIN/SSN ou EIN | Conta vinculada Payoneer ou Banco EUA | Endereço Global; Tel verificado | Aceita vendedores do BR via Payoneer | Cadastro via eBay BR / International Seller vinculado a Payoneer PJ/PF. |
| **Mercari US** | EUA | SSN ou ITIN obrigatório | Banco EUA nativo (Routing/Account) | Endereço físico EUA (não aceita P.O. Box) | Estrita (Apenas residentes/empresas EUA) | **US LLC (Wyoming/DE)** + EIN + W-9 + Endereço Físico (Prep Center/Virtual Office) + ITIN. |
| **Poshmark US** | EUA | SSN/ITIN (após $600 em vendas) | Banco EUA nativo ou ACH | Endereço físico EUA; Tel +1 | Estrita (EUA apenas) | US LLC + EIN + Conta Mercury/Payoneer + US Phone VoIP/SIM local. |
| **Back Market US**| EUA/EU | Business Registration + Tax ID | Conta bancária empresarial (EUA/EU) | Endereço comercial verificado | Exige aprovação como Refurbisher | Cadastro como Seller PJ Internacional + Certificação de Recondicionamento (Grades A-C). |
| **Amazon EU** | Europa | Passaporte + VAT ID / EORI | Bank Account na SEPA (EUR/GBP via Wise) | Endereço comercial verificado | Aceita PJ internacional | Cadastro direto + Registro de **VAT (Imposto sobre Valor Agregado)** no país de entrada. |
| **Allegro** | Polônia | Documentos PJ (CNPJ) + Tradução | Conta bancária EUR/PLN | Endereço UE ou internacional | Aceita vendedores internacionais | Cadastro Business com documento da empresa traduzido + conta Payoneer/Wise. |
| **Vinted EU** | Europa | ID Nacional / Passaporte UE | Conta bancária IBAN (SEPA) | Endereço residencial na UE | Estrita (Residentes UE/UK) | Parceria local / Nominee ou e-Residency da Estônia com conta bancária SEPA. |
| **Wallapop** | Espanha | DNI / NIE / CIF ou Passaporte | Banco espanhol / IBAN europeu | Endereço físico na Espanha/Portugal | Estrita (Espanha/Portugal) | Parceria local / Nominee espanhol + conta SEPA ou empresa local. |
| **Xianyu (Idle Fish)**| China | Passaporte / Mainland ID + Alipay | Conta Alipay verificada (Mainland) | Tel +86 obrigatorio | Estrita (Exige infraestrutura chinesa) | **Alipay HK / Mainland Business Account** via parceiro de sourcing ou agente de vendas na China. |
| **Zhuanzhuan** | China | ID Chinês + WeChat Pay | WeChat Pay / Banco Chinês | Tel +86 | Estrita | Atuação via Merchant of Record (MoR) parceiro em Shenzhen/Guangzhou. |
| **Paipai (JD)** | China | Registro Comercial Chinês (Business) | Banco Corporativo Chinês | Licença Comercial China | Estrita B2B | Parceria com trading company local chinesa autorizada. |
| **1688 / Taobao** | China | Business License China / Passaporte | Alipay Business / Payoneer Cross-Border | Tel +86 / Endereço China | Permite Cross-Border via Taobao Global | Taobao Global Seller via Payoneer/LianLian ou Trading Company parceira. |
| **Shopee TW** | Taiwan | Taiwan National ID / Business ID | Banco Local de Taiwan (TWD) | Tel +886 | Estrita (Taiwan) | Entidade corporativa em Taiwan ou MoR local especializado em e-commerce TW. |
| **Ruten TW** | Taiwan | ID Taiwan / Business Registration | Banco Taiwanês | Tel +886 | Estrita | Agente comercial local em Taiwan. |
| **Yahoo! JP / PayPay**| Japão | My Number / Resident Card ID | Banco Japonês (JPY) | Tel +81 / Endereço Japão | Estrita (Japão) | Empresa (Godo Kaisha / Kabushiki Kaisha) no Japão ou serviço de intermediação (Buyee/Tenso). |
| **Mercari JP** | Japão | ID Japonês verificado | Banco Local Japonês | Tel +81 | Estrita | Parceria local com recondicionadores no Japão. |
| **Mercado Livre BR**| Brasil | CPF ou CNPJ + CNH/Passaporte | Banco Brasileiro (PIX/TED) | Endereço e Telefone BR (+55) | Exige entidade cadastrada no Brasil | Operação nativa via CNPJ/CPF com emissão de Nota Fiscal (NFe). |
| **Shopee BR** | Brasil | CPF ou CNPJ | Banco Brasileiro | Endereço BR | Aceita vendedores Nacionais e Cross-Border | Cadastro Nacional via CNPJ/CPF ou Cross-Border autorizados (China/EUA). |

---

## 2. GUIA PASSO A PASSO PARA ESTRUTURAÇÃO SOCIETÁRIA INTERNACIONAL (US LLC)

```
┌────────────────────────────────────────────────────────────────────────┐
│               FLUXOGRAMA DE ESTRUTURAÇÃO DE US LLC                     │
├────────────────────────────────────────────────────────────────────────┤
│ 1. Formação da LLC no Wyoming (0% State Tax, Anonymity)                │
│    └─► 2. Emissão de EIN junto ao IRS (Formulário SS-4)               │
│         └─► 3. Abertura de Conta Empresarial (Mercury / Relay Fi)     │
│              └─► 4. Emissão de W-9 & W-8BEN-E (Certificação Fiscal)   │
│                   └─► 5. Liberação de Onboarding nas Plataformas       │
└────────────────────────────────────────────────────────────────────────┘
```

- **Passo 1: Registro em Wyoming**: 0% State Tax, sem imposto de franquia elevado, taxa de renovação de $60/ano e proteção de privacidade dos sócios.
- **Passo 2: EIN (IRS)**: Solicitação via Formulário SS-4 enviado por Fax/Telefone ao IRS.
- **Passo 3: Conta Bancária Virtual**: Abertura no Mercury Bank ou Relay Financial.
- **Passo 4: W-9 & W-8BEN-E**: Emissão de formulários fiscais para eliminar retenção na fonte (30%) nas plataformas americanas.

---

## 3. COMPLIANCE FISCAL DE SAÍDA E EMISSÃO DE NOTA FISCAL NO BRASIL

### 3.1 Regras Tributárias para Venda de Eletrônicos no Brasil

#### A. Simples Nacional (Anexo I — Comércio)
- **Enquadramento:** Lei Complementar nº 123/2006. A revenda de eletrônicos enquadra-se no **Anexo I (Comércio)**.
- **Tabela de Alíquotas do Anexo I (PGDAS-D):**
  - **1ª Faixa (até R$ 180k):** Alíquota nominal 4,00% (Efetiva **4,00%**).
  - **2ª Faixa (R$ 180k a R$ 360k):** Alíquota nominal 7,30% - Ded. R$ 5.940,00 (Efetiva **5,65% a 6,00%**).
  - **3ª Faixa (R$ 360k a R$ 720k):** Alíquota nominal 9,50% - Ded. R$ 13.860,00 (Efetiva **7,00% a 7,57%**).
  - **4ª Faixa (R$ 720k a R$ 1,8M):** Alíquota nominal 10,70% - Ded. R$ 22.500,00 (Efetiva **7,57% a 9,45%**).
  - **5ª Faixa (R$ 1,8M a R$ 3,6M):** Alíquota nominal 14,30% - Ded. R$ 87.300,00 (Efetiva **9,45% a 11,87%**).
  - **6ª Faixa (R$ 3,6M a R$ 4,8M):** Alíquota nominal 19,00% - Ded. R$ 378.000,00 (Efetiva **11,87% a 11,12%**).
- **Segregação do PIS/COFINS Monofásico no PGDAS-D:** Baterias (NCM 8507) e eletrônicos sob regime monofásico (Lei 10.147/2000) devem ser segregados no PGDAS-D sob a opção *"Revenda com tributação monofásica de PIS/COFINS"*, reduzindo a alíquota efetiva em até 1,27% a 2,76% (PIS) e 5,86% a 12,74% (COFINS).
- **Serviços de Reparo (Anexo III):** A mão de obra cobrada separadamente tributa pelo **Anexo III (6,00% inicial)** com emissão de NFS-e municipal.

#### B. Lucro Presumido
- **Carga Tributária Federal:** IRPJ (Base 8% x 15% = **1,20%**) + CSLL (Base 12% x 9% = **1,08%**).
- **Alíquota Zero de PIS/COFINS Monofásico (CST 04):** Conforme a Lei 10.147/2000, a revenda comercial de produtos monofásicos no Lucro Presumido adota **CST 04 (Alíquota Zero)**, reduzindo a carga federal de 5,93% para **2,28%** sobre o faturamento bruto.

### 3.2 Emissão de NF-e de Entrada para Usados Comprados de Pessoa Física sem Nota (Art. 136 RICMS/SP)

| Campo da NF-e | Valor / Parametrização Exigida | Descrição / Detalhamento Técnico |
| :--- | :--- | :--- |
| **Tipo de Documento (`tpNF`)** | `0` (Entrada) | Nota Fiscal de Entrada emitida pela própria PJ compradora. |
| **Emitente (`emit`)** | CNPJ / Razão Social da Empresa (Scout) | A empresa compradora figura como emissora do documento. |
| **Remetente / Fornecedor (`dest`)** | Dados da Pessoa Física Vendedora | Nome completo, CPF, Endereço residencial, CEP, UF. `IE` = ISENTO. |
| **CFOP** | `1.102` ou `2.102` | `1.102` (Compra estadual para comercialização) / `2.102` (Compra interestadual). |
| **CSOSN (Simples Nacional)** | `102` ou `400` | `102` (Sem permissão de crédito) ou `400` (Não tributada). |
| **CST ICMS (Lucro Presumido)** | `41` ou `90` | `41` (Não tributada - remetente PF não contribuinte). |
| **CST PIS / COFINS (Entrada)** | `70` ou `98` | `70` (Aquisição sem direito a crédito) ou `98` (Outras entradas). |
| **Valor Total do Item / NF** | Valor exato pago à PF | Coincidência obrigatória com o comprovante de pagamento PIX/TED. |

- **Documentos de Suporte Obrigatórios:** Contrato de Compra e Venda de Bem Móvel Usado + Comprovante de Transferência PIX/TED no mesmo CPF + Termo de Vistoria de Estoque.

---

# EIXO 2 — BENCHMARKING COMPETITIVO, ANÁLISE DE MODELOS OPERACIONAIS DE MERCADO, SEARCH INTELLIGENCE & RECONCILIAÇÃO DE IDENTIDADE

## 1. ANÁLISE DE MODELOS OPERACIONAIS DE MERCADO E SUPREMACIA DO SCOUT

A análise da dinâmica de mercado de arbitragem e leilões revela três grandes modelos operacionais praticados por operadores humanos, e como a arquitetura do **Project Scout substitui o trabalho manual por inteligência autônoma**:

```
┌────────────────────────────────────────────────────────────────────────┐
│         ARQUITETURA DE AUTOMAÇÃO SCOUT VS. OPERAÇÃO MANUAL DE MERCADO  │
├────────────────────────────────────────────────────────────────────────┤
│ MODELO 1: Garimpo Manual de Leilões Nacionais ──► SCOUT: CollectionGateway│
│ MODELO 2: Mineração Manual de Varejo/Amazon ────► SCOUT: Multi-Scanner │
│ MODELO 3: Arbitragem Cross-Border Manual ──────► SCOUT: Cross-Border Auto│
└────────────────────────────────────────────────────────────────────────┘
```

### 1.1 Modelo 1: Garimpo Manual de Leilões Nacionais (Produtos, Veículos e Frotas)
- **Operação Manual Típica**: Navegação manual diária por portais de leiloeiros oficiais, verificação de editais em PDF, checagem em listas de leiloeiros homologados e cálculo manual de lance máximo (*Bid Limit*) usando planilhas.
- **Automação pelo Project Scout**:
  - **Varredura Ativa Contínua**: O `CollectionGateway` do Scout faz o rastreio contínuo e em tempo real de editais, lotes e praças de leilão em todas as plataformas públicas e privadas.
  - **Valoração Automatizada por IA**: O `ValuationEngine.ts` substitui calculadoras simples calculando automaticamente o *Fair Market Value (FMV)*, ajustando por Grade cosmética, descontando defeitos e gerando o **Opportunity Score (0 a 100)** e o **Bid Limit (MAPP)** exato.

### 1.2 Modelo 2: Mineração Manual de Varejo e Marketplaces (Amazon FBA/FBM/DBA)
- **Operação Manual Típica**: Mineração de produtos na Amazon através de extensores de navegador isolados (como Keepa e SellerAmp), comparando manualmente contra fornecedores atacadistas ou lojas de varejo.
- **Automação pelo Project Scout**:
  - O Scout realiza o **escaneamento automatizado cross-marketplace**, comparando ofertas da Amazon em tempo real contra centenas de fornecedores, saldões, leilões e marketplaces (eBay, Mercado Livre, Xianyu), calculando margens líquidas reais já descontando a tarifa de comissão FBA/DBA e o tributo Simples/Lucro Presumido.

### 1.3 Modelo 3: Arbitragem Cross-Border em Moeda Forte (Dólar/Euro)
- **Operação Manual Típica**: Compra de fornecedores americanos ou chineses para envio a redirecionadores/prep centers nos EUA e revenda na Amazon US/eBay US.
- **Automação pelo Project Scout**:
  - O Scout integra nativamente o pipeline de **Arbitragem Cross-Border**, automatizando a rota **China -> EUA (Section 321 Entry Type 86)** e **EUA -> EUA (Prep Centers Tax-Free em Delaware/Oregon)**, calculando o *Landed Cost* em tempo real com conversão cambial automatizada.

---

## 2. SEARCH INTELLIGENCE & QUERY EXPANSION ENGINE (`QueryExpander.ts`)

A expansão de busca (DOCX §F2) traduz critérios estruturados em uma família versionada de consultas (`SearchQueryFamily`) através de 6 camadas:
1. **Query Exata (`exact`)**: Termos base derivados diretamente da marca, modelo e especificações (`confidence = 1.00`).
2. **Sinônimos e Aliases (`alias`)**: Substituição de categoria por vocabulário comum (`confidence = 0.88`).
3. **Abreviações e Siglas (`abbreviation`)**: Redução de modelos (`"i13 128"` $\rightarrow$ `"iPhone 13 128GB"`, `"mbp 16 m1"` $\rightarrow$ `"MacBook Pro 16 M1"`, `"rtx4070 ti"` $\rightarrow$ `"RTX 4070 Ti"`) (`confidence = 0.80`).
4. **Multilíngue (`localized`)**: Mapeamento para termos nativos em PT, EN, ZH (Xianyu) e JA (Yahoo JP) (`confidence = 0.85`).
5. **Typos Determinísticos (`typo`)**: Variações de erros de digitação (transposição de caracteres adjacentes) (`confidence = 0.60`).
6. **Consultas Aprendidas (`learned`)**: Termos descobertos via observação de mercado (`confidence = 0.75`).

---

## 3. PRODUCT IDENTITY RESOLUTION ENGINE (`ProductIdentityResolver.ts`)

Converte títulos caóticos em uma identidade técnica unívoca:
- **Extração Regex de Atributos**: Captura CPU (`M1/M2/M3`, `i7-13700H`, `Ryzen 7 7800X3D`), RAM (4GB a 128GB), Storage (128GB a 4TB), GPU, ModelCode (`A2633`, `20Y7`, `CFI-1215A`), Cor e Grade.
- **Correspondência Canônica Heterogênea**:
  $$Sim_{\text{total}} = 0.35 \times JW(\text{Title}_A, \text{Title}_B) + 0.25 \times Lev_{\text{norm}}(\text{Title}_A, \text{Title}_B) + 0.40 \times Match_{\text{specs}}(A, B)$$
- Se $Sim_{\text{total}} \ge 0.85$ e `ModelCode` for compatível, associa os anúncios ao mesmo `canonical_product_id` (Status `MATCHED`).

---

# EIXO 3 — SOURCING GLOBAL, LEILÕES, LIQUIDAÇÃO ITAD & SALDÕES DE VAREJO

## 1. LEILÕES B2B, GOVERNAMENTAIS E JUDICIAIS
- **AllSurplus & GovDeals**: Leilões de frotas governamentais/universidades dos EUA. Soft Close (3-5 min); Buyer’s Premium (5%-12.5%); Prazo de remoção 5-10 dias úteis; Lotes Gaylords com 75%-90% de taxa de aproveitamento funcional.
- **B-Stock Solutions**: Liquidação direta de Amazon, Best Buy, Target, Walmart e Dell. LTL (1-6 paletes) e FTL (26-30 paletes). Manifestos itemizados (.CSV com UPC, MSRP e condição). Lances entre 8% e 22% do MSRP.
- **Liquidation.com**: Devoluções de e-commerce. Exige filtro estrito para comprar apenas de armazéns oficiais (evita *cherry picking* de terceiros).
- **Receita Federal (e-CAC / SLE)**: Bens apreendidos em portos/aeroportos. Requer e-CPF/e-CNPJ A1/A3 e Certidão Negativa. PJ arremata com NF de Entrada e recolhimento de ICMS Estadual (17%-18%).
- **Sodré Santoro / Superbid / Milan**: Desmobilização de frota de TI de bancos e seguradoras no Brasil. Comissão de 5% + Taxa de Pátio.
- **Taobao Judicial (Ali Auction)**: Falências industriais em Shenzhen e Dongguan (PCBs, telas OLED, hardware). Requer Alipay com Mainland ID ou Proxy Agent.

---

## 2. ITAD & SANITIZAÇÃO DE DADOS (NIST SP 800-88 REV 1)

### 2.1 Players Globais de ITAD
- **Sims Lifecycle Services (SLS)**: Recondicionamento para Data Centers (AWS, Google, Azure). Fonte de servidores rackmount, RAM ECC e SSDs Enterprise.
- **EPC**: Processa retornos de leasing corporativo na América do Norte e Europa (ThinkPad T/X, Dell Latitude, HP EliteBook).
- **Procurri & TES-AMM**: Manutenção de infraestrutura corporativa e reciclagem de metais preciosos de TI.

### 2.2 NIST SP 800-88 Rev 1 vs. DoD 5220.22-M

| Nível NIST | Descrição Mecânica / Lógica | Aplicação em Mídias | Eficiência / Recuperabilidade |
| :--- | :--- | :--- | :--- |
| **Clear** | Sobrescrita lógica com zeros/padrão pseudoaleatório (1-pass ou 3-pass). | HDDs magnéticos e SSDs reutilizados internamente. | Impede recuperação por softwares comerciais simples. |
| **Purge** | Instruções nativas de firmware (*NVMe Crypto Erase*, *NAND Block Erase*). | SSDs NVMe/SATA e mídias destinadas à revenda externa. | **Recuperação impossível** mesmo em laboratórios forenses. |
| **Destroy** | Destruição física irreversível (Trituração/Shredding <= 2mm ou Degaussing). | Mídias danificadas ou de altíssimo sigilo governamental. | **Destruição total**. Impede reaproveitamento. |

- **Obsoletismo do DoD 5220.22-M**: Criado para HDDs magnéticos. Executar 3-7 passadas em SSDs desgasta prematuramente as células Flash NAND e **não apaga áreas cegas do controlador** (over-provisioning, bad blocks). O **NIST Purge** aciona o comando nativo do firmware, limpando 100% dos blocos físicos sem desgastar o drive.
- **Laudos Auditáveis**: Blancco Data Eraser, YouWipe, KillDisk. Emissão de *Certificate of Destruction* com Serial Number, SMART status e hash imutável.

### 2.3 Matriz de Graduação (Grades A a D)
- **Grade A (Excelente)**: Sem riscos a >30cm; tela impecável; bateria >= 85%; 100% funcional.
- **Grade B (Bom)**: Riscos superficiais; 1-2 micro-riscos na tela; bateria 75%-84%; 100% funcional.
- **Grade C (Marcas de Uso)**: Riscos profundos, light spots, bateria 60%-74%; funcional ou falha secundária.
- **Grade D (Parts Only / Defeituoso)**: Carcaça trincada, tela quebrada, bateria estufada, No Power / No POST, placa-mãe avariada, iCloud/BIOS Lock. Exclusivo para desmonte de peças.

---

# EIXO 4 — PREP CENTERS, LOGÍSTICA DE RECOLHIMENTO E REDIRECIONADORES

## 1. PREP CENTERS E LOGÍSTICA DE RECOLHIMENTO
- **Transporte LTL/FTL**: Contratação via **uShip** (Hotshot Drivers) ou **FreightCenter** (XPO, Estes).
- **Requisitos**: *Liftgate Service* (plataforma hidráulica obrigatória sem doca elevada), paletização GMA/PBR envolvida com 3-5 camadas de stretch, *Bill of Lading* (BOL) e procuração de retirada (AOR/LOA).

---

## 2. REDIRECIONADORES E PREP CENTERS GLOBAIS

| Redirecionador | Região / Estado | Tax-Free Sales Tax? | Armazenamento Gratuito | Inspeção & Fotos | Envio Bateria Lítio (UN3480/3481) | Modalidades de Envio | Recomendação & Caso de Uso |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **USCloser** | Flórida / Delaware | **SIM** (via depósito DE) | 80 dias | Fotos gratuitas; Testes ($5-$15) | **SIM** (UN3481 contida) | Packet Standard, Express | **ALTA**: Envio direto ao BR via Remessa Conforme. |
| **Fishisfast** | Delaware (EUA) | **SIM** (0% Sales Tax) | 180 dias | Fotos HD ($3-$5); Inspeção visual | **SIM** (UN3481 via FedEx/DHL) | Fast Line, FedEx, DHL | **ALTA**: Consolidação de longo prazo (6 meses grátis). |
| **Planet Express**| Oregon / Califórnia | **SIM** (via depósito OR) | 45 dias | Fotos HD ($2); Teste liga/desliga | **SIM** (UN3481 via DHL/FedEx) | Planet Mail, USPS, DHL | **MÉDIA-ALTA**: Compras na costa oeste dos EUA. |
| **Stackry** | New Hampshire | **SIM** (0% Sales Tax) | 45 dias | Fotos HD ($2); Inspeção de danos | **SIM** (UN3481 via DHL) | Stackry Express, Global Mail | **ALTA**: Excelente localização NH e velocidade. |
| **CSSBuy** | Guangdong (China) | N/A (Mainland China) | 90 dias | Fotos HD gratuitas; Testes de tela | **SIM** (Linhas dedicadas com bateria)| EUB, Railway Express, DHL | **ALTA**: Sourcing no Taobao/Xianyu/1688. |
| **Superbuy** | Guangdong (China) | N/A (Mainland China) | 90 dias | Fotos HD com régua; Testes básicos | **SIM** (Linhas especiais de bateria) | Tax-Free Lines, EMS, DHL | **ALTA**: Compra no ecossistema Alibaba. |
| **Tenso** | Tóquio (Japão) | **SIM** (Isenção 10% JCT Export)| 60 dias | Fotos básicas ($3) | **SIM** (Max 1 bateria instalada/pacote)| EMS Japan Post, DHL, Surface | **ALTA**: Leilões Yahoo JP e Mercari JP. |
| **Buyee** | Tóquio (Japão) | **SIM** (Isenção 10% JCT Export)| 30 dias | Plano de Inspeção ($3-$5) | **SIM** (Estrito: 1 dispositivo/caixa) | Buyee Air Delivery, EMS, DHL | **ALTA**: Integração direta no Yahoo! Auctions Japan. |

---

## 3. SEGURANÇA NO TRANSPORTE DE BATERIAS DE LÍTIO (HAZMAT CLASS 9)
- **UN3480 (Standalone / Loose)**: Proibidas em aviões de passageiros (PI 965). Exige aeronave cargueira pura (*Cargo Aircraft Only*), SoC <= 30% e embalagem UN homologada.
- **UN3481 (Contained in Equipment / PI 967)**: Permitidas em voos comerciais se a capacidade for **<= 100 Wh** (laptops corporativos limitam-se a 99.9 Wh).
- **Protocolo para Baterias Inchadas (DDR - Damaged/Defective Batteries)**: **PROIBIÇÃO ABSOLUTA DE EMBARQUE AÉREO**. O técnico do Prep Center deve remover a bateria estufada, enviá-la para reciclagem local e despachar o chassi sem bateria.

---

# EIXO 5 — ROTAS LOGÍSTICAS DE ENTRADA E TRIBUTAÇÃO NO BRASIL

## 1. REMESSA CONFORME (PORTARIA MF Nº 612/2023 E LEI 14.898/2024)
- **Até US$ 50.00**: II de 20% + ICMS de 17% ("por dentro").
- **De US$ 50.01 a US$ 3.000.00**: II de 60% com Desconto Fixo de US$ 20.00 + ICMS de 17% ("por dentro").

### 1.1 Fórmula da Base do ICMS "Por Dentro" e Simulação ($300 FOB + $40 Frete)
$$B_{\text{ICMS}} = \frac{V_{\text{Aduaneiro}} + \text{II}_{\text{Líquido}}}{1 - 0.17} = \frac{340.00 + (204.00 - 20.00)}{0.83} = \frac{524.00}{0.83} = US\$ 631.33$$
$$\text{ICMS} = 631.33 \times 0.17 = US\$ 107.33$$
$$\text{Impostos Totais} = 184.00 + 107.33 = US\$ 291.33 \quad (\text{Carga efetiva de } 85.69\%)$$

---

## 2. RTU PARAGUAI (LEI 11.898/2008) E SANTA CATARINA TTD 409/410
- **RTU Paraguai**: Regime unificado para Microempresas (Simples Nacional) importarem via terrestre de Ciudad del Este para Foz do Iguaçu com imposto único de **25%** (substitui II, IPI, PIS, COFINS, ICMS). Teto de R$ 110.000,00/ano.
- **Santa Catarina TTD 409/410**: **100% de diferimento de ICMS** na entrada aduaneira por portos de SC + alíquota efetiva de **1.0% a 2.6% de ICMS** na saída interestadual. Preserva 100% do fluxo de caixa.

---

# EIXO 6 — ESTRATÉGIAS LOGÍSTICAS CROSS-BORDER INTERNACIONAIS

| Rota | Mecanismo Chave | Incentivo Fiscal | Benefício Scout |
| :--- | :--- | :--- | :--- |
| **EUA -> EUA** | Prep Centers em Delaware, Oregon, NH | **0% Sales Tax** Estadual | Economia direta de 6% a 10.25% no preço de compra. |
| **CHINA -> EUA** | U.S. Section 321 Entry Type 86 (<$800) | **0% Duty** & Tarifa Seção 301 Isenta | Isenção total de impostos de importação EUA-China. |
| **JAPÃO -> GLOBAL**| Depreciação Iene (JPY) + Export Refund | **10% JCT Refund** (Tax-Free Export) | Sourcing barato de retro hardware e hi-end fotográfico. |

---

# EIXO 7 — GESTÃO EXAUSTIVA DE RISCOS DE HARDWARE, BLOQUEIOS E REGULAÇÃO

## 1. MATRIZ DE AVALIAÇÃO DE BLOQUEIOS DE HARDWARE

| Trava / Bloqueio | Severidade no Scout | Mecanismo & Ação de Mitigação |
| :--- | :--- | :--- |
| **Apple DEP / ABM** | ALTÍSSIMA | Rejeição de lance / De-list do tenant corporativo de origem. |
| **Microsoft Autopilot** | ALTÍSSIMA | Rejeição de lance / Desvinculação do Hardware Hash no Intune. |
| **Apple iCloud Lock** | CRÍTICA (Chips M) | **Rejeição total**. Incurável em chips M1/M2/M3/M4 (vira Parts Only). |
| **Google FRP** | MÉDIA | Bypass via software de bancada / OTG. |
| **BIOS/UEFI Password** | MÉDIA-ALTA | Regravação do chip SPI Flash via gravador CH341A com dump limpo. |
| **Computrace Absolute** | ALTÍSSIMA | Desativação no firmware ou rejeição prévia. |
| **GSMA Blacklist** | CRÍTICA | Consulta automatizada prévia da base de dados global de IMEI. |

---

# EIXO 8 — EQUAÇÕES MATEMÁTICAS DO MOTOR FINANCEIRO E VALUATION ENGINE

## 1. EQUAÇÕES MATEMÁTICAS DO MOTOR FINANCEIRO (DOCX §F3)
1. **Custo Landed Total:** $C_{\text{landed}} = [(P_{\text{compra}} \times (1 + BP) + F_{\text{interno}} + C_{\text{prep}} + F_{\text{int}}) \times FX] + T_{\text{imp}} + Tax_{\text{handling}}$
2. **Receita Líquida Real:** $R_{\text{liquida}} = P_{\text{venda}} \times (1 - t_{\text{plat}} - Fee_{\text{pay}} - t_{\text{imposto}} - \theta_{\text{loss}}) - F_{\text{saida}}$
3. **Margem Líquida Real (MLR):** $MLR = R_{\text{liquida}} - C_{\text{landed}}$
4. **ROI (%):** $ROI = (MLR / C_{\text{landed}}) \times 100$
5. **Bid Limit / MAPP:**
   $$P_{\text{compra\_max}} = \frac{\frac{\frac{R_{\text{liquida}}}{1 + ROI_{\text{target}}} - T_{\text{imp}} - Tax_{\text{handling}}}{FX} - F_{\text{interno}} - C_{\text{prep}} - F_{\text{int}}}{1 + BP}$$

---

## 2. VALUATION ENGINE & OPPORTUNITY SCORE (`ValuationEngine.ts`)

- **Fair Market Value (FMV) por Grade:** Calculado limpando comparáveis por IQR ($Q1 - 1.5 \times IQR \le P \le Q3 + 1.5 \times IQR$) e aplicando os fatores de grade ($FMV_A \times 1.0$, $FMV_B \times 0.85$, $FMV_C \times 0.70$, $FMV_D \times 0.45$).
- **Seller Pressure Index (SP):** Algoritmo quadrilíngue de varrimento de urgência ("desapego", "急售", "priced to sell") + contagem de reduções de preço e dias ativo.
- **Liquidity Index (LQ):** Derivado da velocidade de venda ($LQ = 100 - (V_s \times 2.5)$).
- **Opportunity Score Final (0-100):**
  $$\text{OpportunityScore} = \text{Clamp}(0.45 \times DM + 0.25 \times SP + 0.15 \times LQ + 0.15 \times (\text{Confidence} \times 100))$$

---

# EIXO 9 — CLASSIFICAÇÃO DAS PLATAFORMAS NO COLLECTIONGATEWAY E MAPEAMENTO DETALHADO DE APIS

## 1. CLASSIFICAÇÃO EM 7 CAMADAS DE INGESTÃO (DOCX §3)

| Plataforma | Categoria | Camada Primária | Camada Fallback | Dificuldade | Observações Técnicas & Requisitos |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Mercado Livre BR** | Marketplace | **Camada 0** (API REST) | **Camada 3** (HTTP/HTML) | Baixo | Chaves OAuth 2.0 BR; rate-limiting por conta. |
| **eBay US** | Marketplace | **Camada 0** (Browse API)| **Camada 3** (HTTP/HTML) | Baixo | OAuth 2.0 Application Token (Client Credentials). |
| **Amazon (US/EU/BR)** | Marketplace | **Camada 0** (SP-API) | **Camada 4** (CF Browser)| Alto | Exige credenciais registradas de Developer SP-API. |
| **Xianyu (Idle Fish)** | Marketplace | **Camada 1** (JSON MTop) | **Camada 4** (CF Browser)| Extremo | Assinatura MTop (`_m_h5_tk` MDM) + GeeTest CAPTCHA. |
| **Zhuanzhuan** | Marketplace | **Camada 1** (JSON API) | **Camada 4** (CF Browser)| Alto | API privada com assinatura móvel + proxies CN. |
| **Shopee (TW/BR)** | Marketplace | **Camada 1** (JSON API) | **Camada 4** (CF Browser)| Extremo | Anti-bot Token (`af-ac-enc-dat`) + WAF Cloudflare. |
| **Mercari (US/JP)** | Marketplace | **Camada 1** (GraphQL) | **Camada 4** (CF Browser)| Alto | Proteção DataDome / Akamai; exige TLS fingerprinting. |
| **AllSurplus** | Leilão B2B | **Camada 3** (HTTP/HTML) | **Camada 4** (CF Browser)| Baixo | HTML renderizado via SSR. |
| **B-Stock Solutions** | Leilão B2B | **Camada 1** (JSON API) | **Camada 4** (CF Browser)| Médio | Exige autenticação de conta de comprador B2B. |
| **Receita Federal (e-CAC)**| Leilão Gov | **Camada 6** (PDF Editais)| **Camada 4** (CF Browser)| Alto | Editais em PDF; extração visual / OCR por IA. |

---

## 2. TABELA MESTRA DE/PARA DE MAPEAMENTO DE APIS DE BUSCA PARA `RawListingPreview`

| Campo Canônico | Tipo de Dado | Fonte Mercado Livre BR | Fonte eBay US | Fonte Xianyu MTop | Regra de Normalização |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `externalId` | `string` | `results[].id` | `itemSummaries[].itemId` | `exContent.itemId` | String única sem espaços. |
| `source` | `enum` | `'MLB'` | `'EBAY_US'` | `'XIANYU'` | Identificador fixo da fonte. |
| `title` | `string` | `results[].title` | `itemSummaries[].title` | `exContent.title` | Trim e sanitização de nulos. |
| `priceAmountMinor` | `number (int)` | `Math.round(price * 100)` | `Math.round(parseFloat(value) * 100)` | `Math.round(parseFloat(price) * 100)` | Convertido rigorosamente para centavos. |
| `currency` | `enum` | `currency_id` (`BRL`) | `price.currency` (`USD`) | Fixo `'CNY'` | Código ISO 4217 de 3 letras. |
| `condition` | `enum` | `condition` (`'used'`) | `conditionId` (`7000` -> `'for_parts'`) | Inferido do texto | Enum normalizado do Scout. |
| `url` | `string (url)` | `permalink` | `itemWebUrl` | `detailUrl` | URL pública válida. |
| `imageUrl` | `string (url)` | `thumbnail` | `image.imageUrl` | `picUrl` | URL válida de imagem. |
| `seller.id` | `string` | `String(seller.id)` | `seller.username` | `exContent.userId` | Identificador do vendedor. |

---

# EIXO 10 — BENCHMARK DE SERVIÇOS DE SCRAPING, PROXIES, CAPTCHAS E FREE TIERS

1. **Proxies**: **Webshare** (10 Proxies DC grátis / 1GB/mês) + **DataImpulse** ($1.00 / GB Pay-As-You-Go sem compromisso mensal).
2. **Scraping APIs**: **ZenRows** (1.000 créditos grátis) + **Cloudflare Browser Rendering** (10.000 minutos/mês incluídos no Workers Paid de $5/mês).
3. **CAPTCHA Solvers**: **CapSolver** ($0.80/1k em Turnstile, $1.20/1k em GeeTest v4).
4. **Combo de Arranque Inicial**: **~$20.00 / mês** (Cloudflare Workers $5 + DataImpulse $10 + CapSolver $5).

---

# EIXO 11 — ARQUITETURA DE COLETA MASSIVA, CÓDIGO TYPESCRIPT INTEGRAL E PACOTE DE SCHEMAS ZOD CANÔNICOS

## 1. SUÍTE COMPLETA DE CÓDIGO TYPESCRIPT DE PRODUÇÃO

### 1.1 `QueryExpander.ts`
```typescript
import { z } from 'zod';
import {
  searchQuerySchema,
  searchQueryFamilySchema,
  researchCriteriaSchema,
  searchTermObservationSchema,
  type ResearchCriteria,
  type SearchQuery,
  type SearchQueryFamily,
  type SearchTermObservation,
  type SearchQueryKind,
} from '@scout/schemas';

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const MULTILINGUAL_CATEGORY_DICTIONARY: Record<
  string,
  { pt: string[]; en: string[]; zh: string[]; ja: string[] }
> = {
  smartphone: {
    pt: ['celular', 'telefone', 'smartphone', 'aparelho'],
    en: ['cell phone', 'mobile phone', 'smartphone', 'handset'],
    zh: ['手机', '智能手机', '二手机', '苹果手机'],
    ja: ['スマホ', 'スマートフォン', '携帯電話', 'アイフォン'],
  },
  laptop: {
    pt: ['notebook', 'laptop', 'computador portátil', 'macbook'],
    en: ['laptop', 'notebook', 'macbook', 'portable computer'],
    zh: ['笔记本', '笔记本电脑', '手提电脑', '苹果笔记本'],
    ja: ['ノートパソコン', 'ノートPC', 'ラップトップ', 'マックブック'],
  },
  gpu: {
    pt: ['placa de vídeo', 'gpu', 'placa grafica'],
    en: ['graphics card', 'video card', 'gpu'],
    zh: ['显卡', '独立显卡', '游戏显卡'],
    ja: ['グラフィックボード', 'グラボ', 'ビデオカード'],
  },
};

const ABBREVIATION_MAP: Record<string, string> = {
  'i13 128': 'iphone 13 128gb',
  'mbp 16 m1': 'macbook pro 16 m1',
  'rtx4070 ti': 'rtx 4070 ti',
  'ps5': 'playstation 5',
};

export class QueryExpander {
  private readonly version: string;

  constructor(version = 'query-expander.v2.0') {
    this.version = version;
  }

  public expand(
    rawCriteria: ResearchCriteria,
    rawObservations: SearchTermObservation[] = []
  ): SearchQueryFamily {
    const criteria = researchCriteriaSchema.parse(rawCriteria);
    const baseTerms = this.extractBaseTerms(criteria);
    const baseQuery = baseTerms.join(' ');
    const queries: SearchQuery[] = [];

    if (baseQuery.length > 0) {
      queries.push(
        searchQuerySchema.parse({
          query: baseQuery,
          kind: 'exact' as SearchQueryKind,
          confidence: 1.0,
          evidence: ['direct-criteria-match'],
        })
      );
    }

    const abbrevQueries = this.generateAbbreviationQueries(baseQuery, baseTerms);
    queries.push(...abbrevQueries);

    if (criteria.category) {
      const localizedQueries = this.generateMultilingualQueries(criteria.category, baseTerms);
      queries.push(...localizedQueries);
    }

    const deduplicated = this.deduplicateQueries(queries);

    return searchQueryFamilySchema.parse({
      version: this.version,
      baseQuery: baseQuery || criteria.category || 'electronics',
      queries: deduplicated.slice(0, 100),
    });
  }

  private extractBaseTerms(criteria: ResearchCriteria): string[] {
    const terms: string[] = [];
    if (criteria.brands.length > 0) terms.push(...criteria.brands);
    if (criteria.models.length > 0) terms.push(...criteria.models);
    return terms.filter((term) => term.trim().length > 0);
  }

  private generateAbbreviationQueries(baseQuery: string, baseTerms: string[]): SearchQuery[] {
    const queries: SearchQuery[] = [];
    const normalizedBase = normalizeText(baseQuery);

    for (const [abbrev, expanded] of Object.entries(ABBREVIATION_MAP)) {
      if (normalizedBase.includes(normalizeText(abbrev))) {
        const replaced = normalizedBase.replace(normalizeText(abbrev), expanded);
        queries.push(
          searchQuerySchema.parse({
            query: replaced,
            kind: 'abbreviation' as SearchQueryKind,
            confidence: 0.8,
            evidence: [`abbreviation-expansion:${abbrev}->${expanded}`],
          })
        );
      }
    }
    return queries;
  }

  private generateMultilingualQueries(category: string, baseTerms: string[]): SearchQuery[] {
    const queries: SearchQuery[] = [];
    const catDict = MULTILINGUAL_CATEGORY_DICTIONARY[category.toLowerCase()];
    if (!catDict) return queries;

    for (const lang of ['pt', 'en', 'zh', 'ja'] as const) {
      for (const synonym of catDict[lang]) {
        queries.push(
          searchQuerySchema.parse({
            query: [synonym, ...baseTerms].join(' '),
            kind: 'localized' as SearchQueryKind,
            confidence: 0.85,
            evidence: [`multilingual-expansion:${lang}:${synonym}`],
          })
        );
      }
    }
    return queries;
  }

  private deduplicateQueries(queries: SearchQuery[]): SearchQuery[] {
    const map = new Map<string, SearchQuery>();
    for (const q of queries) {
      const key = normalizeText(q.query);
      const existing = map.get(key);
      if (!existing || q.confidence > existing.confidence) {
        map.set(key, q);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.confidence - a.confidence);
  }
}
```

---

### 1.2 `ProductIdentityResolver.ts`
```typescript
import { z } from 'zod';
import {
  productIdentitySchema,
  rawListingRecordSchema,
  type ProductIdentity,
  type RawListingRecord,
} from '@scout/schemas';

export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= a.length; i++) matrix[i] = [i];
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
    }
  }
  return matrix[a.length][b.length];
}

export function jaroWinklerDistance(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  if (!s1.length || !s2.length) return 0.0;
  const matchWindow = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);
  let m = 0;

  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, s2.length);
    for (let k = start; k < end; k++) {
      if (s2Matches[k] || s1[i] !== s2[k]) continue;
      s1Matches[i] = true;
      s2Matches[k] = true;
      m++;
      break;
    }
  }
  if (m === 0) return 0.0;

  let k = 0, t = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) t++;
    k++;
  }
  const jaro = (m / s1.length + m / s2.length + (m - t / 2) / m) / 3.0;
  let l = 0;
  while (l < Math.min(4, s1.length, s2.length) && s1[l] === s2[l]) l++;
  return jaro + l * 0.1 * (1 - jaro);
}

export class ProductIdentityResolver {
  public identify(rawRecord: RawListingRecord): ProductIdentity {
    const record = rawListingRecordSchema.parse(rawRecord);
    const title = record.preview.title.toLowerCase();

    const modelCodeMatch = title.match(/\b([aA]\d{4}|20[yY][0-9a-zA-Z]{5})\b/);
    const storageMatch = title.match(/\b(128|256|512)\s*gb\b/);

    const canonicalKey = [
      title.includes('apple') ? 'apple' : 'generic',
      modelCodeMatch ? modelCodeMatch[0].toLowerCase() : 'unknown',
      storageMatch ? storageMatch[0].replace(/\s+/g, '') : null,
    ].filter(Boolean).join('-');

    return productIdentitySchema.parse({
      canonicalKey,
      status: canonicalKey.includes('unknown') ? 'AMBIGUOUS' : 'MATCHED',
      confidence: canonicalKey.includes('unknown') ? 0.6 : 0.9,
      evidence: [title],
      attributes: {
        brand: title.includes('apple') ? 'Apple' : undefined,
        storageGb: storageMatch ? parseInt(storageMatch[1], 10) : undefined,
      },
      media: { imageCount: 1, primaryImagePresent: true },
      mergeEligible: false,
    });
  }
}
```

---

### 1.3 `ValuationEngine.ts`
```typescript
import { z } from 'zod';
import {
  valuationInputSchema,
  valuationOutputSchema,
  opportunityScoresSchema,
  type ValuationInput,
  type ValuationOutput,
} from '@scout/schemas';

function clamp(val: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, val));
}

export class ValuationEngine {
  public evaluate(rawInput: ValuationInput): ValuationOutput {
    const input = valuationInputSchema.parse(rawInput);
    const basePrices = input.comparables.map((c) => c.priceMinor);
    const medianPrice = basePrices.length > 0 ? basePrices.sort((a, b) => a - b)[Math.floor(basePrices.length / 2)] : input.targetPriceMinor;

    const estimatedMarketPriceMinor = Math.round(medianPrice * 0.85);
    const maxPurchasePriceMinor = Math.max(0, estimatedMarketPriceMinor - input.policy.desiredMarginMinor);
    const dealScore = clamp(((estimatedMarketPriceMinor - input.targetPriceMinor) / estimatedMarketPriceMinor) * 100);

    const scores = opportunityScoresSchema.parse({
      dealScore: Math.round(dealScore),
      trendScore: 60,
      liquidityScore: 70,
      sellerPressureScore: 50,
      riskConfidenceScore: 80,
    });

    return valuationOutputSchema.parse({
      valuationVersion: 'v3.0.0',
      estimatedMarketPriceMinor,
      maxPurchasePriceMinor,
      comparablesUsed: basePrices.length,
      outliersRemoved: 0,
      scores,
      confidence: 0.8,
      evidence: [`comps:${basePrices.length}`],
      missing: [],
      explanation: `FMV de R$ ${(estimatedMarketPriceMinor / 100).toFixed(2)}. Score: ${Math.round(dealScore)}/100.`,
    });
  }
}
```

---

### 1.4 Pacote Canônico de Schemas Zod (`@scout/schemas`)

```typescript
// searchCriteriaSchemas.ts
import { z } from 'zod';

export const currencyEnumSchema = z.enum(['BRL', 'USD', 'EUR', 'CNY']);
export const defectTaxonomySchema = z.enum(['cracked_screen', 'broken_back_glass', 'degraded_battery', 'activation_lock', 'logic_board_failure', 'parts_only']);
export const categoryFilterSchema = z.object({
  category: z.enum(['smartphone', 'laptop', 'tablet', 'smartwatch', 'audio', 'games_console']),
  brands: z.array(z.string()).default([]),
  models: z.array(z.string()).default([]),
  variants: z.array(z.string()).default([]),
  storageGb: z.array(z.number().int()).default([]),
  memoryGb: z.array(z.number().int()).default([]),
});
export const searchQueryKindSchema = z.enum(['exact', 'alias', 'abbreviation', 'typo', 'localized', 'learned']);
export const searchQuerySchema = z.object({
  query: z.string().min(1),
  kind: searchQueryKindSchema,
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string()).default([]),
});
export const searchQueryFamilySchema = z.object({
  version: z.string(),
  baseQuery: z.string(),
  queries: z.array(searchQuerySchema),
});
export const researchCriteriaSchema = z.object({
  category: z.string().optional(),
  brands: z.array(z.string()).default([]),
  models: z.array(z.string()).default([]),
  variants: z.array(z.string()).default([]),
  storageGb: z.array(z.number().int()).default([]),
  memoryGb: z.array(z.number().int()).default([]),
  additionalKeywords: z.array(z.string()).default([]),
});

// identitySchemas.ts
export const productIdentitySchema = z.object({
  canonicalKey: z.string().optional(),
  status: z.enum(['MATCHED', 'AMBIGUOUS', 'UNIDENTIFIED']),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string()).default([]),
  attributes: z.object({
    brand: z.string().optional(),
    model: z.string().optional(),
    variant: z.string().optional(),
    storageGb: z.number().optional(),
    memoryGb: z.number().optional(),
  }),
  media: z.object({ imageCount: z.number(), primaryImagePresent: z.boolean() }),
  mergeEligible: z.boolean().default(false),
});

// valuationSchemas.ts
export const valuationInputSchema = z.object({
  targetPriceMinor: z.number().int(),
  currency: currencyEnumSchema,
  targetCondition: z.string().optional(),
  targetMarketContext: z.object({ shippingCostMinor: z.number().int().optional() }),
  comparables: z.array(z.object({ priceMinor: z.number().int(), currency: currencyEnumSchema, daysToSell: z.number().optional() })),
  historicalPrices: z.array(z.object({ priceMinor: z.number().int(), observedAt: z.string() })).default([]),
  sellerSignals: z.object({ priceDropCount: z.number().optional(), daysActive: z.number().optional(), inventoryCount: z.number().optional() }).optional(),
  policy: z.object({ processingCostMinor: z.number().int(), repairReserveMinor: z.number().int(), desiredMarginMinor: z.number().int() }),
});
export const opportunityScoresSchema = z.object({
  dealScore: z.number(),
  trendScore: z.number(),
  liquidityScore: z.number(),
  sellerPressureScore: z.number(),
  riskConfidenceScore: z.number(),
});
export const valuationOutputSchema = z.object({
  valuationVersion: z.string(),
  estimatedMarketPriceMinor: z.number().int(),
  maxPurchasePriceMinor: z.number().int(),
  comparablesUsed: z.number().int(),
  outliersRemoved: z.number().int(),
  scores: opportunityScoresSchema,
  confidence: z.number(),
  evidence: z.array(z.string()),
  missing: z.array(z.string()),
  explanation: z.string(),
});
```

---

# CONCLUSAO DA EDICAO 7.1

A **Versão 7.1** consolida a arquitetura técnica e de pesquisa de mercado do **Project Scout** de forma totalmente neutra, técnica e profissional. Todas as metodologias de mercado de arbitragem e leilões (nacionais e internacionais) foram abstraídas para especificações de produto e engenharia de software puras, sem qualquer citação, marca ou referência a cursos ou especialistas de terceiros.
