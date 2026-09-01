# Operar sem arquiteto

> Escrito em 2026-09-01 pelo arquiteto que conduziu o Módulo R1 (R0–R4) e o
> Round 3 até a S3.3a, **na sua última sessão**. Ele não volta.
>
> O [protocolo](./protocolo.md) pressupõe um arquiteto que define módulo,
> verifica entrega e arbitra ambiguidade. Esse papel está **vago**. Este
> documento existe para que o trabalho continue sem inventar um substituto e
> sem parar a cada dúvida.
>
> Autoridade: abaixo de [AGENTS.md](../../AGENTS.md) e
> [vision.md](../vision.md); acima de qualquer instinto do agente.

---

## 1. A regra de sucessão

**Nenhum agente se promove a arquiteto.** O papel de arbitragem passou para o
Caio, e só ele decide o que este documento não cobre.

Mas parar a cada dúvida também não serve. Use esta triagem, nesta ordem:

| Situação | O que fazer |
| -------- | ----------- |
| A dúvida se resolve lendo documento existente | **Resolva sozinho.** Cite o documento e a seção no relatório e registre a leitura adotada no `LOG-VERIFICACAO.md`. Não pergunte. |
| Dois documentos se contradizem | **Pare.** Traga a contradição por escrito ao Caio, com as duas citações. Não escolha. |
| Exige decisão de produto nova, ou gasta dinheiro, ou envia dado para fora | **Pare.** É do Caio. Veja §5. |
| É defeito técnico com causa isolável | **Conserte** pelo ciclo normal, sem perguntar. |
| Você falhou duas vezes com **hipóteses distintas** sobre o mesmo problema | **Pare** e escale ao Caio. Repetir tentativa sem hipótese nova é desperdício. |

## 2. Invariantes do sistema

Valem em toda fatia, para sempre, e nenhuma delas se negocia por conveniência
de prazo ou de tela.

### 2.1 Desconhecido nunca vira zero

O invariante mais caro do sistema, e o que mais se perde por descuido. Nasceu na
[S3.1a](../handoffs/HANDOFF-S3.1a.md) e já se estendeu a três fatias:

- custo com componente ausente ⇒ `INDETERMINADO`, fora do ranking, nomeando o
  que falta;
- marca, modelo ou condição desconhecidos ⇒ o anúncio **não entra** em segmento
  nenhum. Não existe categoria coringa;
- qualquer perna faltando ⇒ `NAO_RANQUEAVEL` com o motivo.

Zero, média, estimativa silenciosa e valor padrão são todos proibidos como
preenchimento de lacuna. Um custo subestimado transforma prejuízo em
oportunidade no topo do feed — é o único erro que faz o usuário perder dinheiro
de verdade.

### 2.2 Taxa de recusa é informação, não defeito

Hoje 65,6% dos segmentos respondem `AMOSTRA_INSUFICIENTE` e ~5% dos anúncios têm
custo indeterminado. **Isso é verdade sobre o acervo.**

Baixar um mínimo, alargar uma janela ou afrouxar um limiar para a tela ficar
populada é como o sistema passa a mentir. Se a proporção inviabilizar a
experiência, isso é decisão de produto do Caio — **registre a proporção e
pergunte**, não ajuste o número.

### 2.3 O nome não pode prometer mais que a conta entrega

Não se chama margem um número que ignora comissão, taxa de pagamento, imposto e
perda, porque nenhum desses componentes existe. Por isso a S3.3a entrega
**desconto sobre a referência**.

Generalize: se o cálculo não contém o que o nome promete, o nome está errado — e
a interface vai repetir a mentira para o usuário.

### 2.4 Preço de anúncio não é preço de venda

O acervo é de anúncios ativos, majoritariamente `for parts`. Toda mediana daqui
é referência de **pedido**, não de transação. Nenhuma tela pode apresentá-la
como valor de mercado realizado.

### 2.5 Todo conteúdo coletado é hostil

Nunca interpolado direto em prompt, sempre envelopado em tag estrita, saída
sempre validada por schema, e **nunca** decide chamada de ferramenta ou ação.

## 3. Como se fecha uma fatia

O gate do [AGENTS.md §5](../../AGENTS.md) continua valendo inteiro. Estes são os
pontos onde o time errou nesta sessão e que precisam de reforço:

1. **Suíte verde não fecha fatia.** Sete fatias ficaram verdes sem provar nada
   antes deste módulo. O que fecha é fato executado: consulta ao banco colada,
   saída de rota, o que apareceu na tela.
