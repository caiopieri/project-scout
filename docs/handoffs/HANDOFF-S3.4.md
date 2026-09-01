# HANDOFF-S3.4a — Lista ordenada, paginação estável e o que fazer com o desconhecido

> Quarta fatia do Round 3, depois de [S3.1a](./HANDOFF-S3.1a.md),
> [S3.2a](./HANDOFF-S3.2.md) e [S3.3a](./HANDOFF-S3.3a.md).
>
> Escrita em 2026-09-01 pelo arquiteto na última sessão dele. Leia
> [SUCESSAO-SEM-ARQUITETO.md](../team/SUCESSAO-SEM-ARQUITETO.md) **antes** deste
> handoff: ele define quem decide o que este documento não cobre.
>
> Primeira quebra da S3.4 do [ROADMAP](../../ROADMAP.md). A fatia inteira —
> lista, filtro como lente, paginação, triagem por teclado e todos os estados —
> não cabe em uma fatia. Esta entrega a base ordenada; filtro e teclado ficam
> para a S3.4b.

---

## Objetivo

Mostrar os anúncios de um projeto em lista ordenada e estável, **sem tratar o
desconhecido como ruim**.

## A decisão de arquitetura desta fatia

Depois da S3.3a, a maioria dos anúncios vai sair `NAO_RANQUEAVEL` — 65,6% dos
segmentos estão em `AMOSTRA_INSUFICIENTE` e ~5% dos custos são indeterminados.

**Item sem lastro não é item ruim. É item desconhecido.** Ordená-lo junto com os
demais, no fim da lista, comunica ao usuário que ele é a pior oportunidade — o
que é falso e é exatamente a mentira que os invariantes existem para impedir
([SUCESSAO §2.1](../team/SUCESSAO-SEM-ARQUITETO.md)).

Então a lista tem **dois grupos declarados**:

1. **Ranqueáveis** — custo `known` e segmento com amostra suficiente. Ordenados
   pelo desconto sobre a referência.
2. **Sem lastro** — grupo próprio, rotulado, com o motivo por item (custo
   indeterminado, amostra insuficiente, ou ambos). **Nunca** ordenado por
   desconto, nunca misturado ao primeiro, nunca escondido.

O segundo grupo não é rodapé de vergonha: é onde mora quase todo o acervo hoje,
e o usuário precisa poder olhá-lo.

## Pronto quando

1. A lista de um projeto devolve os dois grupos, cada item do primeiro com o
   desconto e a conta aberta, cada item do segundo com o motivo da recusa.
2. A ordenação do primeiro grupo é **honesta**: por desconto sobre a referência,
   custo total, preço ou novidade — nunca por um campo chamado "oportunidade",
   que não existe ([interface.md §3.4](../interface.md)).
3. **Paginação estável**: a página corre sobre um snapshot ordenado; item novo
   que chega **não reordena** o que está sob o dedo do usuário. O que chegou
   aparece como aviso no topo, no formato "+N novos", não injetado na lista.
4. Existem, e são distinguíveis, os estados obrigatórios de
   [interface.md §10](../interface.md): vazio inicial, vazio por filtro,
   carregando primeira página, coletando ao vivo, e **parcial** — nunca fingir
   sucesso total quando uma fonte falhou.
5. O usuário alcança tudo isso pela tela de projeto que já existe.

Evidência de fechamento: **integração local** contra o acervo real (698 anúncios,
1126 observações). **Não exige chamada nova ao eBay.**

## Contrato

- Reusa o transporte de listings da S3.3a. **Não reimplemente** custo, mediana
  nem desconto, e não altere o contrato dessas três funções.
- O agrupamento é derivado do estado que já vem no transporte, não recalculado
  na tela.
- Snapshot de ordenação identificado e estável entre páginas; a resposta declara
  sobre qual snapshot pagina.
- Dinheiro em inteiro menor com moeda explícita; comparação só dentro da mesma
  moeda.
- Estado parcial carrega **qual** fonte falhou e por quê.

## Fora de escopo

- **Filtro como lente e triagem por teclado** → S3.4b.
- Dossiê, inventário, favoritar → S3.5.
- Agente conversacional → S3.6. Exportação → S3.7.
- Score de oportunidade, `MLR`, `ROI`, `P_max` e qualquer coisa chamada margem.
- Câmbio, rotas além de `US → US`, componentes de custo novos.
- Monitores, "Hoje", alertas → S10.
- Qualquer coisa de Gemini.

## Orçamento de diff

**Até 320 linhas; acima disso, quebre antes de começar**
([SUCESSAO §3.1](../team/SUCESSAO-SEM-ARQUITETO.md)). Nunca corte teste para
caber. Se o teto colidir com entregar um caminho que o usuário alcança, entregue
o caminho e diga no relatório que estourou.

## Onde pode dar errado

- **A pressão para afrouxar vem da tela, e vai parecer razoável.** Com o primeiro
  grupo quase vazio, alguém vai propor baixar o mínimo de observações, alargar a
  janela, ou "só desta vez" ordenar tudo junto. Isso é proibido, e a proporção
  precisa ser registrada e levada ao Caio em vez de ajustada
  ([SUCESSAO §2.2](../team/SUCESSAO-SEM-ARQUITETO.md)).
- **Desconto grande é sinal de anúncio ruim.** O acervo é majoritariamente
  `for parts`; item muito abaixo da mediana provavelmente está quebrado de um
  jeito que a mediana não captura. A lista mostra distância da referência, não
  oportunidade — e o texto na tela precisa dizer isso, ou o usuário compra lixo
  achando que achou barganha.
- **Mediana é preço de pedido, não de venda.** Herdado da S3.2a e sem conserto
  sem dado de transação.
- **Paginação estável é fácil de quebrar sem ninguém notar** — só aparece quando
  há coleta ativa durante a navegação. Se não der para exercitar isso em
  integração local com dado real, diga no log que não foi provado, em vez de
  afirmar que está estável.
- **Dois grupos podem virar duas listas desconexas.** Se o usuário não entender
  por que um item está no segundo grupo, o rótulo falhou — e o motivo por item
  é o que impede isso.
