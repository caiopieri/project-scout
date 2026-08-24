# HANDOFF-S1.1b-1c — Orçamento na rota de sonda manual

> Fatia criada para respeitar o teto de diff. É a segunda metade da S1.1b-1,
> separada no limite de commit que já existe — sem retrabalho.

## Por que esta fatia existe

A S1.1b-1 fez `EBAY_BROWSE_BUDGET_PER_RUN` virar configuração explícita e falhar
fechado na coleta. A revisão do engenheiro encontrou que
`apps/worker/src/ManualEbayProbe.ts` continua instanciando o adapter de produção
com `maxBrowseRequests: 6` literal, e essa rota é alcançável
(`apps/worker/src/index.ts`, rota `/internal/ebay/probe`). Ou seja: a coleta
respeita a configuração, a sonda manual dribla.

Isto **não é regressão** — é o estado que a `main` já tem hoje. É dívida que a
S1.1b-1 deixou explícita ao criar a regra que ela viola.

## Pronto quando

1. A rota `/internal/ebay/probe` lê e valida `EBAY_BROWSE_BUDGET_PER_RUN` com o
   mesmo critério do resto (inteiro seguro, mínimo 1). **Sem literal de
   fallback.**
2. Variável ausente → a rota recusa, sem chamada externa nenhuma.
3. Valor válido → a rota funciona e o orçamento observado é o configurado.
4. O teste exercita a **rota**, via `worker.fetch`, nos dois casos. Teste de
   construtor não conta: ele não prova o caminho HTTP alcançável, que é
   exatamente onde o bypass mora.
5. Nenhuma credencial real envolvida no teste.

Evidência exigida: **integração local** — o teste de rota basta. A prova live
desta fatia já está coberta pela sonda da S1.1b-1.

## Contrato

- Arquivos: `apps/worker/src/ManualEbayProbe.ts`, o wiring da rota em
  `apps/worker/src/index.ts`, e `tests/milestone5-worker-wiring.test.ts`.
- Nada além destes três.
- Nenhuma migration, nenhum schema, nenhuma mudança na coleta.

## Caminho de usuário

A rota interna de sonda deixa de ser o buraco por onde o orçamento não vale.

## Fora de escopo

- Qualquer coisa da coleta normal (já entregue na S1.1b-1).
- Caminho de escrita em volume → S1.1b-1b.
- Ler, carregar ou executar `apps/worker/.dev.vars` — proibido ao dev, sempre.

## Onde isto pode dar errado

- **Cobrir só o construtor devolve o bypass sem cobertura.** É o modo de falha
  histórico deste repositório: teste que passa sem alcançar rota.
- **Recusar a rota sem orçamento pode quebrar operação futura.** Se algum dia a
  sonda manual for usada em incidente, ela vai exigir a variável configurada.
  Isso é o comportamento desejado — falha fecha — mas precisa estar escrito onde
  quem opera vá ler.
