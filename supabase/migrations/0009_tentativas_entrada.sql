-- 0009 — tentativas de entrada do participante, para barrar chute de código.
-- Guarda só um hash do IP. Depois de 10 tentativas sem sucesso em 15 minutos
-- pelo mesmo IP, a entrada fica bloqueada por alguns minutos.
-- RLS ligada e SEM políticas: só o servidor, com a chave secreta, acessa.

create table public.tentativas_entrada (
  id uuid primary key default gen_random_uuid(),
  ip_hash text not null,
  sucesso boolean not null,
  criado_em timestamptz not null default now()
);

create index tentativas_entrada_ip_hash_criado_em_idx
  on public.tentativas_entrada (ip_hash, criado_em);

alter table public.tentativas_entrada enable row level security;

revoke all on table public.tentativas_entrada from anon, authenticated;
grant select, insert, update, delete on table public.tentativas_entrada to service_role;
