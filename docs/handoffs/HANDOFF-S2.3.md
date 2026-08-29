# Handoff S2.3 — Evidência e defeito a partir de anúncio real

## Objetivo

Executar o caminho completo de um anúncio real do eBay até a persistência de
evidências, defeitos, grau de confiança e estado desconhecido.

## Pronto quando

Executar uma coleta real do eBay com a análise habilitada produz uma `listing`,
uma `analysis_run` concluída e registros relacionados em `evidence`, `defects`
e `defect_evidence`; cada conclusão aponta para evidência da mesma execução e
ausência de informação funcional aparece como `unknown`, sem ser tratada como
defeito confirmado.

## Contrato

- Entrada: projeto ativo, fonte eBay, credencial e quota aprovadas, e um anúncio
  real contendo título, descrição e condição normalizados.
- Saída: análise versionada com `provider`, `model`, `promptVersion`, uso de
  tokens quando fornecido, evidências com `sourceType`, `assessmentKind`,
  `status` e `confidence`, defeitos e vínculos relacionais por chave local.
- Persistência: `analysis_runs`, `evidence`, `defects` e `defect_evidence`, via
  RPC transacional do consumidor de fila.
- Fronteiras tocadas: `TextAnalyzer`, `TextAnalysisRunRepository`, schema de
  saída textual e consumidor `analysis-queue`.

## Caminho de usuário

O usuário cria ou abre um projeto ativo, dispara `POST
/api/projects/:projectId/collection-runs`, acompanha a execução pela tela e
consulta os anúncios persistidos. A análise é disparada downstream após a
persistência da coleta; a leitura detalhada da análise permanece no repositório
até existir uma tela/rota própria.

## Fora de escopo

- Imagens, OCR, score de oportunidade, custo de reparo e entity resolution.
- Habilitar compra, lance, mensagem ou qualquer ação vinculante.
- Ativar Gemini em produção sem aprovação de privacidade e quota.
- Contornar CAPTCHA, login, controle de acesso ou política da fonte.

## Onde pode dar errado

- A coleta pode falhar por credencial, quota, autorização ou mudança na API do
  eBay.
- A fila remota ou o banco remoto podem não estar provisionados; isso não pode
  ser confundido com prova local.
- Um anúncio pode não declarar estado funcional suficiente; o resultado deve
  preservar `unknown` e limitações, nunca inventar certeza.
- O texto do anúncio pode conter prompt injection; ele deve permanecer dado
  delimitado e não pode decidir ferramenta, chamada ou ação.
