# Roadmap — Project Scout

> Now / Next / Later. Uma fatia por vez, na ordem. Cada fatia tem um
> **pronto quando** verificável — se não dá para executar e mostrar, não está
> pronta.
>
> O que **existe** hoje está em [docs/status.md](./docs/status.md). Este
> documento é só o que ainda não existe.

## Princípio de ordenação

Duas forças em tensão, resolvidas nesta ordem:

1. **A loja precisa comprar agora.** As primeiras fatias entregam garimpo real
   usando a fonte que já está viva (eBay), porque valor na mão financia o resto.
2. **O núcleo próprio é o produto.** A partir da fatia 5, cada fatia derruba uma
   camada da cascata de coleta. Nenhuma fatia inventa abstração antes do segundo
   caso concreto existir.

Não há "fase". Há fila.

---

## Agora — primeiro garimpo real

### S1 — eBay sai do mock

Coleta contínua persistindo dados reais, com orçamento de chamadas, health por
fonte e alerta de DLQ.
**Pronto quando:** uma pesquisa real do Caio grava anúncios reais no banco, com
custo de chamadas medido e nenhuma chave exposta em log.

### S2 — IA de texto de verdade

LLM real atrás da porta `TextAnalyzer`, com extração **dirigida por schema**
(o chamador passa o schema de saída; o extrator não conhece "defeito de
iPhone"). Defesa de injeção obrigatória. Testes com resposta gravada, não com
rede.
**Pronto quando:** um anúncio real de eBay produz defeitos, evidências e
afirmações do vendedor com origem e grau — e um anúncio malicioso não muda o
comportamento do sistema.

### S3 — Score, feed ranqueado e exportação

O cálculo de custo total e oportunidade vira score explicável; a UI vira um feed
ordenado, filtrável e comparável; exporta CSV/XLSX.
**Pronto quando:** o Caio abre a tela e decide o que comprar sem abrir o site da
fonte.

### S4 — Checkup visual

IA multimodal na imagem principal dos finalistas: dano visível, tela ligada,
peça faltando, foto genérica reusada, incoerência com a descrição.
**Pronto quando:** o sistema aponta um dano que não estava escrito na descrição,
com a evidência ao lado da conclusão.

### S5 — Cascata camada 4 e a primeira fonte BR

Implementar `ScrapingProvider` próprio (HTTP/HTML direto), a costura
`SourceDocument` (preço deixa de ser obrigatório no núcleo; enums de categoria e
marca saem do critério global) e a primeira fonte sem API oficial: **OLX**.
**Pronto quando:** anúncios de OLX e de eBay aparecem no mesmo feed ranqueado,
sem nenhuma regra específica de OLX vazando para fora do connector.

### S6 — Navegador e Local Agent somente-leitura

Camada 5 da cascata, rodando também na máquina do Caio com sessão dele. Primeira
fonte que exige login.
**Pronto quando:** uma fonte autenticada é coletada da máquina local e cai no
mesmo pipeline, sem credencial saindo da máquina.

---

## Depois — o núcleo que se sustenta

### S7 — Proxy, rotação e saúde por fonte

Rotação de IP, limite por fonte, circuit breaker e `collector_health` real por
camada.
**Pronto quando:** uma fonte bloqueada degrada de forma ordenada e visível, sem
tempestade de retry.

### S8 — Auto-cura v1

Detectar quebra (a partir de `observation_events` reais) → classificar → propor
correção com fixture, canário e rollback → aprovação humana.
**Pronto quando:** uma quebra real de fonte gera diagnóstico e proposta sem
ninguém ter percebido antes do sistema.

### S9 — Monitoramento contínuo e alerta

Pesquisa salva que roda sozinha e avisa quando aparece oportunidade acima do
corte ou quando um preço monitorado cai.

### S10 — Leilões somente-leitura

AllSurplus, BidSpotter, Freitas: dossiê de lote, custo por unidade útil, taxas e
prazo. Sem lance.

### S11 — Cadeia de fornecimento

Alibaba/JD/fabricantes: o mesmo produto nos níveis fábrica → fornecedor →
distribuidor → revendedor, com preço e prazo comparados.

---

## Mais tarde

- **S12 — Ação sob autorização**: envelope assinado, ledger idempotente e
  executor local para lance e compra. Só depois que o garimpo estiver maduro.
- **S13 — Segunda vertical** (vídeo ou fórum), que é o teste de verdade da
  genericidade do núcleo.
- **S14 — Mercado Livre retomado**; Xianyu apenas com contrato e compliance.

---

## Congelado (com motivo)

| Item                             | Motivo                                                             |
| -------------------------------- | ------------------------------------------------------------------ |
| Integração com a Eletrofy        | Decisão do fundador em 2026-08-15; entra depois do núcleo aprovado |
| Mercado Livre                    | Suspenso até nova decisão de política/OAuth                        |
| Xianyu                           | Sem contrato ou endpoint autorizado                                |
| MCP público / API para terceiros | Só depois do núcleo próprio maduro                                 |
