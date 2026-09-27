# Ajuste — blocos e entrada só com código

Decidido com o Pedro em 27/09/2026, antes da fatia 4.

## 1. Blocos

Um evento pode ter várias partes (ex.: Abertura com 4 perguntas, Estudo de caso 1 com 6, Estudo de caso 2 com 5, Encerramento com 3). Cada parte é um **bloco**: um grupo de atividades com título. ("Módulo" fica reservado para os grupos de destaques da fatia 4.)

- Tabela `blocos` (`evento_id`, `ordem`, `titulo`), com RLS igual à das atividades. `atividades.bloco_id` é opcional; o banco só aceita bloco do mesmo evento.
- Ordem na tela: primeiro as atividades sem bloco, depois cada bloco na ordem dele. A numeração das atividades é corrida (1 a 18), atravessando os blocos.
- **Painel do evento:** "Novo bloco"; em cada bloco, "+ Atividade", ↑ ↓, Renomear e Excluir. As setas das atividades atravessam blocos: na ponta de um bloco, a atividade passa para o bloco vizinho (inclusive um bloco vazio).
- Excluir um bloco: veja a revisão abaixo (só bloco vazio).
- **Formulário da atividade:** campo "Bloco" (aparece quando o evento tem blocos).
- **Controle:** a lista da esquerda mostra o título de cada bloco.
- Celular e telão não mudam: uma pergunta por vez.

### Revisão de 27/09/2026 (migração 0024)

- **Toda atividade pertence a um bloco.** O banco exige; as que estavam sem bloco foram para um bloco "Geral", no topo de cada evento que tinha alguma.
- Sem blocos no evento, o botão "Nova atividade" some e a tela pede para criar um bloco primeiro.
- **Mudar de bloco:** campo "Bloco" em cada atividade da lista (vale também para atividade já aberta ou encerrada; vai para o fim do bloco escolhido). As setas continuam atravessando blocos, mas não há mais "sem bloco".
- **Duplicar atividade:** cópia fechada, sem respostas, logo abaixo da original, com "(cópia)" no fim da pergunta.
- **Duplicar bloco:** bloco "(cópia)" logo abaixo, com cópias fechadas de todas as atividades.
- **Excluir bloco** só quando ele está vazio (o banco também confere).

## 2. Entrada só com o código

O participante entra só com o código do evento (ou pelo QR code, que já traz o código). Sem e-mail, sem nome: as respostas são anônimas.

- Cada celular que entra vira uma inscrição de origem `anonima`, sem pessoa. As respostas continuam uma por celular; mudar a resposta substitui a anterior.
- Função `sala_entrar_codigo` (0022), só para o servidor: limite de tentativas por IP (o mesmo de antes), evento pelo código, prazo, teto e sessão, numa chamada.
- **Prazo:** o código vale até 23h59 (Brasília) do último dia do evento, ou até o instrutor tocar em "Encerrar evento", o que vier primeiro. Evento de vários dias: não encerre no fim de cada dia; o celular de quem entrou continua dentro até o dia seguinte ao último dia.
- **Teto:** 150 participantes por evento.
- QR code de outro evento num celular que já está numa sala: mostra a entrada do evento novo.
- **Contador do controle:** "X respostas de N na sala" (N = celulares que entraram).
- Saíram do site: a entrada por e-mail, o "Não estou na lista", a importação de inscritos e a lista de inscritos do painel.

## Banco (rodar nesta ordem no SQL Editor)

1. `0021_inscricao_anonima.sql` — inscrição sem pessoa (muda o CHECK de origem).
2. `0022_entrada_so_codigo.sql` — `sala_entrar_codigo` e `sala_estado` aceitando participante anônimo.
3. `0023_blocos.sql` — tabela `blocos`, `atividades.bloco_id`, `mover_atividade` e `mover_bloco`.
4. `supabase/tests/isolamento.sql` inteiro.

As migrações funcionam com o site antigo no ar; o site novo só é publicado depois delas.

## Depois (etapa separada, regra 4)

Quando a entrada nova estiver confirmada numa turma: migração que remove a função `sala_entrar` antiga (com e-mail) e decide o destino da tabela `pessoas` e das inscrições de lista antigas. Nada disso é apagado agora.

## Pronto quando

- [ ] 0021, 0022 e 0023 rodadas, cada uma terminando em "OK: 002x aplicada".
- [ ] Teste de isolamento passa.
- [ ] Pelo celular, com o QR code, entra na sala com um toque em "Entrar", sem digitar nada.
- [ ] Código errado mostra "Código não encontrado"; evento encerrado mostra "Este evento já terminou."
- [ ] No painel, criar dois blocos, pôr atividades neles, reordenar com as setas (inclusive passando de um bloco para outro), renomear e excluir um bloco.
- [ ] No controle, os títulos dos blocos aparecem na lista, e o contador mostra "de N na sala".
- [ ] Teste de carga (k6) com 40 participantes continua abaixo de 1 s.
