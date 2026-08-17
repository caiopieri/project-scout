# HANDOFF ARQUITETO — F4.1 classificação de falhas de coletor

## Por quê (amarra à arquitetura)

F4 precisa distinguir falhas de parser, rede, autenticação, proxy, semântica e
fonte antes de propor qualquer reparo. Sem um contrato determinístico, um
mantenedor pode sugerir correções para a camada errada ou transformar uma falha
de credencial em retry infinito. Esta unidade apenas classifica e não executa
ações.

## O que fazer

- Criar em `packages/schemas/src/index.ts` schemas/types para:
  - `collectorFailureClass`: `parser`, `network`, `auth`, `proxy`, `semantic`,
    `source`.
  - entrada de falha com `source`, `provider`, `code`, `kind`, health state
    opcional e timestamp.
  - saída de classificação com classe, retry permitido, código estável e
    versão da regra.
- Criar em `packages/domain/src/index.ts` o port/tipo mínimo sem dependência de
  fornecedor.
- Criar em `packages/collection/src/FailureClassifier.ts` um classificador
  puro e determinístico que use `ConnectorError` e `CollectorHealthState`.
  Regras mínimas:
  - códigos de auth/login → `auth`, sem retry automático;
  - proxy/rate-limit → `proxy` ou `network`, retry limitado;
  - erro de normalização/parser → `parser`, sem retry;
  - health `CONTENT_CHANGED`/`MODAL_BLOCKING` → `semantic`;
  - códigos não reconhecidos → `source`, sem inventar causa raiz.
- Exportar o classificador pelo package de collection.
- Adicionar testes em `tests/f4-failure-classifier.test.ts` para caminho feliz,
  estados semânticos, código desconhecido, limites e entrada inválida.

## Restrições

- Não adicionar migration, fila, LLM, patch executor, credencial ou chamada
  externa.
- Não mudar o comportamento existente do `CollectionTaskProcessor`; apenas
  adicionar contratos e função pura.
- Todo payload de entrada/saída deve passar por Zod.
- Não usar `any`; não logar mensagens externas completas ou secrets.
- Verificar `git status`; o workspace atual não possui repositório Git, então
  não inventar commit. Entregar lista precisa de arquivos e testes executados.
- Alterar somente arquivos desta unidade; se o diff passar de ~300 linhas,
  parar e relatar.

## DoD (Definition of Done — falsificável)

1. A mesma entrada produz exatamente a mesma saída versionada.
2. As seis classes têm testes e códigos desconhecidos caem em `source`.
3. Auth/login não agenda retry automático; rede/proxy/rate-limit respeitam o
   limite definido no contrato.
4. Entrada malformada é rejeitada pelo schema antes da classificação.
5. `npx vitest run tests/f4-failure-classifier.test.ts`, `npm run typecheck` e
   `npm run lint` passam.

## O que isto prova e o que NÃO prova

Prova que a taxonomia e a decisão de retry são determinísticas e validadas.
Não prova que a causa raiz de um marketplace real foi diagnosticada nem que um
reparo seguro existe; propostas e execução ficam para os próximos handoffs.

### Onde isto pode dar errado

- Uma regra baseada apenas em código pode ficar obsoleta quando o provedor
  alterar seus códigos.
- `source` é um fallback deliberado, não uma explicação causal.
- A unidade não deve tocar em produção nem gerar proposta executável.
