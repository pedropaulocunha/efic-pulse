-- 0014 — três tipos novos de atividade: ordenar, numero (resposta numérica) e aberta.
-- Primeiro as funções de validação passam a conhecer os tipos novos; depois o CHECK muda.

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
       and (config ->> 'max_palavras')::numeric in (1, 2, 3);

  elsif tipo = 'aberta' then
    return coalesce(jsonb_typeof(config -> 'max_caracteres'), '') = 'number'
       and (config ->> 'max_caracteres')::numeric between 20 and 500
       and (config ->> 'max_caracteres')::numeric = trunc((config ->> 'max_caracteres')::numeric);
  end if;

  return false;
end;
$$;

-- Mesmas regras de validarValor (lib/atividades.ts). Devolve o valor normalizado ou null.
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

revoke execute on function public.normalizar_resposta(text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.normalizar_resposta(text, jsonb, jsonb) to service_role;

-- Lista fechada de tipos: o CHECK acompanha o código (lib/atividades.ts).
alter table public.atividades drop constraint atividades_tipo_check;
alter table public.atividades
  add constraint atividades_tipo_check
  check (tipo in ('multipla', 'escala', 'nuvem', 'ordenar', 'numero', 'aberta'));