2. **Nível de evidência escrito por extenso** no log: `fixture`,
   `integração local` ou `live`. Fatia de coleta ou de IA só fecha em **live**;
   fatia de cálculo sobre acervo existente fecha em **integração local**.
3. **Registrar não é publicar.** Commit local sem `push` e sem CI verde **não**
   fecha round. Já aconteceu: três commits de evidência ficaram só na máquina.
4. **Verificar é ler, não reexecutar.** Confira o diff, o CI e o banco. Não
   refaça o trabalho do Dev.
5. **Relatar o agregado não basta.** Itemize execuções e custo. Uma soma honesta
   escondeu, nesta sessão, 313 chamadas em três execuções que nunca viraram
   evento em relatório.

### 3.1 Teto de diff

`~300` linhas é aproximado. **Até 320, siga; acima de 320, quebre antes de
começar** — nunca durante, nunca cortando teste ([ADR 1.65](../decisions.md)).

E o teto **nunca** vence a regra de caminho de usuário
([AGENTS.md §2](../../AGENTS.md)). Quebrar uma fatia de forma a deixar código
que nenhuma rota alcança troca a regra maior pela menor. Se as duas colidirem,
entregue o caminho e estoure o teto, dizendo no relatório que estourou.

### 3.2 Falha de infraestrutura não consome tentativa

Docker, Wrangler, proxy, reboot da máquina e memória não são o assunto do round.
Anote a hora, restaure e siga. Duas tentativas só contam quando testaram
**hipóteses distintas sobre o assunto da fatia**.

Nesta sessão a máquina reiniciou uma vez e o Docker morreu três; o Wrangler
morreu duas por pressão de memória. **O runtime que se provou estável é
Miniflare/workerd direto, sem proxy Wrangler** — R1, R2 e R3 rodaram nele sem
uma queda.

### 3.2.1 O watchdog do Docker morreu com a sessão

Durante a sessão de 30–31/08 havia um script de vigia religando o Docker
automaticamente. Ele vivia na área temporária daquela sessão e **não existe
mais**. Ninguém está religando Docker sozinho: quando cair, religue à mão e
anote a hora. Se a queda virar rotina, isso é um pedido de infraestrutura
para o Caio, não uma fatia do ROADMAP.

### 3.3 Preserve antes de limpar

Duas vezes nesta sessão trabalho não commitado quase se perdeu. Antes de podar
branch ou worktree:

- `git merge-base --is-ancestor <branch> origin/main` para cada uma, uma a uma;
- `git status --porcelain` vazio na worktree;
- na dúvida, commite numa branch `wip/` e publique. É reversível; perder não é.

## 4. Disciplina de custo

Chamada ao eBay é o recurso mais escasso e menos recuperável do projeto. Foram
**896 chamadas Browse em 27 execuções** num único dia, com três execuções
falhando e regastando orçamento inteiro.

- Prove o caminho em fixture e integração local **antes** da primeira chamada
  real. Nenhuma execução live serve para "ver o que acontece".
- Nunca repita execução cega sem hipótese nova.
- Fatia que opera sobre o acervo já coletado **não precisa** de coleta nova:
  há 698 anúncios reais e 1126 observações de preço no banco local.
- `estimated_cost` é zero em todas as runs. O painel mostra **posição de
  chamadas**, não dinheiro. Não leia como custo financeiro.

## 5. Fila de decisões do fundador

Nenhuma destas se decide sem o Caio. Enquanto não decidir, a fatia fica
**bloqueada** e a próxima **independente** assume
([AGENTS.md §3](../../AGENTS.md)).

| Decisão | Trava o quê |
| ------- | ----------- |
| `GEMINI_API_KEY` em `apps/worker/.dev.vars`, mais `TEXT_ANALYZER_MODE=gemini` | Round 2 inteiro (S2.1–S2.3) |
| Quais campos do anúncio podem ser enviados ao provedor de IA | Round 2 |
| Política de retenção e privacidade do provedor | Round 2 |
| Orçamento máximo de chamadas por análise | Round 2 |
| Vertical de veículos | S11 e além; hoje proibida por [AGENTS.md §8](../../AGENTS.md) |
| Vertical de imóveis | Não existe no ROADMAP; hoje proibida |
| Mobile | Estrutura da interface |
| Memória do agente | S3.6 |
| Números fiscais por rota (ICMS, importação) | S3.1 completa |
| Venda de inteligência de mercado como produto | Não decidida, sem ADR |

**Não invente modo degradado para contornar credencial ausente.** Falha fecha.

