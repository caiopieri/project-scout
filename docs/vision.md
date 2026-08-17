# Visão — Project Scout

> Documento de direção. Muda pouco. Quando um documento operacional contradisser
> este, este vence e o outro está errado.

## 1. O que estamos construindo

Um **núcleo próprio de coleta e inteligência de busca na web**, e aplicações em
cima dele.

O núcleo faz três coisas:

1. **Coleta** qualquer fonte pública da internet, escolhendo sozinho a melhor
   técnica disponível — de API oficial a navegador com sessão do usuário.
2. **Entende** o que coletou: identifica o item, gradua a evidência, avalia
   condição, risco e oportunidade — com IA de texto e de imagem.
3. **Acumula memória**: cada coleta alimenta um acervo permanente de preços,
   vendedores e comportamento de mercado. É o que faz "barato" e "caro"
   existirem, e é o único componente que fica melhor sozinho com o tempo — o
   ativo que um concorrente novo não copia. Ver
   [memoria-de-mercado.md](./memoria-de-mercado.md).
4. **Se cura**: quando uma fonte quebra, o sistema detecta, diagnostica e propõe
   correção sem esperar alguém perceber.

A primeira aplicação em cima do núcleo é **garimpo de eletrônicos para uma loja
real**. Outras aplicações virão (vídeo, fóruns, pesquisa de mercado) e vão
reusar o mesmo núcleo.

## 2. Por que núcleo próprio e não Apify/Firecrawl

Decisão do fundador, tomada com os números na mão:

- Coleta terceirizada é cobrada por chamada. Milhares de anúncios por pesquisa,
  várias pesquisas por dia, várias fontes: o custo escala com o uso e o preço
  não é nosso.
- Dependência de fornecedor significa que o teto de capacidade e o teto de
  preço do produto são definidos por outra empresa.
- Parte da coleta **precisa** rodar na máquina do usuário, com a sessão dele
  logada — monitorar leilão, ver preço de fornecedor autenticado, acompanhar
  conta própria. Nenhum SaaS de scraping faz isso.

Custo-alvo do nosso núcleo: manutenção + proxy rotativo. Usar um fornecedor
externo pontualmente para **estudar** o comportamento de uma fonte é aceitável;
depender dele no caminho crítico não é.

## 3. As três formas de execução

O mesmo núcleo roda em três lugares, com o mesmo contrato:

| Onde                              | Para quê                                                    | Sessão                       |
| --------------------------------- | ----------------------------------------------------------- | ---------------------------- |
| **Nuvem**                         | Volume, agendado, fontes públicas                           | Anônima ou credencial de app |
| **Máquina do Caio (Local Agent)** | Fonte que exige login próprio, leilão ao vivo, fonte hostil | Sessão real do usuário       |
| **Híbrido**                       | Descoberta na nuvem, detalhe/ação local                     | Ambas                        |

O Local Agent não é uma fase distante: é onde mora metade do valor. Ele nasce
cedo, em modo somente-leitura.

## 4. A cascata de coleta

Para cada fonte, o sistema tenta a camada mais barata e estável que funciona, e
degrada de forma ordenada:

1. API oficial / webhook
2. Endpoint JSON/GraphQL usado pelo próprio site
3. WebSocket / SSE / long polling (tempo real, leilão)
4. HTTP/HTML direto
5. Navegador automatizado (JS, sessão, interação)
6. DOM / MutationObserver em página viva
7. Screenshot + OCR / IA multimodal

Trocar de camada em produção é comportamento esperado, não exceção. Limite
inegociável: não contornamos CAPTCHA nem controle de acesso, e não usamos
credencial de terceiro.

## 5. O que o sistema precisa enxergar além do anúncio

Garimpo não termina no marketplace. Para comprar o mais perto possível da
origem, o sistema precisa mapear a **cadeia**: fábrica → fornecedor na porta da
fábrica → distribuidor → revendedor local. Ver o mesmo produto nos três níveis,
com preço e prazo, é uma capacidade de produto, não um relatório manual.

## 6. Princípios que não se negociam

- **Evidência antes de conclusão.** Toda afirmação carrega origem e grau de
  certeza. "Provável" nunca vira "é".
- **Coleta desacoplada da análise.** Trocar a técnica de coleta não pode mexer
  em banco, análise, score ou interface.
- **Todo conteúdo coletado é hostil** até ser validado. Descrição de anúncio
  nunca instrui um agente.
- **Nenhuma ação vinculante sem autorização humana explícita.** Comprar, dar
  lance, enviar mensagem e pagar exigem aprovação por ação, com limite e
  expiração.
- **O núcleo é genérico; o vocabulário é da vertical.** Preço, defeito e margem
  pertencem à aplicação de comércio, não ao núcleo.

## 7. Aplicações previstas

1. **Garimpo para a loja** (atual): usados com defeito para recondicionar,
   seminovos, novos lacrados, acessórios e peças.
2. **Inteligência de fornecedores**: quem fabrica, quem distribui, a que preço.
3. **Leilões**: monitorar lotes, avaliar dossiê, alertar — e, sob autorização
   explícita, agir.
4. **Futuro, mesmo núcleo**: vídeo (YouTube), fóruns técnicos, pesquisa de
   mercado, qualquer estrutura de busca que precise de coleta + entendimento.
