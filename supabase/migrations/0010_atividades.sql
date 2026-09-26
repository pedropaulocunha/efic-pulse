-- 0010 — atividades do evento (múltipla escolha, escala e nuvem de palavras).

-- Confere o formato da configuração de cada tipo. Usada no CHECK da tabela,
-- para a regra valer no banco e não só no código.
create or replace function public.config_atividade_valida(tipo text, config jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  n integer;
  minimo numeric;
  maximo numeric;
  passo numeric;
  referencia numeric;
begin
  if config is null or jsonb_typeof(config) <> 'object' then
    return false;
  end if;

  if tipo = 'multipla' then
    if coalesce(jsonb_typeof(config -> 'opcoes'), '') <> 'array' then
      return false;
    end if;
    n := jsonb_array_length(config -> 'opcoes');
    if n < 2 or n > 6 then
      return false;
    end if;
    for i in 0 .. n - 1 loop
      if coalesce(jsonb_typeof(config -> 'opcoes' -> i), '') <> 'string'
         or length(trim(config -> 'opcoes' ->> i)) = 0 then
        return false;
      end if;
    end loop;
    return true;

  elsif tipo = 'escala' then
    if coalesce(jsonb_typeof(config -> 'min'), '') <> 'number'
       or coalesce(jsonb_typeof(config -> 'max'), '') <> 'number'
       or coalesce(jsonb_typeof(config -> 'passo'), '') <> 'number' then
      return false;
    end if;
    minimo := (config ->> 'min')::numeric;
    maximo := (config ->> 'max')::numeric;
    passo := (config ->> 'passo')::numeric;
    -- O passo precisa dividir o intervalo, e a escala tem no máximo 1000 degraus.
    if maximo <= minimo or passo <= 0 or mod(maximo - minimo, passo) <> 0
       or (maximo - minimo) / passo > 1000 then
      return false;
    end if;
    if coalesce(jsonb_typeof(config -> 'unidade'), 'null') not in ('string', 'null') then
      return false;
    end if;
    if coalesce(jsonb_typeof(config -> 'referencia'), 'null') <> 'null' then
      if jsonb_typeof(config -> 'referencia') <> 'number' then
        return false;
      end if;
      referencia := (config ->> 'referencia')::numeric;
      if referencia < minimo or referencia > maximo then
        return false;
      end if;
    end if;
    return true;

  elsif tipo = 'nuvem' then
    return coalesce(jsonb_typeof(config -> 'max_palavras'), '') = 'number'
       and (config ->> 'max_palavras')::numeric in (1, 2, 3);
  end if;

  return false;
end;
$$;

create table public.atividades (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.eventos (id) on delete cascade,
  ordem integer not null constraint atividades_ordem_check check (ordem >= 1),
  tipo text not null
    constraint atividades_tipo_check check (tipo in ('multipla', 'escala', 'nuvem')),
  enunciado text not null
    constraint atividades_enunciado_check check (length(trim(enunciado)) > 0),
  config jsonb not null,
  estado text not null default 'fechada'
    constraint atividades_estado_check check (estado in ('fechada', 'aberta', 'encerrada')),
  resultado_visivel boolean not null default false,
  referencia_revelada boolean not null default false,
  aberta_em timestamptz,
  encerrada_em timestamptz,
  criado_em timestamptz not null default now(),
  constraint atividades_config_valida check (public.config_atividade_valida(tipo, config)),
  -- Permite que eventos.atividade_atual_id aponte só para atividade do próprio evento.
  constraint atividades_evento_id_id_unico unique (evento_id, id)
);

create index atividades_evento_id_ordem_idx on public.atividades (evento_id, ordem);

-- Só uma atividade aberta por evento.
create unique index atividades_uma_aberta_por_evento_idx
  on public.atividades (evento_id)
  where estado = 'aberta';

-- O que o celular e o telão mostram agora.
alter table public.eventos
  add column atividade_atual_id uuid,
  add constraint eventos_atividade_atual_fk
    foreign key (id, atividade_atual_id)
    references public.atividades (evento_id, id)
    on delete set null (atividade_atual_id);

create index eventos_atividade_atual_id_idx on public.eventos (atividade_atual_id);

alter table public.atividades enable row level security;

revoke all on table public.atividades from anon;
grant select, insert, update, delete on table public.atividades to authenticated, service_role;

-- Admin: tudo. Instrutor: só as atividades dos próprios eventos.

create policy atividades_select on public.atividades
  for select to authenticated
  using (
    (select public.usuario_e_admin())
    or (select public.usuario_instrutor_do_evento(evento_id))
  );

create policy atividades_insert on public.atividades
  for insert to authenticated
  with check (
    (select public.usuario_e_admin())
    or (select public.usuario_instrutor_do_evento(evento_id))
  );

create policy atividades_update on public.atividades
  for update to authenticated
  using (
    (select public.usuario_e_admin())
    or (select public.usuario_instrutor_do_evento(evento_id))
  )
  with check (
    (select public.usuario_e_admin())
    or (select public.usuario_instrutor_do_evento(evento_id))
  );

create policy atividades_delete on public.atividades
  for delete to authenticated
  using (
    (select public.usuario_e_admin())
    or (select public.usuario_instrutor_do_evento(evento_id))
  );
