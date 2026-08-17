# Protocolo do time

> Time enxuto de três papéis rodando em terminais separados no Maestri.
> Objetivo duplo: **qualidade verificada** e **contexto barato**.

---

## 1. Papéis

| Papel          | Quem                                    | Contexto                | Autoridade                                      |
| -------------- | --------------------------------------- | ----------------------- | ----------------------------------------------- |
| **Arquiteto**  | Claude Code · Opus 5 (maestro)          | **nunca limpo**         | Define módulos, verifica entrega, aprova avanço |
| **Engenheiro** | Codex · gpt-5.6-luna **xhigh**          | limpo **a cada módulo** | Planeja cada spec, revisa o dev, faz merge      |
| **Dev**        | Codex · gpt-5.6-luna **high**, `--yolo` | limpo **a cada spec**   | Escreve código na branch da spec                |

**Módulo** = um Round do [ROADMAP](../../ROADMAP.md) (ex.: Round 1).
**Spec** = uma fatia numerada (ex.: S1.1), com handoff próprio.

Comandos de recrutamento em uso:

```bash
maestri recruit "Engenheiro" --preset "Codex" \
  --command 'codex --yolo -c model_reasoning_effort="xhigh"' --dir <repo>
maestri recruit "Dev" --preset "Codex" --command 'codex --yolo' --dir <repo>
```

O engenheiro roda em esforço maior porque o trabalho dele é julgamento: planejar
a spec e reprovar diff ruim. O dev roda em esforço padrão porque executa um plano
já fechado.

---

## 2. O ciclo

```
ARQUITETO
  │  entrega o módulo: lista de specs + handoffs + critério de aceite
  ▼
ENGENHEIRO ──────────────── para cada spec, em ordem ────────────────┐
  │  1. lê o handoff e o estado atual                                │
  │  2. escreve o PLANO DE EXECUÇÃO (arquivos, contrato, aceite)     │
  │  3. envia ao dev                                                 │
  ▼                                                                  │
DEV                                                                  │
  │  4. cria branch spec/<ID>, implementa, roda o gate, auto-revisa  │
  │  5. reporta ao engenheiro: diff, gate, o que ficou de fora       │
  ▼                                                                  │
ENGENHEIRO                                                           │
  │  6. lê o DIFF (não a prosa), roda o gate ELE MESMO               │
  │  7. reprovado → correção ao MESMO dev, SEM limpar contexto ──────┘
  │     aprovado  → merge em main, push, CI verde
  │                 → /clear no dev + bootstrap + próxima spec
  ▼
(fim do módulo) reporta ao ARQUITETO: resumo, evidências, riscos abertos
  ▼
ARQUITETO
  │  verifica de forma independente: lê diff, roda gate, faz sonda
  │  aprovado → /clear no engenheiro + bootstrap + próximo módulo
  │  reprovado → devolve com o que corrigir
```

---

## 3. Higiene de contexto

A regra que economiza token sem perder qualidade:

| Quando                         | Quem limpa | O que injeta depois                                                                  |
| ------------------------------ | ---------- | ------------------------------------------------------------------------------------ |
| Spec aprovada e mergeada       | Dev        | [BOOTSTRAP-DEV](./BOOTSTRAP-DEV.md) + plano da próxima spec                          |
| Módulo aprovado pelo arquiteto | Engenheiro | [BOOTSTRAP-ENGENHEIRO](./BOOTSTRAP-ENGENHEIRO.md) + lista de specs do próximo módulo |
| Nunca                          | Arquiteto  | —                                                                                    |

**Nunca limpar no meio de uma spec.** Correção de revisão vai para a mesma
sessão do dev: ele precisa lembrar do que acabou de escrever.

O bootstrap **não é prosa colada** — é uma lista de arquivos para ler. Os
documentos do repositório são a memória compartilhada; texto colado envelhece e
custa token toda vez.

---

## 4. Guardrails do `--yolo`

O dev roda sem confirmação de comando. Git é a rede de segurança, e as regras
abaixo não são sugestões:

- **Uma branch por spec** (`spec/S1.1`). O dev nunca faz commit em `main`.
- **O dev pode adicionar teste. Não pode apagar nem enfraquecer teste existente.**
  Diante de teste vermelho, corrigir o código — nunca o teste.
- **Proibido ao dev tocar**: migrations já aplicadas, RLS, autenticação,
  verificação de assinatura, segredos e `.dev.vars`, `.github/workflows`,
  `docs/**` (documentação é do arquiteto), e qualquer coisa fora do escopo
  declarado no plano.
- **`package-lock.json`** só muda se o plano disser explicitamente.
- **O engenheiro nunca confia no gate auto-reportado.** Roda `npm run typecheck`,
  `npm run lint`, `npm test` e `npm run build` ele mesmo, em estado limpo, antes
  de aprovar.
- **CI é o gate final.** Merge sem CI verde não conta como spec fechada.

---

## 5. Paralelismo

Capacidade disponível, mas **não usar no Round 1**: S1.1 → S1.2 → S1.3 são
sequenciais, e quase tudo passa por `apps/worker/src/index.ts`. Dois devs ali
produzem conflito, não velocidade.

Regra para escalar: **dois devs só quando os conjuntos de arquivos forem
disjuntos**. Cada um na sua branch; o engenheiro faz merge em ordem e roda o
gate completo depois de cada merge — não depois dos dois.

Exemplos de paralelismo legítimo, mais adiante:

- Round 3: `S3.1` (custo, em `packages/valuation`) ‖ `S3.4` (feed, em `apps/web`)
- Um segundo engenheiro só se houver dois módulos independentes ao mesmo tempo.

---

## 6. Escalonamento

- Dev travado **duas vezes na mesma spec** → o engenheiro para de iterar e
  escala ao arquiteto. Loop de correção não conserta problema de projeto.
- Spec que revela contradição no handoff → o engenheiro **não decide sozinho**:
  devolve ao arquiteto. Handoff errado é problema de arquitetura.
- Dependência externa (credencial, decisão do fundador) → spec marcada como
  bloqueada, próxima spec **independente** assume, e o arquiteto é avisado.

---

## 7. Registro obrigatório

Ao fechar cada spec, o engenheiro garante que existe:

- commit na `main` com mensagem descritiva;
- CI verde no commit;
- linha em [LOG-VERIFICACAO.md](../../LOG-VERIFICACAO.md) com **nível de
  evidência** (`fixture` / `integração local` / `live`);
- [docs/status.md](../status.md) atualizado se a capacidade do sistema mudou.

O arquiteto só aprova o módulo com esses quatro itens presentes.

---

## 8. Onde isto pode dar errado

- **`--yolo` roda comando sem pedir.** A rede de segurança é git + branch + CI,
  não a boa vontade do agente. Trabalhar sempre com a árvore limpa antes de
  soltar o dev.
- **Limpar contexto perde aprendizado tácito.** O dev esquece a armadilha que
  encontrou na spec anterior. Se a armadilha for relevante, ela vira linha de
  documento — não memória de sessão.
- **O engenheiro vira gargalo.** Ele planeja, revisa e faz merge; com dois devs,
  o tempo dele é o teto do time.
- **Revisar prosa em vez de diff é o modo de falha clássico.** Agente descreve
  bem o que não fez. Diff e gate executado, sempre.
