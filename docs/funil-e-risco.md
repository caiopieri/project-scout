# Funil de triagem, custo e risco

> Como o sistema gasta informação na ordem certa, e como decide em quem confiar.
> Referência quantitativa: [pesquisa-de-mercado.md](./pesquisa-de-mercado.md)
> (EIXO 2 e EIXO 8). Referência de preço: [memoria-de-mercado.md](./memoria-de-mercado.md).

---

## 1. A regra que organiza tudo: dois eixos, não um

Existe uma confusão que destrói o produto se não for resolvida no começo:

| Eixo      | Pergunta                                  | Quem decide    |
| --------- | ----------------------------------------- | -------------- |
| **Custo** | Até que camada eu enriqueci este anúncio? | o funil        |
| **Visão** | O que o usuário quer ver agora?           | o filtro da UI |

> **O funil decide onde gastar. Ele nunca decide o que existe.**

Nada é descartado. Tudo é etiquetado com a camada que alcançou e o motivo de ter
parado ali. Um anúncio reprovado no título fica no banco com
`camada=0, motivo=titulo_nao_corresponde`, custou zero, e reaparece no instante
em que o usuário tirar o filtro.

Consequências obrigatórias:

- Um vendedor de preço normal, que hoje não é oportunidade, continua no acervo —
  amanhã o usuário pode querer comprar dele.
- Cota de IA esgotada **não é erro**: o anúncio fica na camada que alcançou e é
  analisado depois. A UI mostra "142 aguardando análise", não uma falha.
- Enriquecimento é **sob demanda**: a primeira passada é rasa e ampla; a análise
  cara acontece quando o usuário pede ou quando um monitor justifica.

---

## 2. As camadas

| Camada              | Trabalho                                               | Mata o quê                                                  | Custo por anúncio   |
| ------------------- | ------------------------------------------------------ | ----------------------------------------------------------- | ------------------- |
| **0 Descoberta**    | ID, título, preço, URL, miniatura, vendedor, local     | —                                                           | ~0 (vem em lote)    |
| **1 Filtro barato** | regras determinísticas sobre título e preço            | categoria errada, acessório, peça, fora de faixa, duplicata | ~0                  |
| **2 Risco inicial** | sinais de fraude sobre metadados                       | preço-isca, foto de catálogo, texto duplicado               | ~0                  |
| **3 Detalhe**       | descrição, condição, frete, atributos, vendedor        | contradição com o título, "somente caixa", incompleto       | 1 request           |
| **4 Identidade**    | o candidato é mesmo o produto?                         | produto errado disfarçado                                   | barato              |
| **5 IA de texto**   | defeito real, o que o vendedor evita dizer, evidência  | expectativa incompatível                                    | tokens              |
| **6 IA de imagem**  | dano visível, tela ligada, peça faltando, foto reusada | incoerência foto × descrição                                | tokens caros        |
| **7 Investigação**  | mercado, liquidez, histórico, documentação, edital     | —                                                           | alto, só finalistas |

Alvo nominal: **1000 → 500 → 400 → 200 → 150 → 60 → 25 fortes.**

Regra de ouro da coleta: **a página de listagem entrega ~100 cards em uma
requisição**. Detalhe é uma requisição por anúncio. Nunca entrar em detalhe antes
da camada 3 ter aprovado — é a diferença entre 1 e 100 requisições.

---

## 3. Política de imagens

Três coisas diferentes, sempre separadas: **exibir**, **baixar**, **analisar**.

### 3.1 Exibir é de graça

Para mostrar 3.000 cards com foto, **não se baixa nada**. O card aponta para a
CDN da fonte e o navegador do usuário carrega direto. Hoje o sistema já persiste
apenas a URL da imagem — esse comportamento está correto e deve ser preservado.

### 3.2 Miniatura: baixa, calcula o hash, descarta o binário

Na camada 2, baixar o **thumbnail** (~15 KB), calcular hash perceptual e
descartar a imagem. Guarda-se apenas o hash. Isso entrega, quase de graça:

- **foto de catálogo / golpe**: a mesma imagem em N vendedores diferentes;
- **dedup cross-source**: o mesmo item no eBay e na OLX;
- **republicação**: o vendedor apagou e postou de novo;
- **diversidade visual**: quais fotos do anúncio são diferentes entre si.

### 3.3 Alta resolução: só finalistas, e só 3 fotos

De 12 fotos, três respondem quase tudo: a capa, a que a descrição referencia
("foto 4 mostra o trinco") e a mais diferente das demais — que já se sabe pelo
hash da camada 2. Em **resolução média** (~1024px): responde "tem trinco?" e
custa uma fração dos tokens de uma foto de 4000px.

### 3.4 Preservar: só o que o usuário marcou

Favoritou, comprou ou virou disputa → guarda no R2 permanentemente, porque virou
evidência. O resto vive na CDN da fonte.

### 3.5 Cache e orçamento

- Imagem com hash já analisado **nunca** é analisada de novo.
- Cada pesquisa tem teto explícito de análises visuais. O sistema gasta nos
  melhores candidatos primeiro e avisa quando acabar.

**Ordens de grandeza** (3.000 anúncios × 12 imagens): baixar tudo em alta são
~11 GB e 36.000 requests — o que faz a fonte bloquear. Analisar tudo no
multimodal custa duas a três ordens de grandeza mais que analisar 100 finalistas.
O que mata não é armazenamento; é **volume de requests** (bloqueio) e **IA**
(dinheiro).

---

## 4. Golpe: lápide, não exclusão

Anúncio identificado como golpe **não** é apagado — vira uma lápide:

```
id, url, hash perceptual da imagem, motivo, data, fonte
```

