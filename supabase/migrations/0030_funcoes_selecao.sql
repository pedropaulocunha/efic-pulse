-- 0030 — funções do tipo "selecao" (seleção múltipla).
-- Configuração: {"opcoes": [3 a 10 textos], "min_escolhas": M, "max_escolhas": N}, 1 <= M <= N <= opções.
-- Resposta: {"opcoes": [índices marcados]}, sem repetir, de M a N índices.
-- Resultado: quantas pessoas marcaram cada opção ("contagem") e quantas responderam ("total").
-- As funções abaixo são as de 0027, 0014 e 0020, com o ramo "selecao" acrescentado;
-- comandar_atividade passa a aceitar "Nova rodada" também na seleção múltipla.

-- Trava: se este arquivo chegar com os acentos trocados, para aqui.
do $$
begin
  if length('ção') <> 3 then
    raise exception 'ACENTOS TROCADOS AO COLAR. Copie de novo com o comando que tem -Encoding UTF8.';
  end if;
end $$;

-- config_atividade_valida (versão de 0027_nuvem_cinco_palavras.sql, com "selecao")
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
  lista text;
begin
  if config is null or jsonb_typeof(config) <> 'object' then
    return false;
  end if;

  if tipo in ('multipla', 'ordenar') then
    -- múltipla: "opcoes" (2 a 6); ordenar: "itens" (3 a 6)
    lista := case when tipo = 'multipla' then 'opcoes' else 'itens' end;
    if coalesce(jsonb_typeof(config -> lista), '') <> 'array' then
      return false;
    end if;
    n := jsonb_array_length(config -> lista);
    if n < (case when tipo = 'multipla' then 2 else 3 end) or n > 6 then
      return false;
    end if;
    for i in 0 .. n - 1 loop
      if coalesce(jsonb_typeof(config -> lista -> i), '') <> 'string'
         or length(trim(config -> lista ->> i)) = 0 then
        return false;
      end if;
    end loop;
    return true;

  elsif tipo = 'selecao' then
    -- "opcoes" (3 a 10) e quantas cada pessoa marca: de "min_escolhas" a "max_escolhas".
    if coalesce(jsonb_typeof(config -> 'opcoes'), '') <> 'array'
       or coalesce(jsonb_typeof(config -> 'min_escolhas'), '') <> 'number'
       or coalesce(jsonb_typeof(config -> 'max_escolhas'), '') <> 'number' then
      return false;
    end if;
    n := jsonb_array_length(config -> 'opcoes');
    if n < 3 or n > 10 then
      return false;
    end if;
    for i in 0 .. n - 1 loop
      if coalesce(jsonb_typeof(config -> 'opcoes' -> i), '') <> 'string'
         or length(trim(config -> 'opcoes' ->> i)) = 0 then
        return false;
      end if;
    end loop;
    minimo := (config ->> 'min_escolhas')::numeric;
    maximo := (config ->> 'max_escolhas')::numeric;
    return minimo = trunc(minimo) and maximo = trunc(maximo)
       and minimo >= 1 and maximo >= minimo and maximo <= n;

  elsif tipo = 'escala' then
    if coalesce(jsonb_typeof(config -> 'min'), '') <> 'number'
       or coalesce(jsonb_typeof(config -> 'max'), '') <> 'number'
       or coalesce(jsonb_typeof(config -> 'passo'), '') <> 'number' then
      return false;
    end if;
    minimo := (config ->> 'min')::numeric;
    maximo := (config ->> 'max')::numeric;
    passo := (config ->> 'passo')::numeric;
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

  elsif tipo = 'numero' then
    -- Tudo opcional: limites, referência, unidade; "casas" (0 a 4) diz quantas decimais.
    if coalesce(jsonb_typeof(config -> 'min'), 'null') not in ('number', 'null')
       or coalesce(jsonb_typeof(config -> 'max'), 'null') not in ('number', 'null')
       or coalesce(jsonb_typeof(config -> 'referencia'), 'null') not in ('number', 'null')
       or coalesce(jsonb_typeof(config -> 'unidade'), 'null') not in ('string', 'null')
       or coalesce(jsonb_typeof(config -> 'casas'), '') <> 'number' then
      return false;
    end if;
    if (config ->> 'casas')::numeric not in (0, 1, 2, 3, 4) then
      return false;
    end if;
    minimo := (config ->> 'min')::numeric;
    maximo := (config ->> 'max')::numeric;
    referencia := (config ->> 'referencia')::numeric;
    if minimo is not null and maximo is not null and maximo <= minimo then
      return false;
    end if;
    if referencia is not null and (referencia < minimo or referencia > maximo) then
      return false;
    end if;
    return true;

  elsif tipo = 'nuvem' then
    return coalesce(jsonb_typeof(config -> 'max_palavras'), '') = 'number'
       and (config ->> 'max_palavras')::numeric in (1, 2, 3, 4, 5);

  elsif tipo = 'aberta' then
    return coalesce(jsonb_typeof(config -> 'max_caracteres'), '') = 'number'
       and (config ->> 'max_caracteres')::numeric between 20 and 500
       and (config ->> 'max_caracteres')::numeric = trunc((config ->> 'max_caracteres')::numeric);
  end if;

  return false;
