-- 0002 — cooperativas.

create table public.cooperativas (
  id uuid primary key default gen_random_uuid(),
  nome text not null constraint cooperativas_nome_check check (length(trim(nome)) > 0),
  uf char(2) not null constraint cooperativas_uf_check check (uf ~ '^[A-Z]{2}$'),
  central text,
  criado_em timestamptz not null default now()
);

alter table public.cooperativas enable row level security;

revoke all on table public.cooperativas from anon;
grant select, insert, update, delete on table public.cooperativas to authenticated;

-- Equipe (admin e instrutor) lê e cria. Só admin altera e apaga.

create policy cooperativas_select on public.cooperativas
  for select to authenticated
  using ((select public.usuario_e_equipe()));

create policy cooperativas_insert on public.cooperativas
  for insert to authenticated
  with check ((select public.usuario_e_equipe()));

create policy cooperativas_update_admin on public.cooperativas
  for update to authenticated
  using ((select public.usuario_e_admin()))
  with check ((select public.usuario_e_admin()));

create policy cooperativas_delete_admin on public.cooperativas
  for delete to authenticated
  using ((select public.usuario_e_admin()));
