# O agente conversacional

> "Ele não faz nada além de montar nesse cavalo que é o sistema." — Caio
>
> O agente é um **cliente da nossa própria API**, com as mesmas permissões do
> usuário e nada mais. Ele lê o que o sistema produziu e manda o sistema
> trabalhar. Ele não coleta, não analisa, não pontua e não age.

---

## 1. Três verbos

| Verbo        | O que faz                                            | Exemplo                                |
| ------------ | ---------------------------------------------------- | -------------------------------------- |
| **Ver**      | consulta o que o sistema já produziu                 | "achou algum fornecedor de tal coisa?" |
| **Pedir**    | estrutura uma pesquisa/monitor e manda rodar         | "preciso pesquisar tal e tal coisa"    |
| **Explicar** | diz por que um resultado está ali, citando evidência | "por que esse ficou em primeiro?"      |

E o que ele **nunca** faz: coletar, analisar, estimar preço, adivinhar. Se a
resposta não veio de uma ferramenta, ele não sabe — e diz que não sabe. Um agente
que "acha" que um MacBook vale R$ 3.000 sem consultar o valuation é pior que
agente nenhum, porque parece certo.

---

## 2. Ferramentas

São a nossa API, exposta ao agente. Livre acima da linha, com confirmação abaixo.

```
ver_pesquisas()
buscar_resultados(pesquisa?, filtros, ordem, limite, cursor)   ← o coração
ver_anuncio(id)
comparar(ids[])
preco_de_referencia(produto, condicao, regiao)
saude_das_fontes()
─────────────────────────────────────────────  daqui pra baixo, gasta
propor_pesquisa(descrição) → critério estruturado para confirmação
disparar_coleta(pesquisa) → exige confirmação com estimativa de custo
criar_monitor(pesquisa|anuncio|lote, corte, frequência)
marcar(anuncio, shortlist|descartar|coracao)
```

Ler é livre; **gastar exige confirmação explícita** com estimativa na frente.

---

## 3. Cinco regras que o tornam confiável

1. **Nunca responde de memória.** Toda afirmação nasce de um `tool_result`.
2. **Toda afirmação cita o registro.** "3 candidatos fortes" vem com os IDs
   clicáveis que abrem o dossiê.
3. **"Bom" não é opinião dele.** Ele traduz "bom" no critério e no score que o
   **sistema** calculou, e informa qual corte usou.
4. **Sem ação vinculante.** Prepara; o humano aperta. Comprar, dar lance, pagar e
   enviar mensagem seguem fora até a S13.
5. **Descrição de anúncio é dado, não ordem.** Texto coletado entra envelopado e
   nunca decide chamada de ferramenta. Anúncio com "ignore as instruções
   anteriores" não vira comando.

Segurança não depende do prompt se comportar: as ferramentas rodam com o JWT do
usuário e o RLS garante que ele não alcança dado alheio.

---

## 4. Como o agente encontra as coisas

Reflexo comum: "IA sobre muitos dados → RAG". **Para este sistema, na maioria dos
casos, RAG é a ferramenta errada.** O pipeline inteiro existe para transformar
texto bagunçado em coluna; buscar por similaridade depois disso joga fora a
estrutura que custou caro.

E vetor **não conta**: "quantos iPhone 13 com tela rachada abaixo de R$ 1.500?"
tem resposta exata no banco. RAG devolve os N trechos mais parecidos e o agente
conclui, confiante, que viu tudo.

### Três camadas, nesta ordem

| Camada                                       | Quando                                                                              | Custo                                    |
| -------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------- |
| **1. Filtro estruturado**                    | 95% dos casos: modelo, defeito, preço, condição, fonte, período                     | zero infra                               |
| **2. Busca lexical** (`tsvector`, `pg_trgm`) | a cauda que não virou coluna: "menciona bateria trocada"                            | zero infra                               |
| **3. Vetor** (`pgvector`)                    | identidade semântica ("notebook apple 14" = M4), "parecido com este", pergunta vaga | cota de IA, refaz quando a extração muda |

| Pergunta                                 | Mecanismo                 |
| ---------------------------------------- | ------------------------- |
| "tem iPhone 13 com tela rachada?"        | estruturado               |
| "quantos abaixo de R$ 1.500?"            | estruturado (vetor mente) |
| "algum que mencione bateria trocada?"    | lexical                   |
| "esse aqui tem parecido em outra fonte?" | vetor                     |
| "esse 'notebook apple' é um M4?"         | vetor + specs             |
| "achou alguma oportunidade boa hoje?"    | filtro por score + corte  |

> **Pergunta com resposta exata vai para o banco. Vetor é para quando "parecido"
> é literalmente a pergunta.**

Ponto que amarra tudo: **a inteligência está na extração, não na recuperação.**
Se o defeito não virar campo estruturado na S2, nenhum RAG responde bem.

### Conjuntos grandes

O agente **não** despeja o conjunto no contexto. Consulta agregado (contagens,
medianas, faixas), pagina, e diz explicitamente o recorte que usou. Responder
sobre 5.000 anúncios olhando 20 é o modo de falha mais provável deste desenho.

---

## 5. Sobre MCP

MCP é **protocolo de transporte** de ferramentas, não mecanismo de busca. Ele
responde "como um agente chama nossas funções", não "como achamos o anúncio".

Internamente o agente chama a API direto. MCP passa a fazer sentido quando **outra
IA** — Claude Desktop, um agente do usuário — precisar usar o Scout como
ferramenta externa. Continua em "mais tarde".

---

## 6. Onde vive

- **Drawer contextual** — sabe a pesquisa e os filtros ativos; responder muda a
  lista ao lado.
- **Tela cheia** — conversa sobre o sistema inteiro.

Quando filtra, **mostra o filtro aplicado**, editável.

---

## 7. Onde isto pode dar errado

- **Filtro estruturado só é bom se a extração for boa.** Resposta exata e errada
  é pior que vaga e honesta. O agente precisa poder dizer "14 classificados, 3
  com confiança baixa".
- **Traduzir linguagem natural em filtro erra em silêncio.** "iPhone 13" pode
  perder todo "iPhone 13 Pro". Por isso o filtro aplicado é sempre visível.
- **O agente parece mais inteligente que o sistema.** Enquanto S2/S4 não
  existirem, ele narra bem resultados que são regex e preço — gerando confiança
  que o dado ainda não merece.
- **Citação obrigatória cria atrito.** Menos fluido que resposta solta; é o preço
  de ser verificável.
- **Confirmação antes de gastar irrita com pressa.** Um modo de orçamento
  pré-aprovado por sessão é possível, mas o teto tem que ser explícito.
- **Memória do agente não foi desenhada de propósito.** Preferências ("nunca me
  traga carcaça") tornam-no útil, mas memória mal feita vira viés invisível que
  filtra oportunidade sem o usuário saber. Decisão separada.
