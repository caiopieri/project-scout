# HANDOFF-S1.1b-2 — Família de queries e filtro de camada 1

> Segunda metade da S1.1b. Depende de [S1.1b-1](./HANDOFF-S1.1b-1.md) mergeada.
> Ler antes: [funil-e-risco.md](../funil-e-risco.md) §2.

## Objetivo

Gastar chamada cara só em quem sobreviveu ao filtro barato, e cobrir o mercado
com mais de uma forma de perguntar.

## Pronto quando

1. Uma execução usa **mais de uma query** da família por vez. O gerador
   determinístico já existe em `packages/search-intelligence` — usar, não
   reescrever.
2. A chamada de detalhe (`/buy/browse/v1/item/`) **só acontece** para o anúncio
   que sobreviveu ao filtro barato aplicado sobre o resultado da busca: faixa de
   preço, correspondência de título, defeito rejeitado.
3. Quem morreu na camada 1 vira **decisão de triagem persistida**, com o motivo —
   não some, e não vira detalhe buscado.
4. Preview rejeitado **não se perde** quando o orçamento de detalhe acaba: o
   anúncio segue registrado no nível de informação que se conseguiu.
5. Provado por teste: N previews entram, M ≤ N chamadas de detalhe saem, e a
   diferença aparece como triagem.

Evidência exigida: **live** — uma execução real mostrando previews coletados,
detalhes buscados e triagens registradas, com os três números diferentes.

## Contrato

- O filtro usa o critério estruturado que já existe (`researchCriteriaSchema`).
  Nenhum critério novo nesta fatia.
- Regra de eBay não sobe para o núcleo.
- Nenhuma migration. `listing_triage_decisions` já existe.

## Caminho de usuário

Mesma rota. O usuário passa a ver, na execução, quantos foram vistos e quantos
foram descartados antes de custar chamada.

## Fora de escopo

- Score, mediana, custo total, IA, imagem, outras fontes.
- Rodar a sonda live (é do Engenheiro).

## Onde isto pode dar errado

- **Filtro barato demais descarta o achado.** Título de eBay mente para os dois
  lados; filtro de título agressivo mata justamente o anúncio mal anunciado que é
  a oportunidade. Na dúvida a camada 1 deixa passar: falso positivo custa uma
  chamada, falso negativo custa o negócio.
- **Família de queries multiplica o consumo de quota.** Três queries por execução
  triplicam o gasto. O orçamento da S1.1b-1 é por execução, não por query — se
  isso não estiver claro no código, a família fura o teto.
- **Triagem persistida vira lixo se ninguém a lê.** Se nenhuma tela mostra o que
  foi descartado e por quê, é escrita sem leitor — exatamente o padrão que o
  AGENTS.md §2 proíbe. A S1.3 precisa mostrar.
