# PRD — Garimpo para a loja (primeira aplicação do núcleo)

> Requisitos operacionais da primeira aplicação. A visão de longo prazo está em
> [vision.md](./vision.md); a visão original completa está preservada em
> [archive/prd-v1-visao-original.md](./archive/prd-v1-visao-original.md).
>
> Escopo deste documento: o que a loja precisa para comprar bem. Nada aqui
> descreve venda, estoque ou pós-venda.

## 1. Usuário e contexto

Usuário único no início: **Caio**, dono de uma loja de eletrônicos em abertura,
desenvolvedor, com logística internacional disponível. Compra para:

| Modo de aquisição     | O que procura                            | O que decide a compra                                     |
| --------------------- | ---------------------------------------- | --------------------------------------------------------- |
| **Recondicionamento** | Usado quebrado, danificado ou descuidado | Defeito é reparável? Custo de reparo + risco < margem     |
| **Seminovo**          | Usado funcional abaixo do mercado        | Preço vs. preço de mercado; risco de golpe                |
| **Novo lacrado**      | Lacrado, revenda direta                  | Preço vs. distribuidor; autenticidade; volume             |
| **Acessórios**        | Adaptadores, periféricos, cabos, insumos | Preço por unidade em volume; confiabilidade do fornecedor |
| **Peças**             | Componentes para alimentar o reparo      | Compatibilidade com os modelos que a loja recondiciona    |
| **Lotes / leilão**    | Lotes de eletrônicos, sucata qualificada | Custo por unidade útil no lote; taxas; logística          |

**Regra de preferência de origem:** comprar o mais próximo possível da origem.
Fábrica > fornecedor na porta da fábrica > distribuidor > revendedor local. O
sistema deve mostrar os níveis disponíveis do mesmo produto, não só o mais
fácil de achar.

## 2. Problema

Hoje o garimpo é manual: abrir dezenas de sites, testar palavras-chave, ler
anúncio por anúncio, interpretar foto, desconfiar de golpe, calcular custo total
e comparar com o preço de mercado — repetidamente, todos os dias, em vários
países e moedas. Não escala, e as melhores oportunidades duram horas.

## 3. O que o sistema precisa fazer

### 3.1 Receber a intenção

O usuário descreve em português o que procura, incluindo defeito aceito, defeito
proibido, orçamento, modo de aquisição e destino logístico. O sistema converte
em critério estruturado, mostra o que entendeu e permite corrigir.

> "MacBook M4 com tela quebrada, que ligue, sem dano na placa, até US$ 900,
> qualquer país com frete para o Brasil."

### 3.2 Coletar em várias fontes

Executar a busca em todas as fontes habilitadas para o modo de aquisição, com
famílias de query por fonte (o termo que funciona no eBay não é o que funciona
na OLX). Fonte que não responde é registrada como degradada, não silenciada.

### 3.3 Filtrar ruído e golpe antes de gastar IA

Funil obrigatório, do mais barato ao mais caro:

| Camada          | Trabalho                                                                  | Custo               |
| --------------- | ------------------------------------------------------------------------- | ------------------- |
| 0 Descoberta    | ID, título, preço, URL, miniatura, vendedor, local                        | muito baixo         |
| 1 Filtro barato | Relevância, preço-isca, categoria errada, duplicata, acessório disfarçado | baixo               |
| 2 Detalhe       | Descrição, condição, frete, vendedor, atributos                           | baixo/médio         |
| 3 Mídia         | Baixar imagens só dos candidatos                                          | médio               |
| 4 IA multimodal | Produto real, condição, incoerência, sinal de risco                       | médio/alto          |
| 5 Investigação  | Preço de mercado, liquidez, histórico, documentação                       | alto, só finalistas |

Meta nominal: 1000 cards → 500 relevantes → 150 candidatos → 25 fortes.

**Filtrar não é esconder.** O funil decide onde o sistema gasta, nunca o que
existe. Todo anúncio permanece no acervo etiquetado com a camada que alcançou e o
motivo de ter parado ali; o usuário vê ou não vê conforme o filtro que ele
escolher. Um vendedor de preço normal, que hoje não é oportunidade, continua
disponível para amanhã. Detalhe completo em
[funil-e-risco.md](./funil-e-risco.md).

### 3.4 Entender o anúncio