Payload e imagens são descartados. Ocupa quase nada e transforma golpe em
memória: na terceira vez que aquela foto aparecer, o sistema mata na camada 2 de
graça. Sem a lápide, paga-se para redescobrir o mesmo golpe em toda pesquisa
futura, para sempre.

O DOCX v1.1 §9 estabelece o mesmo princípio: _"golpes evidentes podem ser
reduzidos a fingerprints e evidências mínimas para reconhecimento futuro"_.

### 4.1 Sinais de fraude

Do PRD original §17, nenhum implementado ainda:

preço muito abaixo do mercado · vendedor sem histórico · histórico incompatível ·
pagamento externo · descrição copiada · imagens duplicadas · imagens de catálogo ·
números de série divergentes · localização inconsistente · devolução ausente ·
linguagem de urgência · produto diferente da variação exibida · item incompleto
disfarçado de completo.

Saída: `baixo` · `moderado` · `alto` · `crítico` · `revisão obrigatória`.

**Nunca afirmar que um vendedor é golpista sem comprovação externa.**

---

## 5. Risco de vendedor: nenhum sinal isolado é veredito

O caso difícil: conta nova pode ser golpista ou pode ser gente honesta que criou
a conta ontem. A resposta é peso combinado, não sentença:

| Combinação                                                                                 | Leitura                                             |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| conta nova, sozinha                                                                        | **neutro** — não é sinal de nada                    |
| conta nova + 60% abaixo do mercado + foto de catálogo + recusa mais fotos + pagamento fora | **crítico**                                         |
| conta nova + preço normal + fotos próprias + retirada local                                | **normal**, com confiança menor até haver histórico |
| reputação ruim + muitos anúncios + preço coerente                                          | investigar o padrão das reclamações, não o número   |

O sistema mantém histórico observado por vendedor (`SELLER` no DOCX §9): quantos
anúncios, quanto tempo, quantas republicações, quantas reduções de preço.

---

## 6. Identidade de produto: não se confia no título

O caso concreto: título diz "iPhone 15 Pro", descrição diz iPhone 12.

O sistema **não descarta** — ele resolve a identidade real e recalcula a
oportunidade **sobre o produto identificado**, marcando o anúncio com risco de
título enganoso. Resultado no card:

> Anunciado como iPhone 15 Pro · identificado como iPhone 12 (evidência:
> descrição + foto) · ⚑ título enganoso · como iPhone 12, a R$ 1.400, está 22%
> abaixo da mediana

Fórmula de correspondência (relatório de mercado, EIXO 2 §3):

```
Sim = 0.35 · JaroWinkler(títulos) + 0.25 · Levenshtein_norm + 0.40 · match(specs)
Sim ≥ 0.85 e ModelCode compatível → mesmo canonical_product_id
```

Atributos extraídos por regex antes de qualquer IA: CPU (`M1/M2/M3/M4`,
`i7-13700H`, `Ryzen 7 7800X3D`), RAM, storage, GPU, ModelCode (`A2633`, `20Y7`),
cor e grade.

### 6.1 Tabela de interpretação (DOCX §7)

| Situação                                                | Leitura                                                   |
| ------------------------------------------------------- | --------------------------------------------------------- |
| título coerente + descrição coerente + caixa lacrada    | consistência alta                                         |
| título "RTX 4090" + foto de RTX 4070                    | inconsistência material; confiança cai, investigação sobe |
| título genérico "placa de vídeo" + foto claramente 4090 | **oportunidade escondida** — melhor caso do radar visual  |
| foto só da caixa + descrição curta                      | ambíguo; não descartar, buscar evidência                  |
| preço muito baixo isoladamente                          | sinal de risco, **não prova de golpe**                    |

---

## 7. Inferência de silêncio: a mais perigosa

> "A descrição não menciona o motor, então o motor deve estar bom."

**Não.** Ausência de menção nunca é evidência de funcionamento. O sistema marca
como **desconhecido de alto impacto** e, se for finalista, gera a pergunta ao
vendedor. Nunca como sinal positivo, nunca somando no score.

Vale para tudo: iCloud não mencionado, bateria não mencionada, placa não
mencionada. Quanto maior o custo de estar errado, mais alto o peso do
desconhecido.

---

## 8. Cota de IA como orçamento

O free tier do Gemini limita **requisições por dia**, não dinheiro. Adaptações
obrigatórias:

- **Lote**: 10–20 anúncios por requisição de análise de texto, com saída em array
  validado e id de volta. Transforma 500 análises em ~25 requisições.
- **Isolamento por item**: cada anúncio em sua própria tag dentro do lote. Um
  anúncio hostil não pode contaminar os outros 19.
- **Medidor antes do 429**: o sistema sabe quanto já gastou hoje e para antes de
  tomar erro, no mesmo padrão do rate limiter do eBay.
- **Degradação, não falha**: cota esgotada deixa o anúncio na camada atual.

---

## 9. Onde isto pode dar errado

- Etiquetar tudo e nunca descartar faz o acervo crescer sem freio; precisa de
  política de retenção e arquivamento frio.
- O detector de golpe erra nos dois sentidos. Por isso ele rebaixa e sinaliza,
  nunca apaga — e a decisão de comprar continua humana.
- Hash perceptual é frágil: recorte, marca d'água e recompressão escapam. Pega o
  golpista preguiçoso, não o cuidadoso.
- Escolher "as 3 melhores fotos" pode descartar exatamente a que mostrava o
  defeito. É heurística até ser medida contra compras reais.
- Lote degrada qualidade: 20 anúncios num prompt recebem menos atenção cada.
  Medir contra análise individual antes de fixar o tamanho.
