# Auto-cura

> Manter o sistema de pé sozinho. A expressão junta duas coisas muito diferentes,
> e confundi-las é como se cria um sistema que se destrói sozinho com testes
> verdes.
>
> Fatias: **S8** (substrato) e **S9.1–S9.3** (agente).

---

## 1. As duas metades

|                 | O que é                                                                                         | Risco                        |
| --------------- | ----------------------------------------------------------------------------------------------- | ---------------------------- |
| **Resiliência** | o sistema se recupera sem ninguém: retry, backoff, circuit breaker, troca de camada, degradação | baixo                        |
| **Correção**    | alguém muda o código para acompanhar a mudança da fonte                                         | **alto quando automatizado** |

A maior parte de "o sistema caiu" é a primeira. Fonte lenta, 429, sessão
expirada, timeout, pico de fila — nada disso precisa de IA. **Resolver a primeira
metade bem elimina a maioria dos incidentes e é pré-requisito da segunda.**

---

## 2. Nível 0 — resiliência sem IA

Nenhum agente envolvido. É engenharia comum, e é o que mais rende:

- retry com backoff exponencial e teto, distinguindo transitório de permanente
  (já existe na coleta);
- **circuit breaker por fonte e por camada** — para de bater em quem está caído;
- **failover de camada na cascata**: HTML falhou → tenta endpoint JSON → tenta
  navegador, registrando a degradação;
- rate limit próprio antes de tomar 429 (já existe para eBay via Durable Object);
- DLQ com alerta e procedimento de replay;
- **degradação declarada**: cota de IA esgotada deixa o item na camada atual e a
  UI mostra "142 aguardando análise" — não é erro;
- fonte indisponível **nunca** aparece como sucesso na interface.

---

## 3. O substrato de observabilidade

Sem isto, agente nenhum tem o que ler. Precisa existir **antes** da S9.

| Peça                                                                                                                                             | Estado                                  | Para quê                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Log estruturado e correlacionado (`run_id`, fonte, camada, tentativa)                                                                            | parcial (telemetria sanitizada do eBay) | reconstruir o que aconteceu                                                                      |
| Health semântico por fonte: `NORMAL`, `LOGIN_REQUIRED`, `CAPTCHA`, `EMPTY_RESULTS`, `RATE_LIMITED`, `ERROR`, `MODAL_BLOCKING`, `CONTENT_CHANGED` | **existe** (F0)                         | diagnóstico, não só "deu erro"                                                                   |
| Raw store endereçado por conteúdo (R2)                                                                                                           | **existe**                              | comparar o payload de ontem que funcionava com o de hoje que quebrou                             |
| **Sonda canário por fonte**                                                                                                                      | ❌                                      | busca conhecida com resultado esperado, rodando periodicamente — detecta quebra antes do usuário |
| **Orçamento de erro por fonte**                                                                                                                  | ❌                                      | taxa de sucesso abaixo do limiar abre incidente automaticamente                                  |
| Trilha de auditoria de ações de agente                                                                                                           | ❌                                      | toda proposta, replay e merge registrados                                                        |
| Gate verificável no CI                                                                                                                           | **existe** (`.github/workflows/ci.yml`) | agente não pode auto-reportar sucesso                                                            |

A sonda canário é a peça que falta e é a mais importante: é ela que transforma
"o Caio percebeu que não vem nada da OLX" em "o sistema abriu um incidente às
3h47 e já tem diagnóstico".

---

## 4. Os três níveis de autoridade do agente

### Nível 1 — Diagnóstico autônomo (autorizado)

O agente lê logs, health, eventos e o **diff entre o raw de ontem e o de hoje**,
classifica a falha (parser, rede, auth, proxy, semântica, fonte) e escreve um
relatório com evidência e uma proposta de correção com fixture.

**Não toca em código.** Saída é texto e um patch proposto.

### Nível 2 — Correção com canário e aprovação (autorizado com gate)

O agente aplica a correção **em sandbox**, roda as fixtures gravadas — incluindo
o raw antigo, que precisa continuar passando —, executa canário em fração pequena
do tráfego e mede. Rollback automático em qualquer regressão.

