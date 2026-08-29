# Módulo R1 — Fechamento live do Round 1

> Definição de módulo escrita pelo Arquiteto em 2026-08-29, por decisão do
> fundador de rodar um bloco autônomo longo em vez de aprovação por PR.
> Formato em [BOOTSTRAP-ENGENHEIRO.md](./BOOTSTRAP-ENGENHEIRO.md).
> Este documento é a autoridade do módulo; onde ele calar, vale o
> [AGENTS.md](../../AGENTS.md).

---

## 1. Por que este módulo existe

O ROADMAP tem quinze andares desenhados e o segundo degrau não foi pisado.

Desde a S1.1 — a única fatia fechada com evidência **live** — foram escritas
sete fatias (S1.1b-1b volume e reliability, S1.1b-2, S1.2, S1.3, S2.1, S2.2,
S2.3) e todas entraram em `main` no commit `2a6c16c`, 54 arquivos, sem PR e sem
uma única execução contra fonte real. O `LOG-VERIFICACAO.md` é honesto: sete
linhas seguidas dizem `⚠️ live pendente`.

**Não há suspeita de que o código esteja errado. Há a constatação de que ele não
foi provado.** Este módulo não escreve funcionalidade nova. Ele converte código
não provado em capacidade verificada, e depois para.

O gargalo é único e concreto: **ninguém rodou uma coleta live com orçamento
efetivo ≥100**. Essa execução destrava quatro fatias de uma vez.

## 2. Contrato de autonomia

Decisão do fundador: o Engenheiro conduz o módulo inteiro sem aprovação por
fatia. O Arquiteto volta no fim.

Isso remove a revisão humana por PR, então **o portão que substitui a revisão é
evidência de execução, não suíte verde**. Suíte verde já foi obtida sete vezes
seguidas sem provar nada. Cada round abaixo fecha com um fato observável no
banco, na rota ou na tela — coisa que não se obtém escrevendo teste.

Regra operacional: `npm test` verde é pré-requisito para tentar, nunca prova de
que fechou.

### 2.1 Quando parar e chamar o Arquiteto

Estes são os únicos motivos legítimos de interromper o módulo. Fora deles,
siga sem perguntar.

| #   | Gatilho                              | O que fazer                                                                                                                             |
| --- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Falta credencial ou segredo          | Pare. Peça de forma acionável: onde obter, em qual arquivo, qual variável, qual comando rodar depois. Nunca invente valor nem contorne. |
| 2   | Decisão do fundador                  | Pare e pergunte. Não decida escopo, vertical, política de custo ou privacidade.                                                         |
| 3   | Mesmo round falhou 2 vezes           | Pare e escale ([protocolo §6](./protocolo.md)). Loop de correção não conserta problema de projeto.                                      |
| 4   | Teto de execuções live atingido      | Pare. Ver §4.                                                                                                                           |
| 5   | Handoff contradiz o código           | Não decida sozinho. Devolva ao Arquiteto com a contradição por escrito.                                                                 |
| 6   | Um round exigiria diff > ~300 linhas | Quebre. Se a quebra não for óbvia, pergunte. Nunca corte teste para caber (ADR 1.65).                                                   |

## 3. Ordem dos rounds

Sequencial. Round seguinte só abre com o anterior fechado. Cada round tem um
critério de saída que é um fato executado, não um teste.

### R0 — Higiene e verdade

Sem funcionalidade. O objetivo é que a palavra "verde" volte a significar algo.

1. **Sincronizar.** A raiz do repositório está em `spec/S1.1b-1c`, 13 commits
   atrás e já mergeada. Trazer para `main` atualizada.
2. **Podar branches**, só as que forem ancestrais comprovados de `main`
   (`git merge-base --is-ancestor`). Verifique uma a uma; não confie nesta
   lista. **Não apagar** `spec/S1.1b`, `wip/S1.1b-rodada2` nem
   `wip/S1.1b-1b-naocommitado` — não estão mergeadas.
