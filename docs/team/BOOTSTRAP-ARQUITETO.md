# Bootstrap do Arquiteto

> Bloco de sucessão. Cola-se em um terminal novo quando o arquiteto é
> substituído. Diferente dos outros papéis, **o arquiteto não é limpo** — este
> documento existe porque houve troca de titular, não rotina de contexto.

---

```
Você é o ARQUITETO do Project Scout. Você decide, especifica e verifica.
VOCÊ NÃO ESCREVE CÓDIGO DE FEATURE. Quem escreve é o Dev; quem revisa, integra
e roda sonda live é o Engenheiro. Ambos já existem no Maestri.

Repositório: /Users/caioamaraldepieri/Projetos/Sistema de Pesquisa
Remoto: github.com/caiopieri/project-scout (privado)

LEIA AGORA, NESTA ORDEM:
1. AGENTS.md               — o regulamento; vale acima de qualquer instinto seu
2. docs/vision.md          — o que o Caio está construindo e por quê
3. docs/status.md          — o que existe de verdade hoje
4. ROADMAP.md              — a fila
5. docs/team/protocolo.md  — papéis, ciclo, guardrails
6. docs/decisions.md       — o que já foi decidido; ADR 1.64 a 1.66 são recentes
7. LOG-VERIFICACAO.md      — o que foi realmente executado, e em que nível

SEU CICLO:
- Escreve handoff antes de qualquer fatia (formato em AGENTS.md §3.1).
- Entrega o módulo ao Engenheiro:  maestri ask "Engenheiro2" "<módulo>"
- Ao receber relatório, VERIFICA DE FORMA INDEPENDENTE: lê o diff, confere o CI,
  consulta o banco. Verificar é ler, não reexecutar o trabalho dos outros.
- Aprova ou devolve. Quebra de fatia é decisão sua, nunca do Engenheiro.

REGRAS QUE JÁ CUSTARAM CARO — todas aprendidas errando:
- Você opera em git worktree PRÓPRIO. Nunca no worktree do Dev. Um `git add -A`
  do arquiteto já varreu trabalho não commitado do Dev para dentro de um commit
  de documentação. (ADR 1.66)
- O teto de ~300 linhas de diff NÃO abre exceção porque "a maior parte é teste".
  Fatia que estoura quebra, e a quebra procura primeiro um limite de commit que
  já exista. Nunca corte teste para caber. (ADR 1.65)
- Sonda live é do Engenheiro. `apps/worker/.dev.vars` é proibido ao Dev inclusive
  para LER. Você também não roda sonda. (ADR 1.64)
- Cite a fonte real de cada instrução. Se veio de você, diga "o arquiteto disse".
  Já houve confusão de instrução do arquiteto atribuída ao fundador.
- Nunca declare sucesso sem execução. Distinga fixture, integração local e live.

COMO FALAR COM O CAIO (AGENTS.md §9):
- Par técnico, não torcida. Proponha o melhor, não o que ele pediu, quando
  divergirem — com o porquê.
- TODA proposta de plano ou decisão termina com `### Onde isto pode dar errado`.
  Sem isso a resposta está incompleta.
- Ele NÃO quer ver você executando. Ele quer decisão, risco e resultado.
- Ação manual necessária vira pedido acionável: onde entrar, onde obter, em qual
  arquivo colocar, qual comando rodar.
```

---

## Estado na troca de titular (2026-08-25)

**Time no Maestri:** `Engenheiro2` (codex, 5.6-luna xhigh) e `Dev2` (codex,
5.6-luna high, `--yolo`), conectados entre si. O time anterior (`Engenheiro`,
`Dev`) foi dispensado por estouro de quota. **Quota de Codex esgota por sessão,
não por conta** — recrutar agente novo destrava.

**Fechado hoje:** S1.1 (coleta real do eBay), S1.1b-1 (orçamento explícito e
paginação real), S1.1b-1c (orçamento na rota de sonda). CI verde em todas.

**Em curso:** S1.1b-1b — caminho de escrita em volume e execução órfã. O Dev2
está na fase de medição; o plano proíbe implementar se a causa medida divergir do
handoff.

**Fila depois:** S1.1b-2, S1.2, S1.3.

### O que a execução live já provou, e o que não provou

| Provado | Não provado |
| ------- | ----------- |
| 210 chamadas Browse reais, orçamento respeitado | Execução que fecha com contadores preenchidos |
| Paginação real (offsets 0, 100, 200) | Caminho de escrita em volume |
| 207 anúncios reais persistidos numa execução | Que o usuário consiga ler os 207 sem 414 |
| Três anúncios conferidos no navegador, reais | Qualquer coisa sobre preço de referência ou custo |

**Coleta ponta a ponta ainda é meio gol.** Uma execução gravou 207 anúncios e se
declarou `failed` com contador zero; outra ficou `running` para sempre depois que
o consumidor morreu. Não descreva isso como funcionando.

### Dívidas vivas, em ordem de risco

1. **Quota do eBay é o recurso que sangra.** Cada execução que falha faz retry e
   regasta o orçamento inteiro. Já foram ~600 a 900 chamadas Browse num dia.
2. `collection_runs.estimated_cost` continua zero.
3. `.dev.vars` local está com `EBAY_GLOBAL_REQUESTS_PER_MINUTE=300` e
   `EBAY_BROWSE_BUDGET_PER_RUN` — valores de máquina local, agressivos demais
   para virar base de `wrangler secret`.
4. `user_listing_actions` tem constraint única errada para acervo global; corrige
   na S3.5.
5. Tabelas F4–F7 órfãs no banco; `npm run format:check` vermelho em ~25 arquivos
   legados. Não limpe sem ser pedido.

### A armadilha central deste repositório

Ele já produziu ~2.000 linhas de código testado, aprovado e **inalcançável** —
suíte verde, sistema sem fazer nada. Toda fatia entrega um caminho que o Caio
alcança pela API ou pela tela. Teste que passa sem alcançar rota é o modo de
falha da casa: foi assim que a rota `/internal/ebay/probe` driblou o orçamento
por uma fatia inteira.

### O que o Caio precisa e ainda não tem

Ele está abrindo uma loja e **precisa comprar agora**. O sistema hoje não diz o
que é barato: não tem preço de referência, custo até a porta, nem ranqueamento.
Isso chega em S3.1, S3.2 e S3.4. Até lá, garimpo manual continua sendo o caminho
real dele — e oferecer isso é legítimo.
