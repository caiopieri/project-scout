# HANDOFF-S2.1 — Porta de análise e provedor LLM

## Objetivo

Colocar um provedor LLM real atrás da porta `TextAnalyzer`, sem acoplar o
consumidor à API do provedor e sem deixar texto de anúncio controlar o sistema.

## Pronto quando

Executar o consumidor com `TEXT_ANALYZER_MODE=gemini` e uma resposta gravada
produz um `TextAnalysisResult` validado; ao atingir o orçamento local, nenhuma
chamada adicional é feita; respostas 429/5xx e timeout são classificadas como
transitórias; resposta inválida ou credencial rejeitada termina de forma
permanente e a fila não derruba a coleta.

A validação live com `GEMINI_API_KEY`, quota efetiva e termos de processamento
continua pendente até credencial autorizada.

## Contrato

- Entrada: `TextAnalysisInput` validado e limitado pelos schemas compartilhados.
- Saída: `TextAnalysisResult` validado, com provider/model/prompt/usage.
- Transporte: REST `generateContent`, JSON estruturado, `fetch` injetável nos testes.
- Limites: timeout e número máximo de requests por instância, sem retry interno
  ilimitado.
- Segurança: título, descrição e condição entram em tags estritas como dados não
  confiáveis; nenhum conteúdo coletado escolhe ferramenta ou chamada externa.

## Caminho de usuário

Coleta → fila de análise já existente → `TextAnalysisTaskProcessor` →
`GeminiTextAnalyzer` quando o modo está explicitamente configurado.

## Fora de escopo

- Chamada live sem credencial.
- Extração genérica dirigida por schema arbitrário (S2.2).
- Imagem, ranking, agente conversacional ou qualquer ação vinculante.

## Onde pode dar errado

- O provedor pode alterar o contrato ou rejeitar parte do JSON Schema suportado.
- A quota configurada pode ser menor que a esperada; o medidor precisa degradar a
  análise sem transformar isso em falha da coleta.
- Texto hostil pode tentar instruir o modelo; o envelope e a validação de saída
  precisam permanecer obrigatórios.
