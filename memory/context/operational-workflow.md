# Fluxo operacional de testes e credenciais

## Regra do usuário

Caio quer que cada capacidade prometida seja testada pelo agente antes de ser
considerada funcionando. Se uma etapa depender dele, o agente deve interromper
no ponto correto e explicar objetivamente:

1. em qual portal ou tela Caio deve entrar;
2. qual credencial ou dado ele deve obter;
3. em qual arquivo ou variável server-side deve colocar o valor;
4. qual comando deve executar;
5. que o agente fará a verificação real depois.

Segredos nunca devem ser colados no chat, logs, documentação pública ou frontend.
O agente não deve usar fixture/mock para afirmar que uma integração live funciona.

## Estado conhecido em 2026-08-14

- eBay: credenciais já configuradas no ambiente local; modo production é opt-in.
- Mercado Livre: adapter oficial com access token e refresh OAuth; modo live exige
  `ML_CONNECTOR_MODE=production` e access token ou o trio
  `ML_CLIENT_ID`/`ML_CLIENT_SECRET`/`ML_REFRESH_TOKEN` em `apps/worker/.dev.vars`.
- Xianyu: indisponível por decisão explícita; não inventar endpoint nem bypass.
