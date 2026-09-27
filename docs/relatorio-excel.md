# Relatório do evento em Excel

Decidido com o Pedro em 27/09/2026: relatório **só para uso interno da Efic**, **só em Excel**, com as respostas individuais anônimas (para cruzar perguntas) e **todas** as respostas abertas, com a situação de cada uma.

## Onde

Página do evento → seção "Sala ao vivo" → **Baixar relatório (Excel)**. Rota `/painel/evento/<id>/relatorio`, só com login; o instrutor baixa os próprios eventos, o admin qualquer um.

## Abas

1. **Evento** — nome, cooperativa, datas, código interno, participantes que responderam, número de perguntas, data e hora da geração.
2. **Resumo** — por pergunta e rodada, na ordem dos blocos:
   - múltipla escolha: quantidade e % por opção;
   - escala e número: média, mediana, referência (se houver) e quantidade por valor;
   - ordenar: posição média de cada item (1 = primeiro) e quantas vezes ficou em 1º;
   - nuvem: palavras juntadas como no telão (singular/plural, acentos), com a quantidade;
   - aberta: quantas aprovadas, recusadas e pendentes;
   - pergunta nunca respondida: "Sem respostas".
3. **Respostas** — uma linha por resposta: bloco, nº, pergunta, tipo, rodada, participante, resposta em texto, situação (abertas) e horário de Brasília.
4. **Por participante** — uma linha por participante e uma coluna por pergunta (e rodada), para cruzar respostas.

## Anonimato

"Participante 17" é um número dado pelo banco, na ordem em que cada celular entrou na sala, contando só quem respondeu algo. Não sai nome, e-mail nem qualquer identificador interno (função `relatorio_respostas`, 0025, com teste no `isolamento.sql`).

## Pronto quando

- [ ] 0025 rodada ("OK: 0025 aplicada") e teste de isolamento passando.
- [ ] O botão baixa o arquivo do evento P895 e ele abre no Excel com as quatro abas.
- [ ] Os números do Resumo batem com o que o telão mostrou.
