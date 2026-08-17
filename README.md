# Project Scout

Núcleo próprio de coleta e inteligência de busca na web, e aplicações em cima
dele. A primeira aplicação é **garimpo de eletrônicos** para uma loja real:
encontrar, entender e ranquear oportunidades de compra em qualquer fonte da
internet.

- **Visão:** [docs/vision.md](docs/vision.md)
- **Requisitos da aplicação atual:** [docs/prd.md](docs/prd.md)
- **O que existe hoje:** [docs/status.md](docs/status.md) ← comece por aqui
- **Próxima fatia:** [ROADMAP.md](ROADMAP.md)
- **Como se trabalha aqui:** [AGENTS.md](AGENTS.md)

## Estado em uma frase

Plataforma serverless com auth, fila, raw store e um conector oficial de eBay
funcionando; **a cascata de coleta própria, a IA e o ranking de oportunidades
ainda não existem**. Detalhe honesto em [docs/status.md](docs/status.md).

## Stack

TypeScript monorepo · Next.js (`apps/web`) · Cloudflare Workers + Queues + KV +
R2 + Durable Objects (`apps/worker`) · Supabase PostgreSQL com RLS · Vitest.

## Rodando local

```bash
npm install
cp .env.example .env                  # preencha; segredos nunca vão para o git
npm run db:start && npm run db:migrate
npm run dev --prefix apps/worker      # API   → http://localhost:8787
npm run dev --prefix apps/web         # UI    → http://localhost:3000
```

Gate antes de qualquer entrega:

```bash
npm run typecheck && npm run lint && npm run test && npm run build
```

## Layout

```
apps/web              UI Next.js
apps/worker           API Worker + consumidores de fila
packages/domain       Contratos e portas, sem dependência de fornecedor
packages/schemas      Zod: toda fronteira de dado
packages/collection   Gateway de coleta, ingestão e normalização
packages/ebay-connector, ml-connector, xianyu-connector
packages/search-intelligence  Famílias de query, triagem barata, identidade
packages/valuation    Custo total, comparáveis e oportunidade
packages/ai           Interpretação de intenção e análise de texto
packages/database     Repositórios Supabase/PostgreSQL
docs/archive          Histórico M1–M7 e F0–F7. Contexto, não requisito.
```
