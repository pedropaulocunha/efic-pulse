-- 0008 — sessões dos participantes.
-- O participante não é usuário do Supabase Auth. A sessão é um cookie com um
-- token aleatório; aqui fica só o hash SHA-256 desse token.
-- RLS ligada e SEM políticas: só o servidor do Pulse, com a chave secreta,
-- lê e grava esta tabela.

create table public.sessoes_participante (
  id uuid primary key default gen_random_uuid(),
  inscricao_id uuid not null references public.inscricoes (id) on delete cascade,
  token_hash text not null
    constraint sessoes_participante_token_hash_unico unique
    constraint sessoes_participante_token_hash_formato check (token_hash ~ '^[0-9a-f]{64}$'),
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null,
  ultimo_acesso timestamptz not null default now()
);

create index sessoes_participante_inscricao_id_idx on public.sessoes_participante (inscricao_id);

alter table public.sessoes_participante enable row level security;

revoke all on table public.sessoes_participante from anon, authenticated;
grant select, insert, update, delete on table public.sessoes_participante to service_role;

-- O servidor (chave secreta) também precisa das tabelas que confere na entrada.
grant select, insert, update, delete on table
  public.eventos, public.inscricoes, public.pessoas, public.cooperativas
  to service_role;
