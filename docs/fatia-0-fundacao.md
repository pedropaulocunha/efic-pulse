# Fatia 0 — Fundação

Objetivo: o Pulse no ar em pulse.efic.com.br, com o login do instrutor funcionando e as tabelas básicas criadas e protegidas. Ainda não há tela para participante nem atividade ao vivo.

## Antes de tudo — programas no Windows

Confira, no PowerShell, se estes comandos respondem com um número de versão:

- `node -v` — precisa ser 20 ou mais novo. Se não houver, instalar o Node.js LTS pelo site nodejs.org.
- `git --version` — se não houver, instalar o Git for Windows pelo site git-scm.com, aceitando as opções padrão.

Se algum dos dois foi instalado agora, feche e abra de novo o aplicativo Claude antes de continuar.

## Parte A — o que o Pedro faz nos painéis (antes do código)

Faça nesta ordem e anote cada valor indicado. Nenhum deles vai para o chat nem para o GitHub.

1. **GitHub:** criar o repositório privado `pedropaulocunha/efic-pulse`, vazio.
2. **Supabase:** criar um projeto novo chamado `efic-pulse`, região **South America (São Paulo) — sa-east-1**. Guardar a senha do banco num gerenciador de senhas. Anotar a Project URL e a chave publishable.
3. **Supabase, Authentication → Sign In / Providers:** manter só e-mail e senha; **desligar "Allow new users to sign up"**. Instrutores são criados pelo painel, não por cadastro aberto.
4. **Supabase, Authentication → SMTP:** usar o Resend, como no Estimador: host `smtp.resend.com`, porta 465, usuário `resend`, senha = uma chave nova do Resend criada só para o Pulse, remetente `nao-responda@send.efic.com.br`, nome "Pulse · Efic".
5. **Vercel:** importar o repositório como projeto novo `efic-pulse`. Em Settings → Functions → Function Regions, marcar **gru1** e desmarcar qualquer outra.
6. **Hostinger, DNS do efic.com.br:** criar o CNAME `pulse` apontando para o valor que a Vercel mostrar ao adicionar o domínio `pulse.efic.com.br`.
7. **Supabase, Authentication → URL Configuration:** Site URL `https://pulse.efic.com.br`; Redirect URLs `https://pulse.efic.com.br/**`, `https://*.vercel.app/**` e `http://localhost:3000/**`.

## Parte B — o que o Claude Code constrói

### 1. Projeto

