# Pulse — regras do projeto

Pulse é a plataforma de sala da Efic Soluções para treinamentos presenciais em cooperativas de crédito: perguntas e votações ao vivo no celular dos participantes, casos em rodadas, destaques do instrutor e coleta de casos reais. Endereço: pulse.efic.com.br.

O dono do projeto, Pedro, não é programador. Ele dirige o desenvolvimento e executa os comandos que você indicar. Explique o que cada passo faz em uma frase, sem jargão, e diga sempre como conferir se deu certo.

**Ambiente: Windows.** A pasta do projeto fica em `C:\Users\<usuário>\Documents\efic-pulse`. Todo comando que você pedir para o Pedro rodar deve funcionar no PowerShell. Não use sintaxe de bash (heredoc, `rm -rf`, `export`, `&&` em versões antigas do PowerShell) em instruções para ele.

## Stack fixa

- Next.js (App Router) com TypeScript e Tailwind.
- Supabase: Postgres, Auth, Realtime e Storage, com `@supabase/ssr` e sessão em cookie.
- Vercel para hospedagem, com deploy automático a cada push na branch `main`.
- Região: Supabase em **sa-east-1** e funções da Vercel em **gru1**. Nunca iad1.
- E-mails pelo Resend, remetente no subdomínio `send.efic.com.br`.

Este projeto é separado do Efic Estimador: repositório, projeto Vercel e projeto Supabase próprios. Nada é compartilhado com ele.

## Regras de construção

1. **Trabalhamos em fatias.** Cada fatia tem um briefing em `docs/`. Não adiante nada de fatias futuras sem pedido explícito.
2. **Toda tabela nasce com RLS ligada.** Política nova vem acompanhada de teste no arquivo `supabase/tests/isolamento.sql`, e o arquivo roda inteiro antes de cada commit que mexa em política.
3. **Domínios de valor valem no banco, não só no código.** Toda lista fechada (papel, estado do evento etc.) tem CHECK no Postgres. Ao mudar a lista, mude o CHECK e o código juntos.
4. **Migração e remoção em blocos separados.** Nunca rode drop de coluna no mesmo bloco da migração que a substitui.
5. **Verificação de usuário não confunde erro com logout.** Use sempre `utils/auth.ts` (`usuarioAtual()`), que distingue erro passageiro (sem status, 408, 429, 5xx) de sessão inválida (400, 401, 403), tenta de novo uma vez após 400 ms e devolve `{ user, erro }`. Nunca `if (!user) redirect('/login')` descartando o erro.
6. **Push não é publicação.** Depois de cada push, confira na Vercel, aba Deployments, se o commit tem linha própria com estado Ready.
7. **Build com erro estranho de tipos internos do Next:** apague a pasta `.next` (no PowerShell: `Remove-Item -Recurse -Force .next`) e recompile antes de investigar.
8. **Arquivos são criados e editados por você, com suas próprias ferramentas de edição,** nunca pedindo ao Pedro que cole blocos grandes no terminal. Não edite por intervalo de número de linha. Depois de editar, confira o resultado real abrindo o arquivo, e não pela saída ecoada.
9. **Senhas e chaves nunca em linha de comando nem no chat.** Segredos vão direto no `.env.local` (aberto pelo Pedro num editor) ou nos painéis da Vercel e do Supabase. Chaves de API ficam só em variáveis de ambiente do servidor, sem prefixo `NEXT_PUBLIC_`.
10. **Fim de linha:** o repositório tem `.gitattributes` com `* text=auto eol=lf`, para que arquivos SQL, scripts e configurações não quebrem por causa do CRLF do Windows.
11. **SQL no banco é rodado pelo Pedro** no SQL Editor do painel do Supabase. Você gera os arquivos em `supabase/migrations/` e diz qual colar, em que ordem e o que deve aparecer como resultado. A senha do banco nunca passa por você.

## Vocabulário

Use estes termos em tudo o que o usuário lê (telas, mensagens, e-mails):

- **cooperativa**, **evento**, **inscrito**, **participante**, **instrutor**
- **atividade**, **rodada**, **destaque**, **módulo** (grupo de destaques), **relato**
- **associado** (nunca "cliente" ou "devedor")

Nos identificadores de código e nomes de tabela, use os mesmos termos em português, sem acento e em snake_case.

## Marca e cores

- **Logo:** "Efic" em IBM Plex Serif negrito, traço fino vertical, "Pulse" em IBM Plex Sans normal azul-acinzentado (`#5b82ad`). Sempre pelo componente `components/marca.tsx`.
- **Telão:** cores dos resultados em `lib/paleta.ts`, seis cores em ordem fixa (a opção 1 é sempre petróleo, a 2 sempre coral…), validadas para daltonismo. Não reordene nem troque cor sem passar de novo no validador de paleta.
- **Telão:** pergunta em IBM Plex Serif, azul-petróleo escuro (`#0f4c64`), com linha fina embaixo, e sempre o maior texto da tela. Rodapé discreto e na mesma altura: código à esquerda, quantidade de respostas no centro, logo à direita (sem o endereço). Escala e número: média em violeta (linha cheia), mediana em quase-preto (tracejada), referência em coral. Ordenar sem pontuação. Seleção múltipla: ranking da mais marcada para a menos marcada, em % das pessoas que responderam (a soma passa de 100%). Nuvem de palavras: tamanho pela frequência; cor, família (Geist, Plex Sans, Plex Serif), peso e itálico variam por palavra, sempre o mesmo estilo para a mesma palavra. Timer da pergunta: canto superior direito, ao lado da pergunta; coral nos últimos 10 s; sem som.
- **Telão e prévia usam o mesmo desenho** (`components/tela-projecao.tsx`), com medidas proporcionais à caixa (`cqw`/`cqh`), nunca à tela (`vw`/`vh`). A prévia do controle mostra a atividade selecionada, sempre com o resultado, e fica só no controle (com login): o link da projeção nunca recebe resultado que não foi mostrado.

## Especificação

A especificação completa do produto está em `docs/especificacao.md` quando existir. Em caso de dúvida sobre comportamento, pergunte ao Pedro antes de decidir.

@AGENTS.md
