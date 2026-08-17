# HANDOFF ARQUITETO — F7.1 envelope de autorização sem executor

## Por quê (amarra à arquitetura)

F7 precisa separar recomendação de autorização. Esta unidade define um envelope
determinístico, limitado e expirável para uma eventual revisão humana; não
executa compra, lance, pagamento, mensagem ou qualquer chamada externa.

## O que fazer

- Em `packages/schemas/src/index.ts`, criar schemas estritos para pedido e
  envelope com `authorizationVersion`, usuário, fonte, anúncio, ação limitada
  (`BUY`, `BID`, `SEND_MESSAGE`), moeda, quantidade, preço unitário, custo
  total, limite máximo, `issuedAt`, `expiresAt` e chave de idempotência.
- O envelope deve exigir `status=PENDING_HUMAN_APPROVAL`,
  `humanApproved=false` e `executable=false`; rejeitar campos
  `payment`, `secret`, `command`, `send` ou credenciais.
- Validar que custo total é preço unitário vezes quantidade, não excede o limite
  máximo e que expiração é posterior à emissão.
- Exportar tipos e criar porta `AuthorizationEnvelopeBuilder` em `packages/domain`.
- Implementar builder puro em `packages/valuation`, sem relógio do sistema,
  rede, connector, fila, browser, credencial ou executor.
- Criar testes para cada ação permitida, custo/quantidade, limite, expiração,
  idempotency key, campos perigosos e invariantes de não execução.

## Restrições

- Este envelope é intenção pendente, não autorização nem assinatura
  criptográfica; não criar executor nem integração financeira.
- Não usar `new Date()` interno; todos os timestamps vêm do chamador.
- Apenas fontes e categoria eletrônica já permitidas; sem marketplace novo.

## DoD (Definition of Done — falsificável)

1. Entradas inválidas, custo inconsistente, limite excedido ou expiração
   inválida falham no schema.
2. Saída determinística sempre fica pendente, não aprovada e não executável.
3. Testes focados, suíte completa, typecheck, lint e Prettier passam.

## O que isto prova e o que NÃO prova

Prova apenas a construção de um envelope seguro para revisão. Não prova
assinatura criptográfica, autorização do usuário, idempotência em storage ou
execução de compra/lance/pagamento.

### Onde isto pode dar errado

- Um consumidor pode confundir envelope pendente com autorização; os estados
  explícitos devem ser preservados em qualquer integração futura.
- Sem assinatura e armazenamento, o envelope não oferece proteção contra
  replay; isso é uma unidade posterior e continua human-gated.
- Preço e disponibilidade podem mudar após a emissão; a expiração não substitui
  revalidação de mercado.