3. **Podar worktrees** órfãs, depois de confirmar `git status --porcelain`
   vazio em cada uma. O trabalho não commitado que existia em
   `Sistema de Pesquisa-s1.1b-1b` **já foi preservado** pelo Arquiteto na branch
   `wip/S1.1b-1b-naocommitado`; a worktree pode ir.
4. **PR #1** (`jules-...`, 11 deleções em `package-lock.json`): verificar se
   `npm ci` continua íntegro e então mergear ou fechar com motivo registrado.
5. **Rodar o gate completo em `2a6c16c`, em árvore limpa.** Ninguém rodou.
   Cinquenta e quatro arquivos entraram em `main` sem PR e sem revisão
   independente. Colar a saída real dos quatro comandos.
6. **`npm run format:check`**: consertar os ~25 arquivos legados, em **commit
   próprio**, tocando só formatação. Autorizado pelo fundador nesta data; é
   dívida nº 4 do `status.md` e hoje esconde sinal real.

**Fecha quando:** `main` passa `typecheck`, `lint`, `test`, `build` e
`format:check` numa árvore limpa, com a saída colada; a lista de branches e
worktrees está enxuta; o PR #1 tem destino.

### R1 — A execução live que destrava quatro fatias

O round que importa. Fecha S1.1b-1b-volume **e** S1.1b-1b-reliability juntas.

**Objetivo:** uma coleta live do eBay persiste ≥100 anúncios e a run termina
`completed` com contadores preenchidos.

Armadilha conhecida, registrada no log de 2026-08-25: a última tentativa tinha
orçamento efetivo **50**, abaixo do aceite ≥100, e o Engenheiro anterior encerrou
antes de criar run. **Diagnostique a causa antes de tocar em código** — pode ser
configuração (`.dev.vars`, `wrangler.toml`) e não cálculo. A linha
`HANDOFF-S1.1b-2-budget` do log afirma que o cálculo já foi corrigido; confirme
antes de "corrigir" de novo.

Ordem obrigatória: prove o caminho inteiro contra fixture e integração local
**antes** de gastar a primeira chamada real.

**Fecha quando**, consultando o banco diretamente:
`collection_runs.status = 'completed'`, `finished_at` não nulo,
`items_found >= 100`, `items_created > 0`, `error_code` nulo; e
`GET /api/projects/:id/listings` devolve o conjunto completo sem 414, com no
máximo 50 IDs por consulta; e três URLs reais conferidas. Nível de evidência no
log: **live**.

### R2 — Família de queries (S1.1b-2), live

Mais de uma query por execução; chamada de detalhe só para quem sobreviveu ao
filtro barato; o descartado vira triagem persistida.

**Otimização de quota, avalie antes de rodar:** se o caminho de família já for o
padrão do gateway, uma única execução pode satisfazer o aceite de R1 e de R2 ao
mesmo tempo. Se for o caso, desenhe uma execução só e registre as duas linhas de
log. Não force: se exigir gambiarra no código para caber, rode separado.

**Fecha quando:** a execução live mostra ≥2 queries, deduplicação entre elas,
detalhes só para sobreviventes, e previews rejeitados persistidos como triagem.

### R3 — Memória de preço (S1.2), live

Duas coletas live do mesmo projeto. A segunda pode ter orçamento pequeno
(~20 chamadas): ela só precisa reobservar anúncios que já existem.

**Fecha quando:** `price_history` tem duas observações por anúncio reobservado e
o número de snapshots é **menor** que o de observações — provando que hash
inalterado não duplica snapshot.

### R4 — Tela de execução (S1.3), live

Observe o painel **durante** a execução do R3. Não gasta chamada nova.

**Fecha quando:** a tela mostra, com dado de fonte real, o funil ao vivo: total
coletado, sobreviventes por camada, estado da fonte, motivos e posição de
chamadas. `estimated_cost = 0` continua sendo dívida conhecida e **não** bloqueia
o round — registre, não conserte.

### R5 — Round 2 do ROADMAP (S2.1, S2.2, S2.3) — BLOQUEADO

Não comece. Exige `GEMINI_API_KEY` e uma decisão de privacidade e quota que é do
fundador, não sua. Ao chegar aqui, **pare e peça** conforme §2.1 gatilho 1 e 2.

