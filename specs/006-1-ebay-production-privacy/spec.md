# Marco 6.1 — eBay Production Privacy Gate

## Discovery

O Scout persiste anúncios, vendedores, snapshots e JSON bruto do eBay. Portanto, a isenção
"Not persisting eBay data" não se aplica. O keyset de produção depende de um endpoint público
para `MARKETPLACE_ACCOUNT_DELETION`.

## Especificação

- Expor `GET|POST /webhooks/ebay/account-deletion` sem autenticação Supabase.
- No GET, responder ao `challenge_code` com SHA-256 de
  `challengeCode + verificationToken + endpointUrl`.
- No POST, limitar e validar o JSON, verificar `x-ebay-signature` com a chave pública oficial e
  publicar uma tarefa durável antes de responder com sucesso.
- Processar tarefas com `service_role`, apagar objetos correlacionados no R2 e somente então
  remover vendedores/anúncios e relações no PostgreSQL.
- Tornar recebimento e processamento idempotentes por `notificationId`.
- Guardar apenas auditoria mínima; não persistir `username`, `userId` ou `eiasToken` na tabela.
- Manter Produção desabilitada até deploy, secrets, validação GET e notificação de teste reais.

## Fora do escopo

- Marco 7, análise textual, cobrança, MCP, compra automática ou outro marketplace.
- Alegar conectividade de Produção antes do teste real do portal.
- Política jurídica completa de retenção/backups; requer revisão responsável antes do lançamento.

## Critérios de aceite

- Challenge válido funciona e configuração inválida falha de forma fechada.
- POST inválido não entra na fila; assinatura inválida retorna `412`.
- Falha ao publicar retorna erro para permitir reentrega do eBay.
- Reentrega não duplica auditoria nem falha ao apagar objetos ausentes.
- `anon` e `authenticated` não acessam tabela nem RPCs de exclusão.
- Migration do zero, lint, typecheck, testes e build passam.
