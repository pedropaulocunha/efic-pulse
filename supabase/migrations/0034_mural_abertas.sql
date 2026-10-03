-- 0034 — mural das respostas de texto livre: paginação, filtro e resumo por IA.
-- Decisões do Pedro (03/10/2026), docs/mural-abertas.md:
--   * 6 respostas por página; o telão troca sozinho a cada 15 s (automático) até o
--     instrutor tocar em Anterior/Próxima no controle (aí fica no controle dele).
--   * Filtro por palavra (o instrutor digita no controle): o mural mostra só as
--     respostas que contêm a palavra (sem diferença de maiúsculas e acentos).
--   * Resumo por IA: síntese + temas. A IA só agrupa e escreve a síntese; o Pulse
--     conta as pessoas de cada tema. O filtro não muda o resumo.

-- Trava: se este arquivo chegar com os acentos trocados, para aqui.
do $$
begin
  if length('ção') <> 3 then
    raise exception 'ACENTOS TROCADOS AO COLAR. Copie de novo com o comando que tem -Encoding UTF8.';
  end if;
end $$;

-- Estado do mural no telão (por atividade). O instrutor muda pelo controle (RLS das atividades).
alter table public.atividades
  add column mural_filtro text
    constraint atividades_mural_filtro_check check (mural_filtro is null or length(trim(mural_filtro)) between 1 and 60),
  add column mural_pagina integer not null default 1
    constraint atividades_mural_pagina_check check (mural_pagina >= 1),
  add column mural_automatico boolean not null default true;

-- ---------------------------------------------------------------
-- Resumo por IA das respostas abertas: síntese + temas (cada tema com as
-- respostas que a IA colocou nele e uma de exemplo).
-- ---------------------------------------------------------------
create or replace function public.temas_abertas_validos(temas jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  t jsonb;
begin
  if temas is null or jsonb_typeof(temas) <> 'array'
     or jsonb_array_length(temas) < 1 or jsonb_array_length(temas) > 8 then
    return false;
  end if;
  for t in select * from jsonb_array_elements(temas) loop
    if jsonb_typeof(t) <> 'object'
       or coalesce(jsonb_typeof(t -> 'titulo'), '') <> 'string'
       or length(trim(t ->> 'titulo')) not between 1 and 60
       or coalesce(jsonb_typeof(t -> 'respostas'), '') <> 'array'
       or exists (select 1 from jsonb_array_elements(t -> 'respostas') c where jsonb_typeof(c) <> 'string')
       or coalesce(jsonb_typeof(t -> 'exemplo'), 'null') not in ('string', 'null') then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

create table public.temas_abertas (
  atividade_id uuid not null references public.atividades (id) on delete cascade,
  rodada integer not null constraint temas_abertas_rodada_check check (rodada >= 1),
  sintese text not null constraint temas_abertas_sintese_check check (length(trim(sintese)) between 1 and 800),
  temas jsonb not null constraint temas_abertas_validos check (public.temas_abertas_validos(temas)),
  no_telao boolean not null default false,
  modelo text,
  gerado_em timestamptz not null default now(),
  primary key (atividade_id, rodada)
);

alter table public.temas_abertas enable row level security;

revoke all on table public.temas_abertas from anon;
grant select, insert, update, delete on table public.temas_abertas to authenticated, service_role;

create policy temas_abertas_select on public.temas_abertas
  for select to authenticated
  using ((select public.usuario_e_admin()) or (select public.usuario_instrutor_da_atividade(atividade_id)));
create policy temas_abertas_insert on public.temas_abertas
  for insert to authenticated
  with check ((select public.usuario_e_admin()) or (select public.usuario_instrutor_da_atividade(atividade_id)));
create policy temas_abertas_update on public.temas_abertas
  for update to authenticated
  using ((select public.usuario_e_admin()) or (select public.usuario_instrutor_da_atividade(atividade_id)))
  with check ((select public.usuario_e_admin()) or (select public.usuario_instrutor_da_atividade(atividade_id)));
create policy temas_abertas_delete on public.temas_abertas
  for delete to authenticated
  using ((select public.usuario_e_admin()) or (select public.usuario_instrutor_da_atividade(atividade_id)));

-- ---------------------------------------------------------------
-- respostas_abertas (versão de 0017): agora em ordem de chegada (a mesma do mural
-- no telão, para as páginas não pularem quando chega resposta nova).
-- ---------------------------------------------------------------
create or replace function public.respostas_abertas(atividade uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a record;
begin
  select id, evento_id, tipo into a from public.atividades where id = atividade;
  if not found or a.tipo <> 'aberta' then
    return null;
  end if;
  if not (public.usuario_e_admin() or public.usuario_instrutor_do_evento(a.evento_id)) then
    return null;
  end if;

  return coalesce(
    (select jsonb_agg(
              jsonb_build_object('id', r.id, 'texto', r.valor ->> 'texto', 'aprovada', r.aprovada)
              order by r.criado_em, r.id)
       from public.respostas r
      where r.atividade_id = a.id),
    '[]'::jsonb
  );
end;
$$;

revoke execute on function public.respostas_abertas(uuid) from public, anon;
grant execute on function public.respostas_abertas(uuid) to authenticated;

-- Conferência.
do $$
begin
  if not public.temas_abertas_validos('[{"titulo": "Contato cedo", "respostas": ["a"], "exemplo": "a"}]')
     or public.temas_abertas_validos('[]') then
    raise exception 'FALHOU: conferência dos temas das respostas abertas';
  end if;
end $$;

select 'OK: 0034 aplicada' as resultado;
