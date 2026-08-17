# AGENTS.md — Como se trabalha no Project Scout

> Regulamento de engenharia. Vale para todo agente e todo humano que toca este
> repositório. Complementa `~/.claude/CLAUDE.md` (contrato de comportamento);
> em conflito, este vence por ser mais específico.

---

## 1. Leia nesta ordem

| Documento                                    | Responde                                                          |
| -------------------------------------------- | ----------------------------------------------------------------- |
| [docs/vision.md](docs/vision.md)             | O que estamos construindo e por quê                               |
| [docs/prd.md](docs/prd.md)                   | O que a primeira aplicação precisa fazer                          |
| [docs/status.md](docs/status.md)             | O que **existe** hoje — a única fonte de verdade sobre capacidade |
| [ROADMAP.md](ROADMAP.md)                     | Qual é a próxima fatia                                            |
| [docs/architecture.md](docs/architecture.md) | Como construir                                                    |
| [docs/decisions.md](docs/decisions.md)       | O que já foi decidido e não se rediscute sem ADR                  |
| [LOG-VERIFICACAO.md](LOG-VERIFICACAO.md)     | O que foi realmente verificado                                    |
| [docs/security-DoD.md](docs/security-DoD.md) | Checklist de segurança                                            |

Histórico anterior (M1–M7, F0–F7) está em `docs/archive/`. É contexto, não
instrução: **não trate documento arquivado como requisito**.

---

## 2. A regra que mata o problema que já tivemos

Este repositório já produziu ~2.000 linhas de código testado, aprovado e
**inalcançável** — funções puras de fases futuras que nenhuma rota, fila,
consumidor ou tela chamava. A suíte ficava verde e o sistema não fazia nada.

> **Toda fatia entrega um caminho que um usuário alcança.**
>
> Se o Caio não consegue disparar sua mudança pela API ou pela tela, e ver o
> efeito, ela não está pronta — por mais testada que esteja.

Corolários, todos obrigatórios:

- **Sem código órfão.** Se você criou uma classe, algo em `apps/` a instancia na
  mesma fatia. Se não instancia, não crie ainda.
- **Sem teste-marcador.** Teste que verifica se uma constante é igual a ela
  mesma não é teste. Teste comportamento observável.
- **Sem fase adiantada.** Não implemente item de "Depois"/"Mais tarde" do
  ROADMAP enquanto houver item em "Agora". Se achar que a ordem está errada,
  diga — não contorne.
- **Sem abstração especulativa.** Generalize quando existir o **segundo** caso
  concreto, não antes. Remover especificidade gratuita é sempre permitido;
  inventar maquinaria genérica para fonte que não existe, não.

---

## 3. Ciclo de uma fatia

```
1. Ler status.md + ROADMAP.md   → verificar: sei o que existe e qual é a fatia
2. Escrever o handoff           → verificar: escopo, contrato e "pronto quando" por escrito
3. Implementar                  → verificar: gate do §5 verde
4. Provar com execução real     → verificar: evidência colada, não prometida
5. Registrar                    → verificar: status.md, LOG-VERIFICACAO.md e ADR atualizados
```

### 3.1 Handoff

Antes de codar, `docs/handoffs/HANDOFF-<slice>.md` com:

- **Objetivo** em uma frase.
- **Pronto quando**: critério verificável, na forma "executar X produz Y".
- **Contrato**: entradas, saídas, schemas Zod tocados, portas novas.
- **Caminho de usuário**: qual rota/tela alcança isto.
- **Fora de escopo** desta fatia.
- **Onde pode dar errado**: obrigatório, sem isto o handoff está incompleto.

### 3.2 Evidência

`LOG-VERIFICACAO.md` só recebe linha depois de **executar**. Distinga sempre:

| Nível            | O que significa                                                       |
| ---------------- | --------------------------------------------------------------------- |
| Fixture          | Rodou contra dado local. Não prova integração.                        |
| Integração local | Rodou contra Supabase/Wrangler locais.                                |
| **Live**         | Rodou contra a fonte real, com credencial real, e retornou dado real. |

Uma fatia de coleta ou IA só fecha com evidência **live**. Nunca escreva
"funciona" sobre caminho que só rodou com mock — escreva o que rodou.

---

## 4. Comandos

```bash
npm install                      # raiz
npm run build                    # todos os workspaces
npm run typecheck
npm run lint
npm run test                     # Vitest
npm run db:start | db:migrate | db:reset | db:test
npm run dev --prefix apps/worker # API Worker
npm run dev --prefix apps/web    # UI Next.js
npm run ebay:smoke               # exige modo + credencial explícitos
npm run ebay:setup               # onboarding local de credencial (grava só em .dev.vars ignorado)
```

---

## 5. Definition of Done

Nenhuma fatia é declarada pronta sem todos os itens:

- [ ] `npm run typecheck`, `npm run lint`, `npm run build` limpos.
- [ ] `npm run test` verde. **Nunca apague ou desabilite teste sem autorização
      explícita do Caio.**
