# HANDOFF ARQUITETO — F5.2 evidências e versões de documentos

## Por quê

Um dossiê de lote só é auditável se o sistema separar declaração, evidência,
versão e incerteza. Esta unidade organiza documentos já fornecidos pelo usuário
ou por fixture local; não faz download, OCR, scraping ou interpretação jurídica.

## O que fazer

- Em `packages/schemas`, criar contratos estritos para documento de lote:
  `documentId`, `lotExternalId`, tipo (`EDITAL`, `MANIFEST`, `CONDITION_REPORT`,
  `TERMS`), versão, hash SHA-256, conteúdo limitado opcional, data de
  observação, claims e origem.
- Criar contrato de claim com `key`, `value`, `sourceReference`, status
  (`CONFIRMED`, `UNKNOWN`, `CONTRADICTED`) e severidade.
- Em `packages/domain`, adicionar porta `AuctionEvidenceNormalizer`.
- Em `packages/valuation`, implementar normalizador puro que:
  - valida todos os documentos/claims com Zod;
  - rejeita hash inválido, conteúdo acima do limite, documentos de outros lotes
    e campos `shell`, `command`, `secret`, `payment` ou `bid`;
  - ordena versões de forma determinística;
  - detecta claims conflitantes por `key` sem escolher silenciosamente uma
    verdade;
  - retorna completude, flags de incerteza e claims contraditórios.
- Testar versões, hash, conflito, lote errado, limite de conteúdo e rejeição de
  campos de ação.

## Restrições

- Sem rede, connector, PDF/OCR, browser, proxy, CAPTCHA, LLM ou consulta legal.
- Não interpretar termos jurídicos como autorização; apenas registrar o texto e
  sua origem para revisão humana.
- Não criar bid, compra, pagamento, endpoint, fila ou F6/F7.
- Diff aproximado de 300 linhas; preservar F0–F5.1.

## DoD

1. Documentos e claims são schemas estritos, versionados e hash-validados.
2. Conflitos ficam explícitos e reduzem completude; não há escolha silenciosa.
3. Testes, suíte completa, typecheck, lint e Prettier passam.

## O que isto prova e o que NÃO prova

Prova apenas organização determinística de evidência fornecida localmente. Não
prova autenticidade do documento, validade jurídica, estado atual do leilão ou
qualquer autorização de ação.

### Onde isto pode dar errado

- Um hash confirma integridade do conteúdo recebido, não autenticidade da fonte.
- Claims contraditórios podem refletir versões legítimas; revisão humana segue
  necessária.
- Conteúdo documental pode conter prompt injection; esta fatia não o envia a
  LLM e deve mantê-lo como dado não confiável.
