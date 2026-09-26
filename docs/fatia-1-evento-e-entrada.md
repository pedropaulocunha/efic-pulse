# Fatia 1 — Evento e entrada

Objetivo: você cria um evento no painel, importa a lista de inscritos, e o participante entra pelo celular com o código do evento e o e-mail, ou pelo QR code. Ao entrar, ele vê uma tela de espera. As atividades chegam na fatia 2.

Pré-requisito: fatia 0 concluída e publicada.

## Decisão de arquitetura desta fatia

Participante **não** é usuário do Supabase Auth. Ele não tem senha nem conta; é uma inscrição num evento. Por isso:

- A sessão do participante é própria do Pulse: um cookie `pulse_participante` (httpOnly, secure, sameSite=lax) com um token aleatório de 32 bytes. O banco guarda só o hash SHA-256 do token.
- Tudo o que o participante lê ou grava passa pelo servidor do Pulse, que usa a chave secreta do Supabase e confere a inscrição antes de cada operação. O navegador do participante nunca fala direto com as tabelas.
- **Ação do Pedro:** copiar a chave `sb_secret_` do painel do Supabase (Project Settings → API Keys) e colar ele mesmo no `.env.local` como `SUPABASE_SECRET_KEY`, e na Vercel com o mesmo nome, nos três ambientes. A chave nunca entra no chat nem no código.

## Banco

**eventos** ganha:
- `codigo_acesso` (4 caracteres do alfabeto `23456789ABCDEFGHJKMNPQRSTUVWXYZ`, sem 0, O, 1, I, L), com CHECK por expressão regular e índice único parcial onde `estado <> 'encerrado'`.
- `projecao_token` (texto aleatório longo, único), já criado aqui e usado na fatia 2.

**sessoes_participante**
- `id`, `inscricao_id`, `token_hash` (único), `criado_em`, `expira_em` (fim do evento + 1 dia), `ultimo_acesso`

**tentativas_entrada**
- `id`, `ip_hash`, `sucesso` (boolean), `criado_em`
- Depois de 10 tentativas sem sucesso em 15 minutos pelo mesmo IP, a entrada responde "Muitas tentativas. Espere alguns minutos."

As duas tabelas novas ficam com RLS ligada e **sem nenhuma política**: só o servidor, com a chave secreta, acessa. Acrescentar ao teste de isolamento que um instrutor autenticado não lê nenhuma das duas.

## Telas do instrutor

- **Painel:** lista de eventos do instrutor com botão "Novo evento".
- **Novo e editar evento:** cooperativa (escolher ou criar na hora), nome da turma, datas, local, duração em minutos, tema. O código interno AAAAMMDD-n e o código de acesso são gerados sozinhos. Botão "Gerar outro código de acesso".
- **Inscritos do evento:** lista com nome, e-mail, cargo, agência e origem. Os que se cadastraram na sala aparecem marcados "não inscrito", com botão "Confirmar".
- **Importar inscritos:** planilha CSV com as colunas `Nome;Email;Cargo;Agencia`, separadas por ponto e vírgula, com acento (UTF-8). Prévia antes de gravar, linha a linha: nova pessoa, pessoa já existente, já inscrita ou erro (e-mail inválido, nome vazio). O e-mail vale sempre em minúsculas e sem espaços. Uma pessoa já existente é reaproveitada pelo e-mail.
- **QR code do evento:** tela grande, para projetar, com o QR code apontando para `https://pulse.efic.com.br/?c=<código>`, o código em letras grandes e o endereço escrito por extenso. O QR é gerado no servidor, como SVG.

## Telas do participante

- **`/` (entrada):** campos "Código do evento" e "Seu e-mail". O código é aceito em minúsculas e convertido. Com `?c=3A5F` no endereço, o código já vem preenchido. A página explica em uma linha: "Suas respostas aparecem para a turma sem o seu nome."
  - Código e e-mail conferem, evento não encerrado: cria a sessão e leva para `/sala`.
  - Evento encerrado: "Este evento já terminou."
  - Não confere: sempre a mesma mensagem, "Código ou e-mail não conferem", para não revelar se o e-mail existe. Abaixo, o link "Não estou na lista" abre nome, cargo e agência e cria a inscrição com origem `cadastro_sala`, não confirmada.
- **Volta ao mesmo aparelho:** quem abre `/` com a sessão válida vai direto para `/sala`, sem digitar nada.
- **`/sala`:** por enquanto, só o topo com o wordmark Efic Pulse e o código do evento, o nome do evento e a mensagem "A próxima atividade aparece aqui sozinha." Link discreto "Sair deste aparelho", que apaga a sessão.

## Wordmark

Provisório, até o Pedro fechar: "Efic" em IBM Plex Sans SemiBold e "Pulse" em IBM Plex Serif Italic, na mesma linha, pelo Google Fonts. Usar no topo do painel, da entrada e da sala.

## Pronto quando

- [x] O Pedro cria um evento e vê o código de acesso gerado.
- [x] A importação de uma planilha de teste com 5 pessoas mostra a prévia correta e grava.
- [x] Pelo celular, com código e e-mail da lista, entra e vê a sala de espera.
- [x] Fechando e reabrindo o navegador do celular, entra direto, sem digitar.
- [x] Pelo QR code projetado, o código já chega preenchido.
- [x] E-mail fora da lista mostra a mensagem neutra; o cadastro "não estou na lista" aparece no painel marcado para confirmar.
- [x] Onze tentativas erradas seguidas bloqueiam a entrada por alguns minutos.
- [x] O teste de isolamento continua passando, com os casos novos.
- [x] `git grep sb_secret_` não acha nada.

## Fora desta fatia

Atividades, respostas, tempo real, telas de controle e projeção. Tudo isso é a fatia 2.
