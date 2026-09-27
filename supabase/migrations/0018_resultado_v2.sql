-- 0018 — resultado agregado para os seis tipos e por rodada.
-- Continua devolvendo SÓ números e textos anônimos: nunca quem respondeu.
-- Quem pode ler: o instrutor do evento, o admin e o servidor (chave secreta).
-- "rodada" é opcional: sem ela, vale a rodada atual da atividade.
-- A assinatura muda (ganha "rodada"), por isso a função é recriada numa transação só.

begin;

drop function public.resultado_atividade(uuid);

create function public.resultado_atividade(atividade uuid, rodada integer default null)
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
  total integer;
  dados jsonb;
  itens integer;
begin
  select id, evento_id, tipo, config, rodada_atual into a
    from public.atividades where id = atividade;
  if not found then
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

  qual_rodada := coalesce(resultado_atividade.rodada, a.rodada_atual);

  select count(*) into total
    from public.respostas resp
   where resp.atividade_id = a.id and resp.rodada = qual_rodada;

  if a.tipo = 'multipla' then
    select coalesce(jsonb_agg(coalesce(c.n, 0) order by g.i), '[]'::jsonb)
      into dados
      from generate_series(0, jsonb_array_length(a.config -> 'opcoes') - 1) as g(i)
      left join (
        select (resp.valor ->> 'opcao')::integer as opcao, count(*) as n
          from public.respostas resp
         where resp.atividade_id = a.id and resp.rodada = qual_rodada
         group by 1
      ) c on c.opcao = g.i;
    return jsonb_build_object('tipo', 'multipla', 'rodada', qual_rodada, 'total', total, 'contagem', dados);

  elsif a.tipo in ('escala', 'numero') then
    with v as (
      select (resp.valor ->> 'numero')::numeric as x
        from public.respostas resp
       where resp.atividade_id = a.id and resp.rodada = qual_rodada
    )
    select jsonb_build_object(
      'tipo', a.tipo,
      'rodada', qual_rodada,
      'total', total,
      'media', (select round(avg(x), 2) from v),
      'mediana', (select percentile_cont(0.5) within group (order by x) from v),
      'histograma', coalesce(
        (select jsonb_agg(jsonb_build_object('valor', h.x, 'n', h.n) order by h.x)
           from (select x, count(*) as n from v group by x) h),
        '[]'::jsonb)
    ) into dados;
    return dados;

  elsif a.tipo = 'ordenar' then
    -- Pontos: com N itens, o 1º lugar vale N, o 2º vale N-1, ..., o último vale 1.
    itens := jsonb_array_length(a.config -> 'itens');
    select coalesce(jsonb_agg(coalesce(p.pontos, 0) order by g.i), '[]'::jsonb)
      into dados
      from generate_series(0, itens - 1) as g(i)
      left join (
        select (e.item #>> '{}')::integer as item, sum(itens - (e.pos - 1)) as pontos
          from public.respostas resp,
               jsonb_array_elements(resp.valor -> 'ordem') with ordinality as e(item, pos)
         where resp.atividade_id = a.id and resp.rodada = qual_rodada
         group by 1
      ) p on p.item = g.i;
    return jsonb_build_object('tipo', 'ordenar', 'rodada', qual_rodada, 'total', total, 'pontos', dados);

  elsif a.tipo = 'nuvem' then
    -- Agrupa pela chave (sem acento, singular); mostra a forma mais usada.
    -- Fora: palavras vazias, a lista padrão de palavrões e o que o instrutor ocultou.
    with palavras as (
      select public.chave_palavra(w) as chave,
             lower(trim(regexp_replace(w, '\s+', ' ', 'g'))) as forma
        from public.respostas resp,
             jsonb_array_elements_text(resp.valor -> 'palavras') as w
       where resp.atividade_id = a.id and resp.rodada = qual_rodada
    ),
    validas as (
      select p.chave, p.forma
        from palavras p
       where p.chave is not null
         and not public.palavra_vazia(p.chave)
         and not public.palavra_bloqueada(p.chave)
         and not exists (
           select 1 from public.palavras_ocultas o
            where o.atividade_id = a.id and o.chave = p.chave
         )
    ),
    contadas as (
      select v.chave, count(*) as n
        from validas v
       group by v.chave
       order by count(*) desc, v.chave
       limit 100
    ),
    -- Forma mostrada: a mais usada; no empate, a do singular e a com acento
    -- ("crédito" em vez de "credito" ou "créditos").
    formas as (
      select distinct on (v.chave) v.chave, v.forma
        from validas v
       group by v.chave, v.forma
       order by v.chave,
                count(*) desc,
                (length(v.forma) = length(v.chave)) desc,
                (v.forma <> translate(v.forma, 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')) desc,
                v.forma
    )
    select coalesce(jsonb_agg(jsonb_build_object('palavra', f.forma, 'chave', c.chave, 'n', c.n)
                              order by c.n desc, c.chave), '[]'::jsonb)
      into dados
      from contadas c
      join formas f on f.chave = c.chave;
    return jsonb_build_object('tipo', 'nuvem', 'rodada', qual_rodada, 'total', total, 'palavras', dados);

  elsif a.tipo = 'aberta' then
    -- Só as aprovadas, sem autor; as mais recentes primeiro.
    select coalesce(jsonb_agg(t.texto order by t.quando desc), '[]'::jsonb)
      into dados
      from (
        select resp.valor ->> 'texto' as texto, resp.atualizado_em as quando
          from public.respostas resp
         where resp.atividade_id = a.id and resp.rodada = qual_rodada and resp.aprovada
         order by resp.atualizado_em desc
         limit 60
      ) t;
    return jsonb_build_object(
      'tipo', 'aberta',
      'rodada', qual_rodada,
      'total', total,
      'aprovadas', dados,
      'pendentes', (select count(*) from public.respostas resp
                     where resp.atividade_id = a.id and resp.rodada = qual_rodada and resp.aprovada is null)
    );
  end if;

  return null;
end;
$$;

revoke execute on function public.resultado_atividade(uuid, integer) from public, anon;
grant execute on function public.resultado_atividade(uuid, integer) to authenticated, service_role;

commit;
