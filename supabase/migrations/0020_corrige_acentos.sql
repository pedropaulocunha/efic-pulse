-- 0020 — corrige os acentos das funções coladas com a codificação errada.
-- As migrações 0006 a 0019 foram copiadas pelo PowerShell sem "-Encoding UTF8",
-- e os textos acentuados dentro do código chegaram trocados ao banco. Efeitos:
--   * a nuvem não tirava os acentos ("crédito" e "credito" contavam separados);
--   * mensagens de erro com acentos trocados.
-- Aqui as funções afetadas são recriadas iguais, com os acentos certos.
-- Nenhuma regra de acesso muda.

-- Trava: se ESTE arquivo também chegar com os acentos trocados, para aqui.
do $$
begin
  if length('ção') <> 3 then
    raise exception 'ACENTOS TROCADOS AO COLAR. Copie de novo com o comando que tem -Encoding UTF8.';
  end if;
end $$;

-- gerar_codigo_acesso (versão de 0007_eventos_codigo_acesso.sql)
create or replace function public.gerar_codigo_acesso()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  alfabeto constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  codigo text;
  tentativas integer := 0;
begin
  loop
    codigo := '';
    for i in 1..4 loop
      codigo := codigo || substr(alfabeto, 1 + floor(random() * length(alfabeto))::integer, 1);
    end loop;

    exit when not exists (
      select 1 from public.eventos e
       where e.codigo_acesso = codigo and e.estado <> 'encerrado'
    );

    tentativas := tentativas + 1;
    if tentativas > 50 then
      raise exception 'Não foi possível gerar um código de acesso livre';
    end if;
  end loop;

  return codigo;
end;
$$;

-- mover_atividade (versão de 0012_funcoes_sala.sql)
create or replace function public.mover_atividade(atividade uuid, direcao integer)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  a record;
  vizinha record;
  ordem_a integer;
  ordem_v integer;
begin
  select id, evento_id, ordem into a from public.atividades where id = atividade for update;
  if not found then
    raise exception 'Atividade não encontrada' using errcode = 'no_data_found';
  end if;

  if direcao < 0 then
    select id, ordem into vizinha from public.atividades
     where evento_id = a.evento_id and (ordem, id) < (a.ordem, a.id)
     order by ordem desc, id desc limit 1;
  else
    select id, ordem into vizinha from public.atividades
     where evento_id = a.evento_id and (ordem, id) > (a.ordem, a.id)
     order by ordem, id limit 1;
  end if;
  if vizinha.id is null then
    return; -- já está na ponta
  end if;

  -- Se as duas estão na mesma posição, renumera o evento (1, 2, 3...) antes de trocar.
  if a.ordem = vizinha.ordem then
    update public.atividades t
       set ordem = n.posicao
      from (
        select id, row_number() over (order by ordem, id) as posicao
          from public.atividades where evento_id = a.evento_id
      ) n
     where t.id = n.id;
  end if;

  select ordem into ordem_a from public.atividades where id = a.id;
  select ordem into ordem_v from public.atividades where id = vizinha.id;
  update public.atividades set ordem = ordem_v where id = a.id;
  update public.atividades set ordem = ordem_a where id = vizinha.id;
end;
$$;

-- conferir_resposta (versão de 0015_rodadas.sql)
create or replace function public.conferir_resposta()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  estado_atividade text;
  evento_atividade uuid;
  rodada_da_atividade integer;
  evento_inscricao uuid;
begin
  select a.estado, a.evento_id, a.rodada_atual
    into estado_atividade, evento_atividade, rodada_da_atividade
    from public.atividades a where a.id = new.atividade_id;
  select i.evento_id into evento_inscricao
    from public.inscricoes i where i.id = new.inscricao_id;

  if estado_atividade is distinct from 'aberta' then
    raise exception 'A atividade não está aberta' using errcode = 'check_violation';
  end if;
  if evento_atividade is distinct from evento_inscricao then
    raise exception 'Inscrição de outro evento' using errcode = 'check_violation';
  end if;
  if new.rodada is distinct from rodada_da_atividade then
    raise exception 'Resposta fora da rodada atual' using errcode = 'check_violation';
  end if;

  new.atualizado_em := now();
  return new;
