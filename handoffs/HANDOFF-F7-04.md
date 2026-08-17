# HANDOFF ARQUITETO — F7.4 vínculo de sessão local

## Por quê (amarra à arquitetura)

Mesmo com envelope e ledger, uma intenção não deve ser reaproveitada em outra
identidade/sessão local. Esta unidade cria uma barreira de vínculo com IDs
opacos fornecidos pelo chamador, sem fingir validar Supabase Auth e sem
executar qualquer ação.

## O que fazer

- Em `packages/schemas/src/index.ts`, adicionar schemas estritos para vínculo
  (`authorizationId`, `userId`, `sessionId`, `boundAt`, `expiresAt`) e entrada
  do gate com envelope, vínculo, usuário/sessão atuais e `now`.
- Validar que vínculo corresponde ao envelope, expiração é posterior ao vínculo
  e IDs são UUID; não aceitar token, secret, cookie ou credencial.
- Criar resultado com decisão `SESSION_MATCH`, `SESSION_MISMATCH` ou
  `SESSION_EXPIRED`, sempre `requiresHumanApproval=true` e `executable=false`.
- Exportar porta `AuthorizationSessionGate` e implementar checker puro em
  `packages/valuation` com prioridade usuário/sessão divergente, depois
  expiração, depois match.
- Testar match, usuário divergente, sessão divergente, expiração, vínculo
  divergente e campos `token/secret/command/payment`.

## Restrições

- IDs são referências opacas, não tokens; nunca persistir ou imprimir segredo.
- Sem chamada a Supabase Auth, browser, rede, fila, connector ou executor.
- Não alterar o estado do ledger nem criar ação financeira.

## DoD (Definition of Done — falsificável)

1. Match só ocorre quando envelope, vínculo, usuário, sessão e janela batem.
2. Mismatch/expiração falham fechado e nunca tornam envelope executável.
3. Testes focados, suíte completa, typecheck, lint e Prettier passam.

## O que isto prova e o que NÃO prova

Prova a comparação determinística de IDs opacos e janela de vínculo. Não prova
que o ID atual veio de uma sessão autenticada, nem que compra, lance,
pagamento ou mensagem são autorizados.

### Onde isto pode dar errado

- Um chamador pode fornecer IDs falsos; a fronteira de autenticação real ainda
  precisa validar a sessão.
- Sessões revogadas não são descobertas por este checker puro.
- `SESSION_MATCH` continua insuficiente para execução: aprovação humana,
  revalidação, lock e política financeira permanecem obrigatórios.
