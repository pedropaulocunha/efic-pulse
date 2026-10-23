-- 0036 — consolidado por IA de uma pergunta da biblioteca, com todas as turmas
-- (docs/consolidado.md; decisões do Pedro, 23/10/2026).
--   * Um único conjunto de temas para as respostas de TODOS os eventos ligados à
--     pergunta do modelo (no período escolhido): assim qualquer grupo de eventos
--     pode ser comparado com os outros usando os mesmos temas.
--   * A IA define os temas e classifica cada item (resposta aberta, ou palavra da
--     nuvem); o Pulse conta as pessoas por tema e por evento.
--   * Só o admin (a biblioteca é do admin).

-- Trava: se este arquivo chegar com os acentos trocados, para aqui.
do $$
begin
  if length('ção') <> 3 then
    raise exception 'ACENTOS TROCADOS AO COLAR. Copie de novo com o comando que tem -Encoding UTF8.';
  end if;
end $$;

-- Formato: temas = ["título", ...] (1 a 8); mapa = {"<chave do item>": número do tema, 0 = Outros}.
create or replace function public.consolidado_valido(temas jsonb, mapa jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if temas is null or jsonb_typeof(temas) <> 'array'
     or jsonb_array_length(temas) < 1 or jsonb_array_length(temas) > 8
     or exists (select 1 from jsonb_array_elements(temas) t
                 where jsonb_typeof(t) <> 'string' or length(trim(t #>> '{}')) not between 1 and 60) then
    return false;
  end if;
  if mapa is null or jsonb_typeof(mapa) <> 'object'
     or exists (select 1 from jsonb_each(mapa) m
                 where jsonb_typeof(m.value) <> 'number'
                    or (m.value #>> '{}')::numeric < 0
                    or (m.value #>> '{}')::numeric > jsonb_array_length(temas)) then
    return false;
  end if;
  return true;
end;
$$;

create table public.consolidados (
  modelo_pergunta_id uuid primary key references public.modelo_perguntas (id) on delete cascade,
  de date,
  ate date,
  sintese text constraint consolidados_sintese_check check (sintese is null or length(trim(sintese)) between 1 and 1000),
  temas jsonb not null,
  mapa jsonb not null,
  modelo text,
  gerado_em timestamptz not null default now(),
  constraint consolidados_formato check (public.consolidado_valido(temas, mapa))
);

alter table public.consolidados enable row level security;

revoke all on table public.consolidados from anon;
grant select, insert, update, delete on table public.consolidados to authenticated, service_role;

create policy consolidados_select on public.consolidados
  for select to authenticated using ((select public.usuario_e_admin()));
create policy consolidados_insert on public.consolidados
  for insert to authenticated with check ((select public.usuario_e_admin()));
create policy consolidados_update on public.consolidados
  for update to authenticated
  using ((select public.usuario_e_admin())) with check ((select public.usuario_e_admin()));
create policy consolidados_delete on public.consolidados
  for delete to authenticated using ((select public.usuario_e_admin()));

-- ---------------------------------------------------------------
-- Respostas de todos os eventos ligados à pergunta do modelo, no período
-- (data de início do evento). Só a rodada 1. Para quem não é admin: null.
--   aberta: o texto (as tiradas do mural ficam de fora);
--   nuvem: as palavras já juntadas (chave + forma), sem vazias, bloqueadas e ocultas.
-- Nunca sai quem respondeu: cada resposta é uma pessoa dentro do evento.
-- ---------------------------------------------------------------
create or replace function public.consolidado_respostas(pergunta uuid, de date default null, ate date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p record;
begin
  if not public.usuario_e_admin() then
    return null;
  end if;
  select id, tipo into p from public.modelo_perguntas where id = pergunta;
  if not found then
    return null;
  end if;

  return (
    with ativs as (
      select a.id, a.evento_id
        from public.atividades a
        join public.eventos e on e.id = a.evento_id
       where a.modelo_pergunta_id = p.id
         and (consolidado_respostas.de is null or e.data_inicio >= consolidado_respostas.de)
         and (consolidado_respostas.ate is null or e.data_inicio <= consolidado_respostas.ate)
    ),
    resp as (
      select r.id, x.evento_id, x.id as atividade_id, r.valor
        from public.respostas r
        join ativs x on x.id = r.atividade_id
       where r.rodada = 1 and r.aprovada is not false
    )
    select jsonb_build_object(
      'tipo', p.tipo,
      'eventos', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', e.id, 'nome_turma', e.nome_turma, 'data_inicio', e.data_inicio,
                 'cooperativa', c.nome, 'uf', c.uf)
               order by e.data_inicio, e.nome_turma)
          from public.eventos e
          left join public.cooperativas c on c.id = e.cooperativa_id
         where e.id in (select evento_id from ativs)), '[]'::jsonb),
      'respostas', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', rs.id,
                 'evento', rs.evento_id,
                 'texto', case when p.tipo = 'aberta' then rs.valor ->> 'texto' end,
                 'palavras', case when p.tipo = 'nuvem' then (
                   select coalesce(jsonb_agg(distinct jsonb_build_object(
                            'chave', public.chave_palavra(w),
                            'forma', lower(trim(regexp_replace(w, '\s+', ' ', 'g'))))), '[]'::jsonb)
                     from jsonb_array_elements_text(rs.valor -> 'palavras') w
                    where public.chave_palavra(w) is not null
                      and not public.palavra_vazia(public.chave_palavra(w))
                      and not public.palavra_bloqueada(public.chave_palavra(w))
                      and not exists (select 1 from public.palavras_ocultas o
                                       where o.atividade_id = rs.atividade_id and o.chave = public.chave_palavra(w))
                 ) end))
          from resp rs), '[]'::jsonb)
    )
  );
end;
$$;

revoke execute on function public.consolidado_respostas(uuid, date, date) from public, anon;
grant execute on function public.consolidado_respostas(uuid, date, date) to authenticated;

-- Conferência.
do $$
begin
  if not public.consolidado_valido('["Contato", "Objeções"]', '{"a": 1, "b": 2, "c": 0}')
     or public.consolidado_valido('["Contato"]', '{"a": 3}')
     or public.consolidado_valido('[]', '{}') then
    raise exception 'FALHOU: conferência do consolidado';
  end if;
end $$;

select 'OK: 0036 aplicada' as resultado;