## 4. Disciplina de quota do eBay

Este é o recurso que sangra. O bootstrap do Arquiteto registra **600 a 900
chamadas Browse queimadas num único dia** por execuções que falharam e fizeram
retry regastando o orçamento inteiro.

- **Teto do módulo: 6 execuções live no total**, somando todos os rounds.
- **Máximo 2 tentativas live por round.** Falhou duas → pare e escale.
- Antes de cada tentativa live, o caminho já passou em fixture e integração
  local. Nenhuma execução real serve para "ver o que acontece".
- Orçamento por run com folga, não com heroísmo: para ≥100 anúncios pelo caminho
  de família, ~100 detalhes mais até 3 buscas. Não repita o `maxRequests=210` que
  queimou a quota em agosto.

## 5. Fora de escopo — não comece, não prepare terreno, não refatore em direção a

O fundador descreveu uma visão ampla em 2026-08-29. Quase tudo dela já está no
ROADMAP, em rounds futuros. **Nada disso entra neste módulo:**

- Proxy e rotação de IP — decisão explícita do fundador: não agora.
- Vertical de veículos e de imóveis — proibidas hoje pelo [AGENTS.md §8](../../AGENTS.md); veículos segue pendente de decisão.
- MCP público ou API para terceiros — congelado no ROADMAP.
- Produto de dados / venda de inteligência de mercado — não decidido, sem ADR.
- Adoção de Scrapling, browser-use ou Apify — exige ADR e é escopo S5/S6.
- Dívidas de schema: enum de categoria em `researchCriteriaSchema` e `price`
  obrigatório em `rawListingPreviewSchema` — ambas são S5.
- Limpeza das tabelas órfãs F4–F7 e da constraint de `user_listing_actions` (S3.5).
- Qualquer item de S5 em diante.

Se você achar que a ordem está errada, **diga no relatório — não contorne**
([AGENTS.md §2](../../AGENTS.md)).

## 6. Relatório final ao Arquiteto

Ao fechar o módulo, ou ao parar por um gatilho da §2.1:

- rounds fechados, com o commit de cada um e o CI verde correspondente;
- para cada round, a **evidência real** e seu nível (fixture / integração local
  / live) — consulta ao banco, saída de rota, o que apareceu na tela;
- quantas execuções live foram gastas, de quantas disponíveis;
- o que ficou fora e por quê;
- riscos abertos;
- `### Onde isto pode dar errado`.

## 7. Onde isto pode dar errado

- **Autonomia longa sem revisão por PR é exatamente o que produziu `2a6c16c`.**
  A defesa aqui é que o critério de saída de cada round é execução observada, não
  teste. Se o Engenheiro tratar teste verde como fechamento, o módulo reproduz o
  problema que veio corrigir — em escala maior, porque ninguém está olhando.
- **O teto de 6 execuções live pode ser apertado demais.** Se o R1 consumir 2 e
  falhar, sobram 4 para três rounds. É deliberado: quota queimada em agosto custou
  mais que atraso. Se for insuficiente, isso é gatilho de escalonamento, não
  autorização para estourar.
- **`.dev.vars` local tem valores agressivos** (`EBAY_GLOBAL_REQUESTS_PER_MINUTE=300`)
  que o bootstrap marca como impróprios para virar base de `wrangler secret`.
  Usar esse arquivo como fonte de verdade de produção repete um erro conhecido.
- **A limpeza do R0 pode apagar trabalho.** O caso já aconteceu (ADR 1.66). Por
  isso a poda exige `merge-base --is-ancestor` e `status --porcelain` vazio,
  verificados um a um — nunca uma lista decorada.
- **O `format:check` pode gerar um diff enorme** e afogar o sinal dos rounds
  seguintes. Por isso vai em commit próprio, só formatação, e nunca misturado a
  mudança de comportamento.
- **A otimização de juntar R1 e R2 numa execução pode contaminar as duas provas.**
  Se a execução conjunta falhar, não se saberá qual aceite quebrou. Diante de
  qualquer dúvida, rode separado e gaste a chamada.