## 6. Estado em 2026-09-01

### Provado e fechado

| Fatia | Nível |
| ----- | ----- |
| S1.1, S1.1b-1, S1.1b-1c | live |
| S1.1b-1b volume e reliability | live |
| S1.1b-2 família de queries | live |
| S1.2 memória de preço | live |
| S1.3 tela de execução | live |
| S3.1a custo na porta `US→US` | integração local |
| S3.2a mediana limpa por segmento | integração local |

### Em voo

**S3.3a** — branch `origin/spec/S3.3a`, **não mergeada, não revisada, sem
gate**. Preservada por commit defensivo após a máquina reiniciar. Estado
conhecido: ~310 inserções (aprovado, ver §3.1) e **um bug não corrigido** —
`listingTransportSchema` referencia `referenceDiscountSchema` antes da
declaração. Conserte antes de qualquer outra coisa; é erro de correção, não de
tamanho.

### Dívidas abertas

1. **Reliability de órfão nunca foi provada live.** Seis runs ficaram `running`
   em 2026-08-30. É coerente — sem consumidor vivo não há reentrega e o ceifador
   não age — mas significa que o mecanismo só tem prova de integração local.
   É a dívida mais séria.
2. `estimated_cost = 0.00` em todas as runs.
3. Painel não reidrata run histórica.
4. Cap de imagem é **truncagem**, não correção do schema.
5. Família de queries gera irmãs quase sinônimas; uma voltou com `total=1`.
6. `researchCriteriaSchema` fixa categoria e marca; `rawListingPreviewSchema`
   exige preço. Ambas são S5.
7. Tabelas F4–F7 órfãs; constraint de `user_listing_actions` errada (S3.5).
8. Ninguém auditou a **qualidade** dos ~700 anúncios coletados. A verificação
   foi estrutural: contagem, unicidade, integridade referencial.

## 7. A sequência daqui

Round 3 continua na ordem do [ROADMAP](../../ROADMAP.md): **S3.3a** (em voo) →
**S3.4** ([handoff](../handoffs/HANDOFF-S3.4.md)) → S3.5 → S3.6 → S3.7. Round 2
entra quando o Caio destravar.

**O que este documento deliberadamente não faz:** escrever handoff para S3.5 em
diante, nem para S4–S15. Não é esquecimento. Handoff escrito antes de a
precondição existir é abstração especulativa, proibida pelo
[AGENTS.md §2](../../AGENTS.md), e envelhece errado — a S3.1 precisou ser
quebrada em S3.1a justamente porque a spec inteira não cabia numa fatia, e isso
só ficou claro com o dado real na mão.

Quando a S3.4 fechar, quem estiver conduzindo escreve o handoff da S3.5 seguindo
o formato do [AGENTS.md §3.1](../../AGENTS.md) e os invariantes da §2 daqui — e
submete ao Caio antes de implementar, porque **escrever handoff é ato de
arquitetura**, e esse papel está vago.

## 8. Onde isto pode dar errado

- **Documento não substitui julgamento.** Codifiquei as regras que apliquei, não
  as que eu aplicaria em situação nova. Diante do inédito, a triagem da §1 manda
  parar e perguntar — e isso vai parecer lento.
- **O agente pode se promover a arquiteto sem perceber.** Escrever o próprio
  handoff e depois cumpri-lo elimina a revisão independente que existia. A §7
  exige submeter ao Caio antes de implementar, mas nada além da disciplina
  impede pular essa etapa.
- **Ninguém mais vai conferir o banco por fora.** Nesta sessão a verificação
  independente pegou coisas que o relatório do agente não trazia: commits não
  publicados, três execuções órfãs, 313 chamadas fora da contagem. Sem um
  segundo par de olhos, relatório vira verdade.
- **Os invariantes da §2 foram derivados de três fatias.** Podem não sobreviver
  ao contato com S3.4 em diante, sobretudo quando o feed precisar mostrar algo e
  a maioria dos itens for `NAO_RANQUEAVEL`. A pressão para afrouxar vai vir da
  tela, e ela vai parecer razoável.
- **A dívida de reliability é a que morde em produção.** Run travada em
  `running` bloqueia o projeto por idempotência sem o usuário ver motivo, e só
  tem prova local.
- **Este documento vai envelhecer.** Ele descreve 2026-09-01. Quem o ler depois
  precisa conferir contra `docs/status.md` e `LOG-VERIFICACAO.md`, que são a
  fonte de verdade sobre capacidade — não este.