- **Texto**: modelo, capacidade, defeito declarado, o que o vendedor afirma que
  funciona, o que ele evita dizer, custo total (preço + frete + taxa + imposto).
- **Imagem**: dano visível, tela ligada, aplicativo aberto, sinal de bloqueio,
  peça faltando, foto genérica reusada, incoerência entre foto e descrição.
- **Vendedor**: reputação, tempo de conta, padrão de anúncio, sinais de golpe.

Toda conclusão carrega **origem** (declarado / visto na foto / inferido) e
**grau** (confirmado / muito provável / provável / possível / desconhecido /
contraditório). Inferência nunca é apresentada como fato.

### 3.5 Calcular a oportunidade

Para cada anúncio, com a conta explícita e auditável:

```
custo total = preço + frete + taxa da plataforma + imposto/importação + reparo estimado
oportunidade = preço de mercado do resultado esperado − custo total − risco
```

Faltando dado para a conta, o sistema declara o que falta em vez de inventar.

### 3.6 Entregar a decisão

- **Feed ranqueado** por oportunidade, filtrável por modo, fonte, país, faixa de
  preço e nível de risco.
- **Comparação** entre anúncios semelhantes e entre níveis da cadeia (fábrica /
  fornecedor / revendedor).
- **Perguntas prontas ao vendedor** para o que ficou desconhecido.
- **Exportação** CSV/XLSX.
- **Monitoramento**: pesquisa salva que roda sozinha e alerta quando aparece
  oportunidade acima do corte, ou quando um preço monitorado cai.

### 3.7 Registrar o resultado real

Após a compra: o que chegou, defeito real, custo real de reparo, valor de
revenda, lucro, e se a análise acertou. É esse dado que calibra o sistema.

### 3.8 Acumular memória de mercado

Cada pesquisa alimenta um acervo permanente. Dele saem as referências que fazem
"barato" e "caro" existirem: preço de referência por produto, condição e grade;
tendência; liquidez; pressão do vendedor. É o único componente do sistema que
melhora sozinho, e o histórico não se recupera depois — por isso a gravação
começa na primeira coleta real. Ver [memoria-de-mercado.md](./memoria-de-mercado.md).

### 3.9 Leilões

Leilão é uma categoria própria porque **o preço mostrado não é o custo real**. O
sistema precisa:

- ler o edital e converter lance em custo total (comissão do leiloeiro, taxa
  administrativa, impostos e débitos quando aplicáveis, retirada, regularização,
  reparo estimado);
- versionar o edital e apontar mudança material entre versões;
- monitorar o lote registrando todos os lances, com intensidade maior perto do
  fechamento;
- calcular custo por unidade útil no lote.

Somente leitura. Lance automático é ação vinculante e depende de autorização
explícita, fora do escopo atual.

### 3.10 Fornecedores e cadeia

Mostrar o mesmo produto nos níveis fábrica → fornecedor → distribuidor →
revendedor, com preço, MOQ, prazo e rota logística, para que a compra aconteça o
mais perto possível da origem.

### 3.11 Conversar com o sistema

Um agente que lê o que o sistema produziu e manda o sistema trabalhar — nunca
coleta, analisa ou age por conta própria. Toda afirmação dele nasce de uma
consulta e vem com o registro citado. Contrato completo em
[agente.md](./agente.md).

## 4. Critérios de sucesso

O sistema é útil quando, em uma pesquisa real:

1. Coleta de **pelo menos duas fontes vivas**, sendo ao menos uma sem API
   oficial.
2. Reduz 1000 anúncios brutos a **menos de 30** que valem leitura humana.
3. Nenhuma das 30 é claramente golpe, acessório disfarçado ou fora do critério.
4. O custo total calculado bate com a realidade dentro de margem aceitável em
   uma compra de verdade.
5. Encontra pelo menos **uma oportunidade que o Caio não teria achado sozinho**.

## 5. Fora de escopo desta aplicação

- Vender, precificar estoque, emitir nota, gerir pós-venda.
- Comprar, dar lance ou pagar automaticamente. Ação vinculante exige autorização
  humana explícita por ação — e o executor ainda não existe.
- Negociar sozinho com vendedor. Rascunho de mensagem é permitido; envio
  automático não.
- Contornar CAPTCHA, controle de acesso ou usar credencial de terceiro.
- Categorias fora de eletrônicos (veículo, imóvel, máquina industrial).