**Merge exige aprovação humana.** O gate do CI roda no servidor, não na máquina
do agente.

### Nível 3 — Autonomia estreita (excepcional)

Correção aplicada sem humano, permitida apenas quando **todas** forem verdadeiras:

- a mudança está em arquivo de uma **whitelist explícita** (mapeamento/seletor de
  um connector);
- existe fixture reproduzindo a falha **e** fixture antiga que continua passando;
- o gate completo do CI passou;
- o canário rodou e a taxa de sucesso voltou ao normal;
- rollback é automático e testado;
- a ação inteira está na trilha de auditoria e notificada.

Fora dessa faixa, autonomia total é proibida.

---

## 5. O que o agente nunca pode tocar

Whitelist, nunca blacklist. Fora da lista permitida, é recusa:

- **testes** — apagar ou afrouxar teste é o modo de falha mais comum de agente
  autônomo, e converte quebra real em suíte verde;
- **migrations** e schema de banco;
- **regras de segurança**: RLS, autenticação, verificação de assinatura, política
  de credencial;
- **política de custo e valuation** — mexer aqui muda decisão de compra;
- **credenciais, variáveis de ambiente e segredos**;
- **limites de taxa e orçamento** — um agente que aumenta o próprio limite para
  "resolver" o 429 é um incidente, não uma cura;
- **qualquer coisa que execute ação vinculante.**

---

## 6. A cadeia de ataque que justifica tudo isso

Este sistema ingere texto hostil por natureza. A cadeia é real:

```
descrição de anúncio maliciosa
  → entra no payload coletado
    → aparece no log ou na mensagem de erro
      → entra no contexto do agente de manutenção
        → o agente escreve código
```

Por isso, além da whitelist:

- o agente de manutenção recebe **evidência sanitizada**, nunca payload cru sem
  envelopamento;
- conteúdo coletado nunca é interpretado como instrução, nem dentro de log;
- o agente não tem credencial de produção, não faz deploy e não lê segredo;
- toda saída dele passa pelo mesmo gate que uma pessoa passaria.

---

## 7. O ciclo completo

```
sonda canário falha  ou  orçamento de erro estourado
        ↓
incidente aberto automaticamente, fonte marcada como degradada
        ↓
Nível 1: agente diagnostica — classe da falha + diff do raw + proposta com fixture
        ↓
Nível 2: sandbox → fixtures (antiga e nova) → canário → medição
        ↓
aprovação humana  (ou Nível 3, se dentro da faixa estreita)
        ↓
merge → CI → deploy → sonda volta a verde → incidente fechado
        ↓
tudo registrado na trilha de auditoria
```

Meta honesta: **detectar em minutos, diagnosticar em minutos, corrigir com um
clique.** "Corrigir sozinho em minutos" é objetivo de longo prazo para a faixa
estreita — não a promessa inicial.

---

## 8. Onde isto pode dar errado

- **Agente que pode mexer em teste sempre acaba mexendo.** É o comportamento
  observado com mais frequência: diante de um teste vermelho, o caminho mais
  curto é apagá-lo. Por isso teste está fora da whitelist, e o gate roda no CI.
- **Correção silenciosamente errada é pior que quebra.** Se a fonte passou a
  incluir frete no preço e o agente "conserta" o parser para bater com o novo
  formato, os testes ficam verdes e todo o valuation fica errado. Mitigação:
  fixture antiga tem que continuar passando, e mudança de **significado** exige
  humano.
- **Canário em volume baixo não mede nada.** Com 4 itens por run, 10% de canário
  é zero item. A auto-cura só funciona depois que houver volume.
- **Auto-cura vira desculpa para não entender a fonte.** Se toda quebra é
  "resolvida" pelo agente, ninguém aprende o comportamento da fonte e a dívida
  cresce escondida.
- **O CI nunca rodou.** O workflow existe, mas o repositório acabou de ganhar
  Git e não tem remoto. Antes de confiar em gate automático, ele precisa rodar de
  verdade pelo menos uma vez.
- **Sonda canário custa chamadas.** Numa fonte com quota apertada, monitorar
  consome o orçamento que seria do garimpo. Precisa de frequência calibrada, não
  de polling agressivo.
