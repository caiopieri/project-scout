# HANDOFF-S1.3 — Tela de execução

> Depende de [S1.1](./HANDOFF-S1.1.md). Ler antes:
> [interface.md](../interface.md) §3 e §10.

## Objetivo

Tornar a coleta visível. Sistema invisível é sistema que ninguém percebe que
quebrou — e o funil é, ao mesmo tempo, o painel de operação do núcleo.

## Pronto quando

Durante e depois de uma coleta real, a tela mostra:

1. **O funil**: total descoberto → quantos sobraram em cada camada, com o motivo
   agregado do que caiu ("142 fora por título", "38 fora por preço").
2. **Estado por fonte**: coletando, ok com contagem, degradada com motivo, ou
   indisponível. Fonte que falhou **nunca** aparece como sucesso.
3. **Custo**: chamadas gastas e posição no orçamento.
4. **Progresso ao vivo**: os números atualizam durante a execução, sem recarregar
   a página.
5. Os estados obrigatórios de [interface.md §10](../interface.md): vazio inicial,
   carregando, parcial, degradado.

Evidência exigida: **integração local** no mínimo; **live** se a execução usar
credencial real.

## Contrato

- A tela lê o que já existe: `collection_runs`, `observation_events` e as
  decisões de triagem persistidas. **Não inventar telemetria nova** antes de usar
  a que existe.
- Atualização por polling simples é aceitável nesta fatia. Streaming é otimização
  posterior, não requisito.
- Nenhuma decisão de produto nova: sem score, sem ranking, sem filtro. Isso é o
  Round 3.
- O componente de funil deve ser reutilizável pelo Workspace depois — mas sem
  criar abstração antes do segundo uso existir.

## Caminho de usuário

`apps/web` → projeto → disparar coleta → a tela mostra a execução acontecendo até
terminar.

## Fora de escopo

- Cards ranqueados, filtros e comparação (Round 3).
- Tela "Hoje" e monitores (S10).
- Página de fontes & saúde (S8) — aqui é só o estado da execução corrente.

## Onde isto pode dar errado

- **Com 4 itens por run, o funil vai parecer bobo**: "4 descobertos, 3
  sobraram". O valor só aparece quando o volume subir, depois da quota medida.
  Não aumentar volume só para a tela ficar bonita.
- **Polling frequente contra o Worker custa.** Definir intervalo e parar quando o
  run terminar.
- **Mostrar motivo agregado exige que a triagem registre motivo.** Se hoje ela
  não registra, esta fatia depende de acrescentar o campo — ou de mostrar menos
  do que o desenho promete. Verificar antes de prometer.
- **"Ao vivo" cria expectativa de tempo real** em fontes que levam minutos. A tela
  precisa deixar claro que está esperando a fonte, não travada.
