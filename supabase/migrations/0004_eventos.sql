-- 0004 — eventos.

create table public.eventos (
  id uuid primary key default gen_random_uuid(),
  cooperativa_id uuid not null references public.cooperativas (id) on delete restrict,
  codigo_interno text not null
    constraint eventos_codigo_interno_unico unique
    constraint eventos_codigo_interno_formato check (codigo_interno ~ '^[0-9]{8}-[0-9]+$'),
  nome_turma text not null constraint eventos_nome_turma_check check (length(trim(nome_turma)) > 0),
  tema text,
  data_inicio date not null,
  data_fim date not null,
  local text,
  duracao_min integer constraint eventos_duracao_min_check check (duracao_min > 0),
  instrutor_id uuid not null references public.perfis (id) on delete restrict,
  estado text not null default 'planejamento'
    constraint eventos_estado_check check (estado in ('planejamento', 'ao_vivo', 'encerrado')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint eventos_datas_check check (data_fim >= data_inicio)
);

create index eventos_cooperativa_id_idx on public.eventos (cooperativa_id);
create index eventos_instrutor_id_idx on public.eventos (instrutor_id);

-- Código interno: AAAAMMDD da data de início + sufixo sequencial no mesmo dia
-- (20261015-1, 20261015-2...). Gerado no banco quando não vier preenchido.
create or replace function public.gerar_codigo_interno_evento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  prefixo text;
  proximo integer;
begin
  if new.codigo_interno is not null then
    return new;
  end if;

  prefixo := to_char(new.data_inicio, 'YYYYMMDD');
  -- Evita que dois cadastros simultâneos peguem o mesmo número.
  perform pg_advisory_xact_lock(hashtext('eventos.codigo_interno.' || prefixo));

  select coalesce(max(split_part(e.codigo_interno, '-', 2)::integer), 0) + 1
    into proximo
    from public.eventos e
   where e.codigo_interno like prefixo || '-%';

  new.codigo_interno := prefixo || '-' || proximo;
  return new;
end;
$$;

revoke execute on function public.gerar_codigo_interno_evento() from public, anon, authenticated;

create trigger eventos_gerar_codigo_interno
  before insert on public.eventos
  for each row execute function public.gerar_codigo_interno_evento();

create or replace function public.marcar_atualizado_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger eventos_marcar_atualizado_em
  before update on public.eventos
  for each row execute function public.marcar_atualizado_em();

-- Função de apoio para as políticas de tabelas ligadas a evento.
create or replace function public.usuario_instrutor_do_evento(evento uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select e.instrutor_id = auth.uid() from public.eventos e where e.id = evento),
    false
  );
$$;

revoke execute on function public.usuario_instrutor_do_evento(uuid) from public, anon;
grant execute on function public.usuario_instrutor_do_evento(uuid) to authenticated;

alter table public.eventos enable row level security;

revoke all on table public.eventos from anon;
grant select, insert, update, delete on table public.eventos to authenticated;

-- Admin: tudo. Instrutor: só eventos em que ele é o instrutor_id,
-- e não consegue criar nem transferir evento para outro instrutor.

create policy eventos_select on public.eventos
  for select to authenticated
  using (
    (select public.usuario_e_admin())
    or instrutor_id = (select auth.uid())
  );

create policy eventos_insert on public.eventos
  for insert to authenticated
  with check (
    (select public.usuario_e_admin())
    or (instrutor_id = (select auth.uid()) and (select public.usuario_e_equipe()))
  );

create policy eventos_update on public.eventos
  for update to authenticated
  using (
    (select public.usuario_e_admin())
    or instrutor_id = (select auth.uid())
  )
  with check (
    (select public.usuario_e_admin())
    or instrutor_id = (select auth.uid())
  );

create policy eventos_delete on public.eventos
  for delete to authenticated
  using (
    (select public.usuario_e_admin())
    or instrutor_id = (select auth.uid())
  );