end;
$$;

-- comandar_atividade (versão de 0015_rodadas.sql)
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
    if a.tipo not in ('multipla', 'escala', 'numero', 'ordenar') then
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

-- chave_palavra (versão de 0016_nuvem_limpa.sql)
create or replace function public.chave_palavra(palavra text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  w text;
  -- Palavras que já terminam em "s" no singular.
  excecoes constant text[] := array[
    'juros', 'onus', 'bonus', 'virus', 'lapis', 'tenis', 'status', 'campus', 'atlas',
    'pires', 'simples', 'mais', 'menos', 'depois', 'antes', 'apos', 'tras', 'pois',
    'tres', 'seis', 'dois', 'gas', 'mes', 'pais', 'deus', 'onibus', 'cais'
  ];
begin
  w := translate(
    lower(trim(regexp_replace(coalesce(palavra, ''), '\s+', ' ', 'g'))),
    'áàâãäéèêëíìîïóòôõöúùûüç',
    'aaaaaeeeeiiiiooooouuuuc'
  );
  if w = '' then
    return null;
  end if;
  if w = any (excecoes) then
    return w;
  end if;
  if length(w) > 4 and right(w, 3) in ('oes', 'aes') then
    return left(w, length(w) - 3) || 'ao';         -- renegociações → renegociacao
  end if;
  if length(w) > 3 and right(w, 2) = 'ns' then
    return left(w, length(w) - 2) || 'm';          -- bens → bem
  end if;
  if length(w) > 4 and right(w, 3) in ('res', 'zes') then
    return left(w, length(w) - 2);                 -- valores → valor
  end if;
  if length(w) > 3 and right(w, 1) = 's' and right(w, 2) not in ('ss', 'us', 'is') then
    return left(w, length(w) - 1);                 -- prazos → prazo
  end if;
  return w;
end;
$$;

-- resultado_atividade (versão de 0018_resultado_v2.sql)
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

-- encerrar_evento (versão de 0019_encerrar_evento.sql)
create or replace function public.encerrar_evento(evento uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.atividades
     set estado = 'encerrada', encerrada_em = now()
   where evento_id = evento and estado = 'aberta';
  update public.eventos set estado = 'encerrado' where id = evento;
  if not found then
    raise exception 'Evento não encontrado' using errcode = 'no_data_found';
  end if;
end;
$$;

-- reabrir_evento (versão de 0019_encerrar_evento.sql)
create or replace function public.reabrir_evento(evento uuid)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  codigo text;
begin
  if not public.usuario_e_admin() then
    raise exception 'Só o admin reabre evento' using errcode = 'insufficient_privilege';
  end if;

  begin
    update public.eventos set estado = 'planejamento'
     where id = evento and estado = 'encerrado'
    returning codigo_acesso into codigo;
  exception when unique_violation then
    -- O código foi reaproveitado por outro evento aberto: gera outro.
    update public.eventos
       set estado = 'planejamento', codigo_acesso = public.gerar_codigo_acesso()
     where id = evento and estado = 'encerrado'
    returning codigo_acesso into codigo;
  end;

  if codigo is null then
    raise exception 'Evento não encontrado ou não está encerrado' using errcode = 'no_data_found';
  end if;
  return codigo;
end;
$$;

-- conferir_reabertura (versão de 0019_encerrar_evento.sql)
create or replace function public.conferir_reabertura()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.estado = 'encerrado' and new.estado <> 'encerrado'
     and auth.uid() is not null and not public.usuario_e_admin() then
    raise exception 'Só o admin reabre evento' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

-- Conferência: com os acentos certos, a chave de "Créditos" é "credito".
do $$
begin
  if public.chave_palavra('Créditos') <> 'credito' or public.chave_palavra('Ações') <> 'acao' then
    raise exception 'FALHOU: a nuvem ainda não tira os acentos';
  end if;
end $$;
