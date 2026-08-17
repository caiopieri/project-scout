# Plano aprovado

1. Contratos Zod para challenge, cabeçalho, notificação e tarefa de fila.
2. Verificador eBay no adapter oficial, reutilizando OAuth e cacheando chave pública por uma hora.
3. Handler Worker GET/POST com limite de corpo, falha fechada e publicação durável.
4. Migration incremental com auditoria mínima e RPCs exclusivos de `service_role`.
5. Consumer que prepara alvos, apaga `RAW_BUCKET`/`IMAGE_BUCKET` e finaliza o banco.
6. Testes de criptografia, endpoint, fila, migration, RLS/privilégios e idempotência.
7. Documentação, secrets e procedimento de deploy/teste no portal.

Esta implementação usa `node:crypto`, suportado pelo Worker com `nodejs_compat`, para manter o
mesmo formato ECDSA/OpenSSL usado pelo SDK oficial do eBay.

## Revisão humana

Aprovado pelo proprietário na conversa em 29/07/2026 após a revisão de conformidade e antes da
implementação. Nenhum Marco posterior foi autorizado por esta aprovação.
