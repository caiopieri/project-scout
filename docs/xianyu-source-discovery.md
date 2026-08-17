# Xianyu — Source Discovery F1

Status: **boundary fixture-first; live ingestion not enabled**  
Última revisão: **2026-08-13**

## Resultado

A documentação oficial do Alibaba Open Platform possui uma categoria de APIs
para 闲鱼 (Xianyu), incluindo autorização de usuários, operações de reciclagem,
consignação, aluguel e alguns fluxos de pedidos. Ela não documenta, de forma
pública e estável, um endpoint geral de busca de anúncios que possa substituir
o `/sites/{site}/search` do Mercado Livre.

Consequentemente, o MVP não pode declarar uma coleta live de catálogo Xianyu.
O connector deve existir como uma fronteira explícita, com fixtures e health
degradado quando não houver uma integração autorizada.

## Camadas avaliadas

| Camada                | Estado no MVP                                                             | Decisão                                                          |
| --------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| API oficial           | APIs de parceiros existem, mas catálogo/search público não foi confirmado | Não habilitar sem credenciais, contrato e permissão documentados |
| Endpoint JSON/GraphQL | Não confirmado por documentação oficial                                   | Não implementar endpoint privado                                 |
| WebSocket/SSE         | Não necessário para o MVP                                                 | Deferido                                                         |
| HTTP/HTML             | Tecnicamente possível, mas sujeito a sessão, mudanças e políticas         | Somente após revisão de conformidade e provider aprovado         |
| Browser/DOM/OCR       | Custo e risco altos para a primeira entrega                               | Deferido                                                         |

## Contrato de implementação

- `source = xianyu` e camada primária declarada como `2`, sem afirmar que o
  endpoint está disponível em produção.
- `MockXianyuConnector` é o único caminho operacional local nesta fase.
- O modo indisponível retorna erro interno estável e health `LOGIN_REQUIRED` ou
  `CONTENT_CHANGED`, conforme a razão conhecida, sem persistir payload externo.
- Nenhum endpoint privado, bypass de CAPTCHA, automação de conta ou coleta de
  credenciais será implementado como parte do MVP.
- A ativação live exige uma nova revisão com endpoint/credencial autorizados,
  limites, termos aplicáveis e fixtures reais sanitizadas.

## Fontes consultadas

- Alibaba Open Platform — catálogo de APIs Xianyu: <https://developer.alibaba.com/docs/api.htm?apiId=74810>
- Alibaba Open Platform — APIs de integração Xianyu: <https://developer.alibaba.com/docs/api.htm?apiId=70002>
