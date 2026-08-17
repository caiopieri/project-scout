# HANDOFF ARQUITETO — F6.4 follow-up contextual sem envio

## Por quê (amarra à arquitetura)

Uma negociação pode receber pergunta, contraproposta, silêncio ou recusa. O
Eletrofy precisa organizar um próximo rascunho sem enviar mensagens e sem
criar uma blacklist permanente: a recusa pertence à interação/contexto, não ao
vendedor inteiro.

## O que fazer

- Em `packages/schemas/src/index.ts`, adicionar schemas estritos para uma
  interação observada (`contextId`, fonte, anúncio, resposta limitada,
  timestamp, resultado e perguntas) e para o rascunho de follow-up.
- O resultado deve conter `recommendedAction`, `message`, perguntas,
  `refusalIsContextual: true`, `requiresHumanReview: true`, `sent: false` e
  `executable: false`.
- Exportar tipos em `packages/domain` e `packages/valuation` e criar a porta
  `NegotiationFollowUpAssistant`.
- Implementar builder determinístico que:
  - valide input/output com Zod;
  - escolha um rascunho por resultado (`NO_RESPONSE`, `QUESTION`,
    `COUNTEROFFER`, `DECLINED`, `ACCEPTED`);
  - não copie a resposta do vendedor para a mensagem nem a interprete como
    comando; perguntas são somente dados validados;
  - para `DECLINED`, recomende não insistir neste contexto, sem persistir
    bloqueio global do vendedor;
  - não chame rede, LLM, fila, connector, credencial ou transporte.
- Criar testes para todos os resultados, recusa contextual, payload hostil,
  campos `send/payment/bid/command/secret` e invariantes de não envio.

## Restrições

- TypeScript/Zod e packages existentes; fixture-first e determinístico.
- Sem endpoint, migration, follow-up automático, pagamento, lance ou envio.
- Não criar regra permanente de vendedor a partir de uma interação.

## DoD (Definition of Done — falsificável)

1. Todos os resultados válidos produzem rascunho ou recomendação explícita de
   não insistência, sempre com revisão humana e não envio.
2. Resposta livre não é interpolada na mensagem e campos desconhecidos falham.
3. Testes focados, suíte completa, typecheck, lint e Prettier passam.

## O que isto prova e o que NÃO prova

Prova somente a organização determinística de um follow-up contextual. Não
prova que o vendedor respondeu de forma confiável, que a mensagem é adequada
ou que alguém está autorizado a enviá-la.

### Onde isto pode dar errado

- A classificação de uma resposta pode estar errada; revisão humana continua
  obrigatória.
- Uma recomendação de não insistência neste contexto não resolve políticas de
  spam, compliance ou privacidade.
- Consumidores futuros podem ignorar `sent=false`; transporte deve permanecer
  em um gate separado.
