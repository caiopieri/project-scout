# ESTADO / RECOMEÇO — Arquiteto · Codex

## 0. Identidade & lugar

- **Papel:** Arquiteto-Verificador
- **Terminal Maestri:** Codex · executor conectado: Codex #5
- **Repo:** `/Users/caioamaraldepieri/Projetos/Sistema de Pesquisa`
- **Data:** 2026-08-15

## 1. Meta

- **Objetivo:** concluir F0–F7 por unidades auditáveis, deixando credenciais,
  termos e habilitação live como pendências humanas.
- **Unidade atual:** revisão final local e preparação do gate eBay.

## 2. O que já foi feito

- F0–F5 implementados localmente; F6.1–F6.4 e F7.1–F7.4 concluídos; último baseline: 276 testes gerais e 71 de
  banco passando.
- Especificação F4 criada em `docs/specs/f4-self-healing.md`.
- Handoff F4.1 aprovado e registrado em `LOG-VERIFICACAO.md`.
- Handoff F4.2 aprovado e registrado em `LOG-VERIFICACAO.md`.
- Handoff F4.3 aprovado e registrado em `LOG-VERIFICACAO.md`.
- Handoff F4.4 aprovado e registrado em `LOG-VERIFICACAO.md`.
- Runner sandbox validado por sonda independente; callback malformado falha
  fechado e não expõe sua mensagem.
- Handoff F4.5 aprovado e registrado em `LOG-VERIFICACAO.md`; runs sandbox
  persistidos com RLS e acesso `service_role`-only.
- Handoff F5.1 aprovado e registrado em `LOG-VERIFICACAO.md`; engine de lote
  eletrônico é determinístico e não executa lance/compra.
- Handoff F5.2 aprovado e registrado em `LOG-VERIFICACAO.md`; documentos locais
  são versionados, hash-validados e conflitos ficam explícitos.
- Handoff F5.3 aprovado e registrado em `LOG-VERIFICACAO.md`; monitoramento por
  fixtures é determinístico e não dispara ação externa.
- Handoff F6.1 aprovado e registrado em `LOG-VERIFICACAO.md`; contexto e rascunho
  de negociação são determinísticos, limitados e nunca enviados/executáveis.
- Handoff F6.2 aprovado e registrado em `LOG-VERIFICACAO.md`; snapshots de
  contexto/rascunho têm auditoria owner-scoped com RLS e escrita service-role-only.
- Handoff F6.3 aprovado e registrado em `LOG-VERIFICACAO.md`; contextos
  expirados/futuros falham fechado sem consulta live ou relógio implícito.
- Handoff F6.4 aprovado e registrado em `LOG-VERIFICACAO.md`; follow-up é
  contextual, manual e não executável, sem blacklist global de vendedor.
- Handoff F7.1 aprovado e registrado em `LOG-VERIFICACAO.md`; envelope de
  autorização é pendente, limitado e não executável.
- Handoff F7.2 aprovado e registrado em `LOG-VERIFICACAO.md`; expiração/replay
  falham fechado e nunca liberam execução.
- Handoff F7.3 aprovado e registrado em `LOG-VERIFICACAO.md`; ledger RLS
  owner-scoped mantém idempotência e consumo interno sem executor.
- Handoff F7.4 aprovado e registrado em `LOG-VERIFICACAO.md`; vínculo de sessão
  opaca falha fechado para usuário/sessão divergente ou expirada.
- Migration `collector_repair_proposals` aplicada e validada no Supabase local.

## 3. O que não deu

- `get-role` exigiu `MAESTRI_TERMINAL_NAME`; corrigido usando o terminal Codex.
- Não há `.git` no workspace; não inventar commits.

## 4. Próximos passos

1. Revisão final: contratos F4–F7 estão verificados localmente; manter executor
   live, compra, lance, pagamento, envio, assinatura e credenciais como gates
   humanos explícitos.
2. Preparar eBay como única fonte live prioritária; Mercado Livre está suspenso
   e a integração Eletrofy fica fora do trabalho atual.
3. Ler diff inteiro, rodar testes e sonda independente a cada handoff.
4. Manter credenciais, termos e qualquer envio live como gates humanos.

## 5. Pendências humanas

- Credenciais, termos e habilitação de tráfego live de marketplaces.
- Aprovação de qualquer executor de reparo fora do sandbox.

### Onde isto pode dar errado

- O baseline anterior não prova as fases F4–F7; cada handoff precisa de teste e
  revisão própria.
