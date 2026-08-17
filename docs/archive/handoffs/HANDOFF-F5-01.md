# HANDOFF ARQUITETO — F5.1 dossiê de lote e custo total

## Por quê

O documento de mercado adiciona uma necessidade de produto: transformar um
lote/edital em um dossiê comparável, com custo total, incertezas e evidências.
Esta primeira fatia é somente leitura e determinística; não consulta leilão,
não monitora tráfego live e não cria capacidade de lance ou compra.

## O que fazer

- Em `packages/schemas`, criar schemas Zod estritos para:
  - lote eletrônico: identificador externo, fonte, título, quantidade, preço
    pedido em minor units, moeda, localização, condição conhecida/desconhecida
    e evidências textuais versionadas;
  - política de custo: frete, taxas, imposto, processamento, reserva de reparo
    e margem mínima, todos não negativos;
  - dossiê calculado: custo total, custo unitário, receita estimada, preço
    máximo recomendado, margem estimada, risco (`LOW`/`MEDIUM`/`HIGH`), flags
    de incerteza e recomendação (`REVIEW`/`SHORTLIST`/`AVOID`).
- Em `packages/domain`, adicionar a porta de avaliação de lote.
- Em `packages/valuation`, implementar engine puro e determinístico:
  - validar input externo com Zod;
  - calcular custo total e preço máximo sem arredondamento inseguro;
  - nunca recomendar `SHORTLIST` sem evidência de preço de mercado e condição;
  - elevar risco quando faltarem quantidade, condição, frete ou evidências;
  - gerar explicação baseada em códigos/flags, sem LLM e sem texto executável.
- Adicionar testes focados para happy path, moeda/minor units, quantidade,
  custos ausentes, lote sem evidência, preço pedido acima do limite e rejeição
  de campos `shell`, `command`, `secret`, `bid`, `payment` ou desconhecidos.
- Atualizar roadmap/security somente após os gates passarem.

## Restrições

- Não criar connector de leilão, scraper, PDF/OCR, proxy, CAPTCHA ou chamada de
  rede nesta unidade.
- Não modelar veículos, imóveis ou outros domínios; somente eletrônicos.
- Não criar bid limit executável: o preço máximo é recomendação informativa,
  nunca envio de lance ou compra.
- Não usar LLM, alterar F0–F4, criar endpoint browser, fila, pagamento ou ação
  vinculante. Manter o diff em ~300 linhas.

## DoD

1. Engine de lote é puro, validado e determinístico.
2. Custos, margem e risco ficam auditáveis por flags/evidências.
3. Dados incompletos não viram oportunidade de alta confiança.
4. Testes, typecheck, lint e Prettier passam.

## O que isto prova e o que NÃO prova

Prova apenas a avaliação local de um lote eletrônico já fornecido ao sistema.
Não prova preço de mercado atual, validade jurídica de edital, logística real,
funcionamento dos itens, monitoramento live ou permissão para comprar/lance.

### Onde isto pode dar errado

- Um cálculo determinístico pode parecer preciso mesmo com evidência ruim; flags
  de incerteza devem permanecer visíveis.
- Impostos e regras logísticas mudam por jurisdição e não devem ser codificados
  como verdade legal sem fonte e revisão humana.
- O preço máximo recomendado pode ser confundido com autorização de lance se a
  UI futura não separar claramente recomendação de ação vinculante.
