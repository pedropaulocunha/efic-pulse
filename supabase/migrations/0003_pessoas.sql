-- 0003 — pessoas (quem se inscreve em eventos).

create table public.pessoas (
  id uuid primary key default gen_random_uuid(),
  nome text not null constraint pessoas_nome_check check (length(trim(nome)) > 0),
  email text not null
    constraint pessoas_email_unico unique
    constraint pessoas_email_minusculo check (email = lower(trim(email))),
  cargo text,
  criado_em timestamptz not null default now()
);

-- Guarda o e-mail sempre em minúsculas e sem espaços nas pontas.
create or replace function public.normalizar_email_pessoa()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.email := lower(trim(new.email));
  return new;
end;
$$;

create trigger pessoas_normalizar_email
  before insert or update of email on public.pessoas
  for each row execute function public.normalizar_email_pessoa();

alter table public.pessoas enable row level security;

revoke all on table public.pessoas from anon;
grant select, insert, update, delete on table public.pessoas to authenticated;

-- Equipe (admin e instrutor) lê e cria. Só admin altera e apaga.

create policy pessoas_select on public.pessoas
  for select to authenticated
  using ((select public.usuario_e_equipe()));

create policy pessoas_insert on public.pessoas
  for insert to authenticated
  with check ((select public.usuario_e_equipe()));

create policy pessoas_update_admin on public.pessoas
  for update to authenticated
  using ((select public.usuario_e_admin()))
  with check ((select public.usuario_e_admin()));

create policy pessoas_delete_admin on public.pessoas
  for delete to authenticated
  using ((select public.usuario_e_admin()));
