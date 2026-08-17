# Custo total na porta (landed cost)

> O número mais perigoso do sistema. Um custo subestimado transforma prejuízo em
> "oportunidade" no topo do feed — é o único erro que faz o usuário perder
> dinheiro de verdade.
>
> Equações de origem: [pesquisa-de-mercado.md](./pesquisa-de-mercado.md) EIXO 8.
> Fatia: **S3.1**.

---

## 1. Regra fundamental

> **Componente ausente não é zero. É desconhecido — e desconhecido impede
> ranqueamento como oportunidade.**

O sistema falha fechado: sem os componentes obrigatórios da rota, o item aparece
com `custo indeterminado` e fica **fora** do ranking de oportunidade, com a lista
do que falta. Nunca se preenche lacuna com estimativa silenciosa.

---

## 2. Anatomia do custo

Todo componente carrega **valor, moeda e origem**:

| Origem         | Significado                                         | Peso na confiança  |
| -------------- | --------------------------------------------------- | ------------------ |
| `informado`    | veio da fonte (frete calculado, comissão no edital) | alta               |
| `tabelado`     | tabela nossa por rota/categoria, versionada         | média              |
| `estimado`     | heurística ou IA                                    | baixa              |
| `desconhecido` | não temos                                           | bloqueia o ranking |

### 2.1 Componentes

```
CUSTO NA PORTA
├── preço do item                          informado
├── prêmio do comprador (leilão, % sobre o lance)   informado (edital)
├── taxa administrativa / documental       informado | tabelado
├── frete interno na origem                informado | tabelado
├── preparação (prep center, engradamento) tabelado
├── frete internacional                    tabelado | estimado
├── seguro                                 tabelado
├── conversão cambial (FX + spread)        tabelado
├── imposto de importação e taxas          tabelado por rota
├── despacho e handling                    tabelado
├── frete interno no destino               tabelado | estimado
├── reparo / recondicionamento estimado    estimado
└── regularização (quando aplicável)       estimado
```

### 2.2 Fórmula

```
C_landed = [(P_item × (1 + BP) + Taxa_adm + F_origem + C_prep + F_intl + Seguro) × FX]
           + T_importação + Handling + F_destino + C_reparo
```

Receita líquida e margem, para fechar a decisão:

```
R_liquida = P_venda × (1 − t_plataforma − fee_pagamento − t_imposto − θ_perda) − F_saída
MLR       = R_liquida − C_landed
ROI       = MLR / C_landed
```

Preço máximo de compra (limite de lance), que é a fórmula invertida:

```
P_max = [ ( (R_liquida / (1 + ROI_alvo)) − T_importação − Handling ) / FX
          − F_origem − C_prep − F_intl ] / (1 + BP)
```

---

## 3. Perfis de rota

O custo é função da **rota**, não do item. Cada rota é uma tabela versionada:

| Rota      | Particularidades                                                     |
| --------- | -------------------------------------------------------------------- |
| `US → US` | sem importação; prep center em estado sem sales tax muda a conta     |
| `US → BR` | remessa conforme vs. formal; ICMS "por dentro"; limiar de valor      |
| `CN → BR` | idem, com origem e frete diferentes                                  |
| `CN → US` | regime de baixo valor tem regras próprias e mutáveis                 |
| `X → EU`  | IVA por país de destino, marcação CE, responsabilidade do importador |
| `BR → BR` | frete e tributação internos                                          |

**Os números fiscais de cada rota são dado tabelado, com data e fonte, e exigem
conferência humana antes de entrar em produção.** Errar ICMS não é bug, é
autuação. Nenhum valor fiscal entra hard-coded em lógica de domínio.

---

## 4. Perfis de categoria

A mesma rota custa diferente conforme o que se move:

| Categoria           | Componentes dominantes                                                                               |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| Eletrônico portátil | frete por peso, imposto, prep leve. **Bateria de lítio é carga perigosa classe 9** e restringe modal |
| Lote / palete       | frete por volume, engradamento, custo por unidade útil                                               |
| Máquina industrial  | **rigging, engradamento, frete marítimo, desembaraço, instalação** — frequentemente maior que o item |

Referência real do fundador: CNC a US$ 400 com US$ 2.100 de logística — o frete
foi **5× o item**. A fórmula de eletrônico aplicada a máquina produz uma
"oportunidade" que é prejuízo.

---

## 5. Câmbio

- Taxa registrada **com data, fonte e spread**. Nunca "a cotação atual" implícita.
- O valor persistido guarda a taxa usada, para o cálculo ser reproduzível.
- Recálculo periódico marca o resultado como desatualizado em vez de mudar em
  silêncio.

---

## 6. Apresentação

A conta é **sempre aberta** na interface. O card mostra preço e custo total; o
dossiê mostra linha a linha, com a origem de cada componente e o que está
faltando.

Comparar caminhos é a saída de maior valor — e prazo, garantia e risco aparecem
com o mesmo destaque que o preço:

```
├─ mercado local (BR)      R$ 50.000   imediato · com garantia · risco baixo
├─ leilão US               R$ 13.500   45 dias · sem garantia · risco médio
└─ dealer EU               R$ 27.000   15 dias · com garantia · risco baixo
```

Sem prazo, garantia e risco ao lado do número, o comparador vira uma máquina de
convencer o usuário a decidir mal.

---

## 7. Contrato

- Dinheiro em **inteiro menor**, com moeda explícita. Nunca `float`.
- Política versionada (`valuationPolicy` já existe e deve ser estendida).
- Resultado persistido com: versão da política, versão da tabela de rota, taxa de
  câmbio usada, timestamp e lista de componentes desconhecidos.
- Recalcular com política nova **não** sobrescreve o resultado anterior — cria
  nova versão.

---

## 8. Estado atual

O código tem hoje quatro campos ingênuos em `opportunityPolicy`:
`processingCostMinor`, `desiredMarginMinor`, `repairReserveMinor`,
`transactionCostRate`. Não há câmbio, rota, imposto, prêmio de leilão nem origem
por componente. Substituir isso é o objetivo da S3.1.

---

## 9. Onde isto pode dar errado

- **Tabela fiscal desatualizada mente com autoridade.** Regime de importação muda
  por portaria; um número velho vira prejuízo sistemático em todos os itens da
  rota. Toda tabela precisa de data e de revisão periódica.
- **Estimativa de reparo é a mais frágil da conta** e frequentemente a que decide
  a margem. Só calibra com `purchase_outcomes` reais.
- **Frete de máquina não é cotável sem dimensão e peso**, que raramente estão no
  anúncio. Nessa categoria o "desconhecido" será a regra, não a exceção.
- **Falhar fechado esconde oportunidade.** Item bom sem dado de frete fica fora do
  ranking. É a escolha certa, mas o usuário precisa ver a fila do que ficou de
  fora e por quê — senão parece que o sistema não achou nada.
