-- 0001 — perfis: um por usuário do Auth, criado automaticamente.

create table public.perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null,
  papel text not null default 'instrutor'
    constraint perfis_papel_check check (papel in ('admin', 'instrutor')),
  criado_em timestamptz not null default now()
);

alter table public.perfis enable row level security;

revoke all on table public.perfis from anon;
grant select, insert, update, delete on table public.perfis to authenticated;

-- Funções de apoio das políticas. Falham fechado: sem perfil, devolvem false.

create or replace function public.usuario_e_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.papel = 'admin' from public.perfis p where p.id = auth.uid()),
    false
  );
$$;

create or replace function public.usuario_e_equipe()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.papel in ('admin', 'instrutor') from public.perfis p where p.id = auth.uid()),
    false
  );
$$;

revoke execute on function public.usuario_e_admin() from public, anon;
revoke execute on function public.usuario_e_equipe() from public, anon;
grant execute on function public.usuario_e_admin() to authenticated;
grant execute on function public.usuario_e_equipe() to authenticated;

-- Políticas. Não há UPDATE para o próprio usuário: ninguém se promove a admin.
-- Não há INSERT: o perfil nasce pelo trigger abaixo.

create policy perfis_select on public.perfis
  for select to authenticated
  using (id = (select auth.uid()) or (select public.usuario_e_admin()));

create policy perfis_update_admin on public.perfis
  for update to authenticated
  using ((select public.usuario_e_admin()))
  with check ((select public.usuario_e_admin()));

create policy perfis_delete_admin on public.perfis
  for delete to authenticated
  using ((select public.usuario_e_admin()));

-- Trigger: todo usuário novo do Auth ganha perfil de instrutor.

create or replace function public.criar_perfil_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfis (id, nome, papel)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'nome'), ''), split_part(new.email, '@', 1)),
    'instrutor'
  );
  return new;
end;
$$;

revoke execute on function public.criar_perfil_novo_usuario() from public, anon, authenticated;

create trigger ao_criar_usuario_auth
  after insert on auth.users
  for each row execute function public.criar_perfil_novo_usuario();