end;
$$;

-- normalizar_resposta (versão de 0014_tipos_novos.sql, com "selecao")
create or replace function public.normalizar_resposta(tipo text, config jsonb, valor jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  n numeric;
  passos numeric;
  opcao numeric;
  palavras text[];
  maximo integer;
  ordem integer[];
  itens integer;
  casas integer;
  texto text;
begin
  if valor is null or jsonb_typeof(valor) <> 'object' then
    return null;
  end if;

  if tipo = 'multipla' then
    if coalesce(jsonb_typeof(valor -> 'opcao'), '') <> 'number' then
      return null;
    end if;
    opcao := (valor ->> 'opcao')::numeric;
    if opcao <> trunc(opcao) or opcao < 0 or opcao >= jsonb_array_length(config -> 'opcoes') then
      return null;
    end if;
    return jsonb_build_object('opcao', opcao::integer);

  elsif tipo = 'selecao' then
    -- "opcoes": índices marcados, sem repetir, entre o mínimo e o máximo da pergunta.
    if coalesce(jsonb_typeof(valor -> 'opcoes'), '') <> 'array' then
      return null;
    end if;
    itens := jsonb_array_length(config -> 'opcoes');
    if exists (
      select 1 from jsonb_array_elements(valor -> 'opcoes') e
       where jsonb_typeof(e) <> 'number'
          or (e #>> '{}')::numeric <> trunc((e #>> '{}')::numeric)
          or (e #>> '{}')::numeric < 0
          or (e #>> '{}')::numeric >= itens
    ) then
      return null;
    end if;
    select array_agg(distinct (e #>> '{}')::integer order by (e #>> '{}')::integer)
      into ordem
      from jsonb_array_elements(valor -> 'opcoes') e;
    if ordem is null
       or cardinality(ordem) <> jsonb_array_length(valor -> 'opcoes')
       or cardinality(ordem) < (config ->> 'min_escolhas')::integer
       or cardinality(ordem) > (config ->> 'max_escolhas')::integer then
      return null;
    end if;
    return jsonb_build_object('opcoes', to_jsonb(ordem));

  elsif tipo = 'escala' then
    if coalesce(jsonb_typeof(valor -> 'numero'), '') <> 'number' then
      return null;
    end if;
    n := (valor ->> 'numero')::numeric;
    if n < (config ->> 'min')::numeric or n > (config ->> 'max')::numeric then
      return null;
    end if;
    passos := (n - (config ->> 'min')::numeric) / (config ->> 'passo')::numeric;
    if abs(passos - round(passos)) > 0.000001 then
      return null;
    end if;
    return jsonb_build_object(
      'numero', (config ->> 'min')::numeric + round(passos) * (config ->> 'passo')::numeric
    );

  elsif tipo = 'numero' then
    if coalesce(jsonb_typeof(valor -> 'numero'), '') <> 'number' then
      return null;
    end if;
    casas := (config ->> 'casas')::integer;
    n := round((valor ->> 'numero')::numeric, casas);
    if abs(n) > 1000000000000
       or n < coalesce((config ->> 'min')::numeric, n)
       or n > coalesce((config ->> 'max')::numeric, n) then
      return null;
    end if;
    return jsonb_build_object('numero', n);

  elsif tipo = 'ordenar' then
    -- "ordem": os índices dos itens, do primeiro ao último colocado, sem repetir nenhum.
    itens := jsonb_array_length(config -> 'itens');
    if coalesce(jsonb_typeof(valor -> 'ordem'), '') <> 'array'
       or jsonb_array_length(valor -> 'ordem') <> itens then
      return null;
    end if;
    if exists (
      select 1 from jsonb_array_elements(valor -> 'ordem') e
       where jsonb_typeof(e) <> 'number'
          or (e #>> '{}')::numeric <> trunc((e #>> '{}')::numeric)
          or (e #>> '{}')::numeric < 0
          or (e #>> '{}')::numeric >= itens
    ) then
      return null;
    end if;
    select array_agg((e.item #>> '{}')::integer order by e.pos)
      into ordem
      from jsonb_array_elements(valor -> 'ordem') with ordinality as e(item, pos);
    if (select count(distinct x) from unnest(ordem) as x) <> itens then
      return null;
    end if;
    return jsonb_build_object('ordem', to_jsonb(ordem));

  elsif tipo = 'nuvem' then
    if coalesce(jsonb_typeof(valor -> 'palavras'), '') <> 'array' then
      return null;
    end if;
    maximo := (config ->> 'max_palavras')::integer;
    select array_agg(unicas.p order by unicas.primeira)
      into palavras
      from (
        select limpas.p, min(limpas.ordem) as primeira
          from (
            select left(lower(trim(regexp_replace(e.item #>> '{}', '\s+', ' ', 'g'))), 40) as p,
                   e.ordem
              from jsonb_array_elements(valor -> 'palavras') with ordinality as e(item, ordem)
             where jsonb_typeof(e.item) = 'string'
          ) limpas
         where length(limpas.p) > 0
         group by limpas.p
      ) unicas;
    if palavras is null or cardinality(palavras) = 0 or cardinality(palavras) > maximo then
      return null;
    end if;
    return jsonb_build_object('palavras', to_jsonb(palavras));

  elsif tipo = 'aberta' then
    if coalesce(jsonb_typeof(valor -> 'texto'), '') <> 'string' then
      return null;
    end if;
    texto := trim(regexp_replace(valor ->> 'texto', '\s+', ' ', 'g'));
    if length(texto) = 0 or length(texto) > (config ->> 'max_caracteres')::integer then
      return null;
    end if;
    return jsonb_build_object('texto', texto);
  end if;

  return null;
end;
$$;

-- resultado_atividade (versão de 0020_corrige_acentos.sql, com "selecao")
create or replace function public.resultado_atividade(atividade uuid, rodada integer default null)
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

  elsif a.tipo = 'selecao' then
    -- Quantas pessoas marcaram cada opção; "total" = pessoas que responderam.
    select coalesce(jsonb_agg(coalesce(c.n, 0) order by g.i), '[]'::jsonb)
      into dados
      from generate_series(0, jsonb_array_length(a.config -> 'opcoes') - 1) as g(i)
      left join (
        select (e #>> '{}')::integer as opcao, count(*) as n
          from public.respostas resp,
               jsonb_array_elements(resp.valor -> 'opcoes') as e
         where resp.atividade_id = a.id and resp.rodada = qual_rodada
         group by 1
      ) c on c.opcao = g.i;
    return jsonb_build_object('tipo', 'selecao', 'rodada', qual_rodada, 'total', total, 'contagem', dados);

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

-- comandar_atividade (versão de 0020_corrige_acentos.sql; "selecao" aceita nova rodada)
create or replace function public.comandar_atividade(atividade uuid, comando text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  a record;
  outra_aberta boolean;
begin
  select id, evento_id, estado, tipo, config
    into a
    from public.atividades
   where id = atividade
     for update;
  if not found then
    raise exception 'Atividade não encontrada' using errcode = 'no_data_found';
  end if;

  select exists (
    select 1 from public.atividades
     where evento_id = a.evento_id and estado = 'aberta' and id <> a.id
  ) into outra_aberta;

  if comando = 'abrir' then
    update public.atividades
       set estado = 'encerrada', encerrada_em = now()
     where evento_id = a.evento_id and estado = 'aberta' and id <> a.id;
    update public.atividades
       set estado = 'aberta', aberta_em = now(), encerrada_em = null
     where id = a.id;
    update public.eventos set atividade_atual_id = a.id where id = a.evento_id;

  elsif comando = 'nova_rodada' then
    if a.tipo not in ('multipla', 'escala', 'numero', 'ordenar', 'selecao') then
      raise exception 'Este tipo de atividade não tem rodadas' using errcode = 'check_violation';
    end if;
    if a.estado = 'fechada' then
      raise exception 'Abra a atividade antes de começar outra rodada' using errcode = 'check_violation';
    end if;
    update public.atividades
       set estado = 'encerrada', encerrada_em = now()
     where evento_id = a.evento_id and estado = 'aberta' and id <> a.id;
    -- Nova rodada começa aberta e com o resultado escondido no telão.
    update public.atividades
       set rodada_atual = rodada_atual + 1,
           estado = 'aberta', aberta_em = now(), encerrada_em = null,
           resultado_visivel = false
     where id = a.id;
    update public.eventos set atividade_atual_id = a.id where id = a.evento_id;

  elsif comando = 'encerrar' then
    if a.estado <> 'aberta' then
      raise exception 'A atividade não está aberta' using errcode = 'check_violation';
    end if;
    update public.atividades
       set estado = 'encerrada', encerrada_em = now()
     where id = a.id;

  elsif comando in ('mostrar_resultado', 'esconder_resultado') then
    if a.estado = 'fechada' then
      raise exception 'Abra a atividade antes de mostrar o resultado' using errcode = 'check_violation';
    end if;
    if outra_aberta then
      raise exception 'Encerre a atividade aberta antes' using errcode = 'check_violation';
    end if;
    update public.atividades
       set resultado_visivel = (comando = 'mostrar_resultado')
     where id = a.id;
    update public.eventos set atividade_atual_id = a.id where id = a.evento_id;

  elsif comando in ('revelar_referencia', 'esconder_referencia') then
    if a.tipo not in ('escala', 'numero') or coalesce(jsonb_typeof(a.config -> 'referencia'), 'null') = 'null' then
      raise exception 'Esta atividade não tem referência' using errcode = 'check_violation';
    end if;
    if outra_aberta then
      raise exception 'Encerre a atividade aberta antes' using errcode = 'check_violation';
    end if;
    update public.atividades
       set referencia_revelada = (comando = 'revelar_referencia')
     where id = a.id;
    update public.eventos set atividade_atual_id = a.id where id = a.evento_id;

  else
    raise exception 'Comando desconhecido: %', comando using errcode = 'invalid_parameter_value';
  end if;
end;
$$;

-- Conferência.
do $$
declare
  c jsonb := '{"opcoes": ["A", "B", "C", "D"], "min_escolhas": 2, "max_escolhas": 3}';
begin
  if not public.config_atividade_valida('selecao', c)
     or public.config_atividade_valida('selecao', '{"opcoes": ["A", "B", "C"], "min_escolhas": 2, "max_escolhas": 4}')
     or public.normalizar_resposta('selecao', c, '{"opcoes": [3, 1]}') <> '{"opcoes": [1, 3]}'::jsonb
     or public.normalizar_resposta('selecao', c, '{"opcoes": [1]}') is not null
     or public.normalizar_resposta('selecao', c, '{"opcoes": [0, 1, 2, 3]}') is not null
     or public.normalizar_resposta('selecao', c, '{"opcoes": [1, 1]}') is not null then
    raise exception 'FALHOU: regras da seleção múltipla';
  end if;
end $$;

select 'OK: 0030 aplicada' as resultado;
