# eBay Marketplace Account Deletion

O Scout persiste dados do eBay e **não pode** solicitar a isenção “Not persisting eBay data”.
Produção exige o endpoint público abaixo antes da primeira chamada real:

```text
GET|POST /webhooks/ebay/account-deletion
```

## Fluxo implementado

1. GET valida configuração e devolve `challengeResponse = SHA256(challenge + token + URL)`.
2. POST limita o corpo a 64 KiB, valida o payload e exige `x-ebay-signature`.
3. O adapter obtém a chave pública pela Notification API, mantém cache em memória por uma hora
   e verifica a assinatura ECDSA/SHA-1 com o nome de digest padrão aceito pelo runtime.
4. Somente uma assinatura válida é publicada na `EBAY_DELETION_QUEUE`; falha de publicação
   retorna `503`, permitindo reentrega.
5. O consumer registra auditoria mínima, localiza o vendedor, remove JSON/imagens do R2 e então
   apaga anúncios, históricos, relações e vendedor no PostgreSQL.
6. Reentregas usam `notificationId`; uma exclusão concluída apenas confirma a tarefa.

Os identificadores `username`, `userId` e `eiasToken` existem apenas no payload validado e na
mensagem transitória da fila. A tabela de auditoria não os armazena. JSON bruto usa prefixo
HMAC-SHA-256 por vendedor, permitindo remover também objetos órfãos sem tornar usernames
adivinháveis no nome do objeto.

## Configuração

Secrets obrigatórios no Worker:

```bash
npx wrangler secret put EBAY_DELETION_VERIFICATION_TOKEN --cwd apps/worker
npx wrangler secret put EBAY_ACCOUNT_DELETION_ENDPOINT_URL --cwd apps/worker
npx wrangler secret put EBAY_APP_ID_CLIENT_ID --cwd apps/worker
npx wrangler secret put EBAY_CERT_ID_CLIENT_SECRET --cwd apps/worker
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY --cwd apps/worker
npx wrangler secret put EBAY_IDENTITY_HASH_SECRET --cwd apps/worker
```

For the isolated remote environment, append `--env production` to every command. Never apply
`supabase/seed.sql` remotely; the canonical eBay source is provisioned by migration while fixture
users, projects and listings remain local-only.

`EBAY_NOTIFICATION_ENVIRONMENT=production` permanece variável não secreta. O token deve possuir
32–80 caracteres de `[A-Za-z0-9_-]`. A URL informada no secret deve ser byte a byte a mesma URL
cadastrada no portal, sem query, fragmento ou barra adicional.
`EBAY_IDENTITY_HASH_SECRET` é uma chave separada, estável e com pelo menos 32 caracteres; sua
rotação exige migrar ou preservar os prefixos antigos até eliminar todos os objetos associados.

## Ativação no portal

1. Fazer deploy HTTPS e confirmar que PostgreSQL, R2 e Queue remotos estão configurados.
2. Em Application Keys → Notifications, selecionar Marketplace Account Deletion.
3. Informar e-mail, URL e o mesmo verification token do Worker.
4. Salvar e confirmar o GET de challenge.
5. Executar Send Test Notification e confirmar POST `204` e auditoria `completed`.
6. Só então executar `npm run ebay:smoke` em modo Production.

Nunca registrar payload, assinatura, identificadores, tokens ou respostas brutas. Retenção legal,
backups e política de privacidade ainda precisam de validação responsável antes do lançamento.

## Estado remoto em 29 de julho de 2026

- Worker: `https://project-scout-worker-production.caioamaralpieri.workers.dev`.
- O GET challenge e a entrega POST assinada foram validados de ponta a ponta; `/health` responde 200.
- `/api/*` está deliberadamente desativado em produção.
- Supabase remoto, filas, R2, KV e secrets do Worker estão provisionados.
- O portal aceitou e-mail, URL e token. O teste assinou e publicou as notificações; 50 auditorias
  terminaram `completed`, nenhuma ficou `pending`, e 53 tentativas confirmaram reentrega idempotente.
- Production application OAuth/Browse também passou em smoke separado. A coleta remota continua
  em `mock` e a autenticação OAuth de usuário do eBay não foi habilitada nem é necessária ao Browse
  application-token usado neste MVP.
