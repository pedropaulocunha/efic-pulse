-- 0031 — temas da nuvem de palavras, agrupados por IA (docs/ia-temas-nuvem.md).
--   * temas_nuvem: por atividade e rodada, a lista de temas (título + chaves das
--     palavras) que a IA sugeriu e o instrutor pode ajustar; no_telao diz se o
--     telão mostra os temas no lugar da nuvem.
--   * resultado_temas: quantas PESSOAS caíram em cada tema. A IA não conta nada.

-- Trava: se este arquivo chegar com os acentos trocados, para aqui.
do $$
begin
  if length('ção') <> 3 then
    raise exception 'ACENTOS TROCADOS AO COLAR. Copie de novo com o comando que tem -Encoding UTF8.';
  end if;
end $$;

-- Formato: [{"titulo": "...", "chaves": ["...", ...]}, ...], de 1 a 10 temas.
create or replace function public.temas_nuvem_validos(temas jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  t jsonb;
begin
  if temas is null or jsonb_typeof(temas) <> 'array'
     or jsonb_array_length(temas) < 1 or jsonb_array_length(temas) > 10 then
    return false;
  end if;
  for t in select * from jsonb_array_elements(temas) loop
    if jsonb_typeof(t) <> 'object'
       or coalesce(jsonb_typeof(t -> 'titulo'), '') <> 'string'
       or length(trim(t ->> 'titulo')) not between 1 and 60
       or coalesce(jsonb_typeof(t -> 'chaves'), '') <> 'array'
       or exists (select 1 from jsonb_array_elements(t -> 'chaves') c where jsonb_typeof(c) <> 'string') then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

create table public.temas_nuvem (
  atividade_id uuid not null references public.atividades (id) on delete cascade,
  rodada integer not null constraint temas_nuvem_rodada_check check (rodada >= 1),
  temas jsonb not null constraint temas_nuvem_validos check (public.temas_nuvem_validos(temas)),
  no_telao boolean not null default false,
  modelo text,
  gerado_em timestamptz not null default now(),
  primary key (atividade_id, rodada)
);

alter table public.temas_nuvem enable row level security;

revoke all on table public.temas_nuvem from anon;
grant select, insert, update, delete on table public.temas_nuvem to authenticated, service_role;

create policy temas_nuvem_select on public.temas_nuvem
  for select to authenticated
  using ((select public.usuario_e_admin()) or (select public.usuario_instrutor_da_atividade(atividade_id)));
create policy temas_nuvem_insert on public.temas_nuvem
  for insert to authenticated
  with check ((select public.usuario_e_admin()) or (select public.usuario_instrutor_da_atividade(atividade_id)));
create policy temas_nuvem_update on public.temas_nuvem
  for update to authenticated
  using ((select public.usuario_e_admin()) or (select public.usuario_instrutor_da_atividade(atividade_id)))
  with check ((select public.usuario_e_admin()) or (select public.usuario_instrutor_da_atividade(atividade_id)));
create policy temas_nuvem_delete on public.temas_nuvem
  for delete to authenticated
  using ((select public.usuario_e_admin()) or (select public.usuario_instrutor_da_atividade(atividade_id)));

-- ---------------------------------------------------------------
-- Resultado por tema. Cada pessoa conta uma vez em cada tema em que tiver
-- alguma palavra. Palavras fora de todos os temas vão para "Outros".
-- Mesmas exclusões da nuvem (vazias, bloqueadas, ocultas) e mesma checagem
-- de acesso de resultado_atividade. Sem temas guardados: null.
-- ---------------------------------------------------------------
create or replace function public.resultado_temas(atividade uuid, rodada integer default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a record;
  papel_jwt text;
  qual_rodada integer;
  lista jsonb;
  nuvem jsonb;
begin
  select id, evento_id, tipo, rodada_atual into a from public.atividades where id = atividade;
  if not found or a.tipo <> 'nuvem' then
    return null;
  end if;

  papel_jwt := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  if not (
    coalesce(papel_jwt, '') = 'service_role'
    or public.usuario_e_admin()
    or public.usuario_instrutor_do_evento(a.evento_id)
  ) then
    return null;
  end if;

  qual_rodada := coalesce(resultado_temas.rodada, a.rodada_atual);
  select t.temas into lista from public.temas_nuvem t where t.atividade_id = a.id and t.rodada = qual_rodada;
  if lista is null then
    return null;
  end if;

  -- As palavras como a nuvem mostra (forma mais usada e quantas vezes).
  nuvem := coalesce(public.resultado_atividade(a.id, qual_rodada) -> 'palavras', '[]'::jsonb);

  return (
    with mapa as (
      -- chave -> tema (1, 2, ...); se a mesma chave estiver em dois temas, vale o primeiro.
      select distinct on (c.chave) c.chave, t.pos::integer as tema
        from jsonb_array_elements(lista) with ordinality as t(item, pos),
             jsonb_array_elements_text(t.item -> 'chaves') as c(chave)
       order by c.chave, t.pos
    ),
    usos as (
      select resp.inscricao_id, public.chave_palavra(w) as chave
        from public.respostas resp,
             jsonb_array_elements_text(resp.valor -> 'palavras') as w
       where resp.atividade_id = a.id and resp.rodada = qual_rodada
    ),
    validos as (
      select u.inscricao_id, coalesce(m.tema, 0) as tema
        from usos u
        left join mapa m on m.chave = u.chave
       where u.chave is not null
         and not public.palavra_vazia(u.chave)
         and not public.palavra_bloqueada(u.chave)
         and not exists (
           select 1 from public.palavras_ocultas o where o.atividade_id = a.id and o.chave = u.chave
         )
    ),
    grupos as (
      select v.tema, count(distinct v.inscricao_id) as pessoas from validos v group by v.tema
    )
    select jsonb_build_object(
      'rodada', qual_rodada,
      'total', (select count(distinct inscricao_id) from validos),
      'temas', coalesce(jsonb_agg(
        jsonb_build_object(
          'indice', g.tema,
          'titulo', case when g.tema = 0 then 'Outros' else lista -> (g.tema - 1) ->> 'titulo' end,
          'pessoas', g.pessoas,
          'palavras', coalesce((
            select jsonb_agg(jsonb_build_object('palavra', p ->> 'palavra', 'chave', p ->> 'chave', 'n', (p ->> 'n')::integer)
                             order by (p ->> 'n')::integer desc, p ->> 'chave')
              from jsonb_array_elements(nuvem) p
             where coalesce((select m.tema from mapa m where m.chave = p ->> 'chave'), 0) = g.tema
          ), '[]'::jsonb)
        )
        -- "Outros" sempre por último; os demais do mais citado para o menos.
        order by (g.tema = 0), g.pessoas desc, g.tema), '[]'::jsonb)
    )
    from grupos g
  );
end;
$$;

revoke execute on function public.resultado_temas(uuid, integer) from public, anon;
grant execute on function public.resultado_temas(uuid, integer) to authenticated, service_role;

-- Conferência: formato dos temas.
do $$
begin
  if not public.temas_nuvem_validos('[{"titulo": "Vergonha", "chaves": ["vergonha", "constrangido"]}]')
     or public.temas_nuvem_validos('[]')
     or public.temas_nuvem_validos('[{"titulo": "", "chaves": []}]')
     or has_function_privilege('anon', 'public.resultado_temas(uuid, integer)', 'execute') then
    raise exception 'FALHOU: conferência dos temas da nuvem';
  end if;
end $$;

select 'OK: 0031 aplicada' as resultado;
