# Consolidado por IA de uma pergunta da biblioteca

Pedido do Pedro: dentro de cada pergunta do modelo, um consolidado das respostas de todas as turmas, com a opção de
comparar um grupo de eventos com os outros do período.

## Decisões

- Vale, por ora, para **texto livre** e **nuvem**. Múltipla, seleção, escala e número virão depois, sem IA (contagem direta).
- **Grupo A** = um ou mais eventos marcados. **Grupo B** = todos os outros eventos do período, menos os marcados.
  Sem nada marcado, a tabela mostra só a coluna Geral.
- A IA define **um único conjunto de temas** (5 a 8, mais Outros) para todas as turmas, e classifica cada resposta
  (texto livre) ou cada palavra (nuvem). Quem conta é o Pulse: % das **pessoas** de cada grupo com algum item no tema.
  Uma pessoa pode estar em mais de um tema, então a soma passa de 100%.
- A IA escreve uma síntese curta do conjunto. Não há parágrafo comparativo: a comparação fica só na tabela.
- Diferença de 10 p.p. ou mais destaca a linha (fundo e seta ▲/▼, além da cor).
- Nada vai para o telão.
- Só o admin vê e gera o consolidado.

## Como funciona

- Tabela `consolidados` (0036): uma linha por pergunta do modelo com período (`de`, `ate`, pela data de início do
  evento), síntese, temas e o `mapa` chave → número do tema (0 = Outros).
- `consolidado_respostas(pergunta, de, ate)` devolve eventos e respostas da rodada 1 que não foram tiradas do mural.
  Na nuvem, saem as palavras vazias, bloqueadas e as ocultas pelo instrutor. Não devolve quem respondeu.
- **Gerar** (ou gerar de novo) troca os temas. **Classificar novas** coloca nos temas atuais só o que chegou depois,
  sem mudar os temas nem a comparação.
- O instrutor-admin pode renomear um tema sem chamar a IA.

## Telas

- Página do modelo: botão **Consolidado** nas perguntas de texto livre e nuvem já usadas em eventos.
- `/painel/biblioteca/[id]/pergunta/[perguntaId]/consolidado`: período e geração, síntese, aviso de respostas novas,
  marcação do grupo A, tabela Tema × grupos com exemplos de cada tema.