- [ ] Caminho de usuário existe e foi exercitado.
- [ ] Evidência de execução colada em `LOG-VERIFICACAO.md`, com o nível correto.
- [ ] `docs/status.md` atualizado se a fatia mudou capacidade.
- [ ] Revisão de segurança (`docs/security-DoD.md`) se tocou banco, auth, input
      externo, credencial, coleta ou pagamento.
- [ ] Diff mínimo. PR ≤ ~300 linhas; se estourar, quebre a fatia.
- [ ] Checagem de escopo: o que entrou além do pedido? Justifique ou remova.

---

## 6. Convenções de código

- **TypeScript estrito.** `any` só com justificativa na linha adjacente.
- **Zod na fronteira.** Todo payload que entra ou sai — request, resposta de
  fonte, saída de LLM — é validado em `packages/schemas`.
- **Identidade de listing**: `(source_id, external_id)` é canônica. Hash SHA-256
  do raw suprime snapshot duplicado. IDs externos diferentes nunca são fundidos
  automaticamente.
- **Ciclo de vida de projeto**: `draft`, `active`, `archived`, `deleted` (soft).
  Leitura padrão exclui `deleted`.
- **Ciclo de vida de coleta**: `pending`, `running`, `completed`, `failed`, com
  idempotência por projeto, claim atômico, retry transitório limitado e erro
  permanente terminal.
- **Nada de lógica de fonte fora do connector.** Regra de OLX mora no connector
  de OLX. O núcleo não sabe o nome de nenhuma fonte.
- **Vocabulário de comércio não sobe para o núcleo.** Preço, defeito, margem e
  condição pertencem à vertical.
- **Dinheiro em inteiro menor** (centavos), com moeda explícita. Nunca `float`.
- **Falha fecha.** Configuração ausente, limite indisponível ou payload inválido
  resultam em recusa, não em melhor esforço.

---

## 7. Segurança

### 7.1 Injeção de prompt

Todo conteúdo coletado é hostil. Descrição de anúncio pode conter instrução para
o modelo.

- Nunca interpole texto coletado direto no prompt.
- Envolva em tag estrita (`<listing_description>…</listing_description>`).
- Exija saída em JSON validado por schema.
- Conteúdo coletado **nunca** decide chamada de ferramenta ou ação.

### 7.2 Credenciais

- Nenhum segredo no código, no chat ou em log. Só em `.dev.vars`/`.env.local`
  ignorados e `wrangler secret put`.
- Ao precisar de uma credencial, peça de forma acionável: onde obter, em qual
  arquivo/variável colocar, qual comando rodar depois.
- Credencial do usuário no Local Agent **não sai da máquina dele**.

### 7.3 Coleta responsável

Permitido: API oficial, endpoint público, HTML público, navegador com a sessão
do próprio usuário, proxy, rotação de IP, limite de taxa próprio.

Proibido: contornar CAPTCHA, burlar controle de acesso, usar credencial de
terceiro, ignorar `robots.txt` sem decisão explícita registrada do Caio, e
qualquer volume que degrade o serviço da fonte.

### 7.4 Ação vinculante

Comprar, dar lance, pagar e enviar mensagem exigem autorização humana explícita
por ação, com limite e expiração. Nenhum agente executa ação vinculante hoje —
o executor não existe e não deve ser criado fora da fatia S12.

---

## 8. Fora de escopo (e o que **deixou** de estar)

Proibido hoje:

- Executor de compra, lance ou pagamento (ver §7.4).
- Envio automático de mensagem a vendedor.
- Categorias fora de eletrônicos: veículo, imóvel, máquina industrial.
- MCP público ou API para terceiros.
- Gerador automático de connector. Connector novo é escrito e revisado por
  humano até existirem ao menos quatro fontes maduras.

**Revogado em 2026-08-17** — estas proibições existiam no regulamento anterior e
contradiziam a visão do fundador:

- ~~OLX, Facebook Marketplace, Alibaba, leilões~~ → agora são alvo explícito.
- ~~"crawler próprio proibido; todo tráfego via provedor externo"~~ → o núcleo
  próprio de coleta **é** o produto.
- ~~"auto-cura, leilão, negociação e Local Agent fora de escopo"~~ → estão no
  ROADMAP, na fila, com gate.

---

## 9. Como falar com o Caio

- **Par técnico, não torcida.** Proponha o melhor, não o que foi pedido, quando
  divergirem — com o porquê.
- **Toda proposta de plano termina com `### Onde isto pode dar errado`.** Sem
  isso a resposta está incompleta.
- **Nunca declare sucesso sem ter executado.** "Deve funcionar" não é resultado.
- **Ação manual necessária vira pedido acionável**: onde entrar, onde obter, em
  qual arquivo colocar, qual comando rodar.
- Conversa longa não é acordo. Reancore na spec e no fato.

---

## 10. Alocação de modelo

- Orquestração, plano, crítica, decisão de contrato → modelo capaz.
- Subtarefa especificável (boilerplate, rename, padrão já decidido) → modelo
  barato.
- Lógica real de negócio → modelo capaz. Código barato vira depuração de
  alucinação.