- Next.js com App Router, TypeScript e Tailwind, na pasta `C:\Users\<usuário>\Documents\efic-pulse`, que já contém `CLAUDE.md` e `docs/`. Crie o projeto dentro dela sem apagar esses arquivos.
- `.gitattributes` com `* text=auto eol=lf` antes do primeiro commit.
- Repositório ligado a `pedropaulocunha/efic-pulse`. Se o Git pedir login do GitHub, a janela de autenticação do Git for Windows resolve pelo navegador.
- `@supabase/ssr` e `@supabase/supabase-js`.
- `proxy.ts` na raiz, só renovando o cookie da sessão, sem redirecionar ninguém.
- `.env.local` com `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, coberto pelo `.gitignore`. As mesmas variáveis na Vercel, nos três ambientes.
- `utils/auth.ts` com `usuarioAtual()`, conforme a regra 5 do CLAUDE.md.

### 2. Banco

Migrações em `supabase/migrations/`, uma por assunto, numeradas na ordem de execução. Todas as tabelas com RLS ligada. Quem roda é o Pedro, colando cada arquivo no SQL Editor do Supabase, na ordem; diga a ele o que deve aparecer como resultado de cada um.

**perfis** — um por usuário do Auth
- `id` (uuid, = auth.users.id), `nome`, `papel` (text, CHECK em `admin`, `instrutor`), `criado_em`
- Sem política de UPDATE para o próprio usuário: ninguém se promove a admin. O perfil é criado por trigger quando o usuário do Auth nasce, com papel `instrutor`.

**cooperativas**
- `id`, `nome`, `uf` (2 letras), `central` (opcional), `criado_em`

**eventos**
- `id`, `cooperativa_id`, `codigo_interno` (AAAAMMDD com sufixo sequencial no mesmo dia, ex. `20261015-1`, único), `nome_turma`, `tema` (texto livre por enquanto), `data_inicio`, `data_fim`, `local`, `duracao_min`, `instrutor_id` (perfis), `estado` (CHECK em `planejamento`, `ao_vivo`, `encerrado`; padrão `planejamento`), `criado_em`, `atualizado_em`
- O código de acesso de quatro caracteres fica para a fatia 1.

**pessoas**
- `id`, `nome`, `email` (guardado em minúsculas, único), `cargo`, `criado_em`

**inscricoes**
- `id`, `pessoa_id`, `evento_id`, `agencia`, `origem` (CHECK em `lista`, `cadastro_sala`), `confirmada` (boolean), `criado_em`
- Único em (`pessoa_id`, `evento_id`).

**Índices** em todas as chaves estrangeiras: `eventos.cooperativa_id`, `eventos.instrutor_id`, `inscricoes.evento_id`, `inscricoes.pessoa_id`.

**Quem vê o quê nesta fatia**
- Admin: lê e escreve tudo.
- Instrutor: lê e escreve só os eventos em que é `instrutor_id`, e as inscrições desses eventos. Lê todas as cooperativas e pessoas; cria cooperativas e pessoas.
- As funções de apoio das políticas (`usuario_e_admin()` e similares) são `STABLE`, `SECURITY DEFINER`, com `search_path` fixado, e falham fechado. Nas políticas, chame-as embrulhadas em `(select ...)`.

**Teste de isolamento** em `supabase/tests/isolamento.sql`, também rodado pelo Pedro no SQL Editor, simulando dois instrutores e um admin com `set request.jwt.claims` dentro de transação com rollback:
- instrutor A não lê evento nem inscrição do instrutor B;
- instrutor A não cria evento com `instrutor_id` de B;
- instrutor não altera o próprio papel;
- admin lê tudo.

### 3. Telas

- `/login` — e-mail e senha, com "Esqueci minha senha".
- `/auth/confirm` — recebe `token_hash` e `type` e chama `verifyOtp`. Os templates de e-mail do Supabase (Invite user e Reset password), em português, apontam para `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite` (ou `recovery`). O `{{ .ConfirmationURL }}` padrão não serve com sessão em cookie.
- `/definir-senha` — depois de confirmar, leva para `/painel`.
- `/painel` — protegida. Mostra "Olá, [nome]" e a lista dos eventos do instrutor (vazia por enquanto, com a mensagem "Nenhum evento ainda"). Sem cadastro de evento nesta fatia.
- `/` — por enquanto, uma página simples com o nome Pulse e o link "Entrar como instrutor". A entrada do participante com código chega na fatia 1.

Visual limpo, pensado para funcionar em tablet desde já.

### 4. Publicação

- Commit e push na `main`; conferir Ready na aba Deployments da Vercel.
- Conferir que a função roda em São Paulo. No PowerShell: `curl.exe -sI https://pulse.efic.com.br/login` e procurar a linha `x-vercel-id`, que deve terminar em `::gru1`. Use `curl.exe`, e não `curl`, que no PowerShell é outro comando.

## Pronto quando

- [x] pulse.efic.com.br abre com certificado válido.
- [x] O Pedro, convidado pelo painel do Supabase, recebe o e-mail em português, define a senha e cai em `/painel`.
- [x] "Esqueci minha senha" funciona de ponta a ponta.
- [x] O Pedro é promovido a admin por SQL no painel, e a tela continua funcionando.
- [x] `supabase/tests/isolamento.sql` roda inteiro sem falha.
- [x] `x-vercel-id` confirma gru1.
- [x] Nenhuma chave secreta aparece no repositório: `git grep sb_secret_` não acha nada.

## Fora desta fatia

Código do evento para participantes, importação de inscritos, entrada do participante, atividades, tempo real, destaques, e-mails para participantes. Tudo isso começa na fatia 1 em diante.
