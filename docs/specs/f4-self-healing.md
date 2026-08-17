# SPEC — F4 Self-healing collectors

## Objetivo

Adicionar manutenção assistida e reversível para coletores, preservando o
domínio, permissões e execução financeira fora do alcance do mantenedor.

## Fora de escopo

- Aplicar patch, alterar credenciais, permissões ou migrations automaticamente.
- Fazer scraping novo fora de `packages/collection`.
- Chamar LLM em produção nesta primeira implementação.
- Habilitar coleta live ou mudar os gates de F1.

## Requisitos

- R1 — Classificar falhas de coletor em parser, network, auth, proxy, semantic
  e source com contrato validado e resultado determinístico.
- R2 — Gerar propostas de reparo versionadas, limitadas ao connector, com
  fixtures, canary, orçamento e rollback explícitos.
- R3 — Persistir histórico de propostas e resultados de canary sem permitir
  escrita pelo navegador.
- R4 — Executar apenas propostas aprovadas pelo usuário/operador em sandbox,
  com replay, métricas e rollback verificáveis.

## Gates

- Gate F4.1: aprovar o contrato de classificação antes de propostas.
- Gate F4.2: aprovar limites de proposta/canary antes de qualquer executor.
- Gate F4.3: revisão de segurança antes de persistência e fila privilegiada.
- Ações humanas continuam pendentes para credenciais, termos dos marketplaces
  e habilitação de tráfego live.

## Critérios de aceite

- A mesma falha e health state produzem a mesma classe e retry policy.
- Dados externos malformados são rejeitados sem gerar proposta executável.
- Nenhum resultado da classificação muta connector, banco, secrets ou fila.
- Testes cobrem classes, estados semânticos, códigos desconhecidos e limites.

## Sequência de handoffs

1. `HANDOFF-F4-01` → R1: contrato e classificador determinístico.
2. `HANDOFF-F4-02` → R2: proposta versionada e validação de orçamento.
3. `HANDOFF-F4-03` → R3: persistência owner/service-role isolada.
4. `HANDOFF-F4-04` → R4: sandbox, replay, canary e rollback.

## Riscos / o que pode falhar na prática

- Classificar corretamente não significa que a causa raiz foi encontrada.
- Códigos de terceiros podem mudar sem aviso e cair em `source`/`semantic`.
- Canary local não prova segurança em tráfego real.
- O mantenedor pode sugerir uma correção insegura; aprovação humana e rollback
  continuam obrigatórios.

### Onde isto pode dar errado

- Um classificador excessivamente genérico pode mascarar falhas de autenticação
  como erro de rede.
- Health HTTP 200 ainda pode conter conteúdo incompleto; a classificação deve
  consumir health semântico, não status HTTP isolado.
