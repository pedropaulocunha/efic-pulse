-- 0027 — nuvem de palavras: até 5 palavras por participante (antes, até 3).
-- Recria config_atividade_valida igual à de 0014, mudando só a lista da nuvem
-- de (1, 2, 3) para (1, 2, 3, 4, 5). O CHECK das atividades e das perguntas da
-- biblioteca usa esta função, então a regra nova vale para as duas.

-- Trava: se este arquivo chegar com os acentos trocados, para aqui.
do $$
begin
  if length('ção') <> 3 then
    raise exception 'ACENTOS TROCADOS AO COLAR. Copie de novo com o comando que tem -Encoding UTF8.';
  end if;
end $$;

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
       and (config ->> 'max_palavras')::numeric in (1, 2, 3, 4, 5);

  elsif tipo = 'aberta' then
    return coalesce(jsonb_typeof(config -> 'max_caracteres'), '') = 'number'
       and (config ->> 'max_caracteres')::numeric between 20 and 500
       and (config ->> 'max_caracteres')::numeric = trunc((config ->> 'max_caracteres')::numeric);
  end if;

  return false;
end;
$$;

-- Conferência: 5 aceita, 6 recusa.
do $$
begin
  if not public.config_atividade_valida('nuvem', '{"max_palavras": 5}')
     or public.config_atividade_valida('nuvem', '{"max_palavras": 6}') then
    raise exception 'FALHOU: limite da nuvem não ficou em 5 palavras';
  end if;
end $$;

select 'OK: 0027 aplicada' as resultado;
