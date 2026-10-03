# Mural das respostas de texto livre

Decidido com o Pedro em 03/10/2026.

## Liberação (0033)

- A resposta de texto livre entra no mural na hora. O instrutor pode **tirar do mural** e **devolver**.
- Tirada do mural continua fora mesmo se a pessoa editar o texto.

## Paginação e filtro (0034)

- **6 respostas por página**, em ordem de chegada (as páginas não pulam quando chega resposta nova).
- **Automático:** o telão troca de página sozinho a cada 15 s, em ciclo. Ao tocar em **Anterior** ou **Próxima** no controle, a página fica com o instrutor; **Voltar ao automático** devolve.
- **Filtro por palavra:** o instrutor digita no controle; o telão mostra só as respostas que contêm a palavra (sem diferença de maiúsculas e acentos), com "Filtro: "prazo" · 7 respostas". **Limpar filtro** volta a mostrar todas. O filtro volta para a página 1.
- O telão mostra "Página 2 de 5" quando há mais de uma página. O rodapé conta todas as respostas recebidas.

## Resumo por IA (0034)

- **Síntese + temas:** um parágrafo curto (2 a 3 frases) e de 3 a 6 temas, cada um com uma resposta de exemplo.
- A IA classifica resposta por resposta; **o Pulse conta as pessoas** de cada tema, só entre as respostas no mural (tiradas do mural não contam). O que a IA não encaixou vai para "Outros".
- O **filtro não muda o resumo**: ele sempre considera todas as respostas no mural.
- Revisão antes do telão: renomear tema, gerar de novo; **Mostrar resumo no telão** troca o mural pelo resumo; **Voltar para o mural** desfaz.
- Vai para a OpenAI só o texto das respostas, com números curtos no lugar dos ids internos.

## Banco

- `atividades`: `mural_filtro`, `mural_pagina`, `mural_automatico`.
- Tabela `temas_abertas` (síntese, temas com as respostas e o exemplo, `no_telao`), com RLS do instrutor da atividade.
- `respostas_abertas` em ordem de chegada.

## Pronto quando

- [ ] 0033 e 0034 rodadas e teste de isolamento passando.
- [ ] Com mais de 6 respostas, o telão troca de página sozinho a cada 15 s; Anterior/Próxima fixam a página; Voltar ao automático volta a trocar.
- [ ] O filtro mostra só as respostas com a palavra, no telão e na lista do controle.
- [ ] "Resumir com IA" mostra síntese e temas no controle; "Mostrar resumo no telão" troca o mural pelo resumo.
