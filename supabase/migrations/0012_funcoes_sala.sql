-- 0012 — funções da sala ao vivo: comandar atividade, reordenar e resultado agregado.

-- Comandos do instrutor no controle. Roda com as permissões de quem chama
-- (SECURITY INVOKER): as políticas garantem que o instrutor só comanda os
-- próprios eventos. Tudo numa transação só.
--
--   abrir               encerra a que estiver aberta e abre esta; vira a atual
--   encerrar            encerra esta (continua sendo a atual, para mostrar resultado)
--   mostrar_resultado   / esconder_resultado  — vira a atual
--   revelar_referencia  / esconder_referencia — só escala com referência; vira a atual
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
    if a.tipo <> 'escala' or coalesce(jsonb_typeof(a.config -> 'referencia'), 'null') = 'null' then
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

revoke execute on function public.comandar_atividade(uuid, text) from public, anon;
grant execute on function public.comandar_atividade(uuid, text) to authenticated;

-- Troca a atividade de lugar com a vizinha de cima (-1) ou de baixo (+1).
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

revoke execute on function public.mover_atividade(uuid, integer) from public, anon;
grant execute on function public.mover_atividade(uuid, integer) to authenticated;

-- Resultado agregado de uma atividade (rodada 1). SÓ NÚMEROS: nunca devolve
-- quem respondeu. Quem pode ler: o instrutor do evento, o admin e o servidor
-- (chave secreta, usada pela projeção). Para os demais devolve null.
create or replace function public.resultado_atividade(atividade uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a record;
  papel_jwt text;
  total integer;
  dados jsonb;
begin
  select id, evento_id, tipo, config into a from public.atividades where id = atividade;
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

  select count(*) into total
    from public.respostas r
   where r.atividade_id = a.id and r.rodada = 1;

  if a.tipo = 'multipla' then
    select coalesce(jsonb_agg(coalesce(c.n, 0) order by g.i), '[]'::jsonb)
      into dados
      from generate_series(0, jsonb_array_length(a.config -> 'opcoes') - 1) as g(i)
      left join (
        select (r.valor ->> 'opcao')::integer as opcao, count(*) as n
          from public.respostas r
         where r.atividade_id = a.id and r.rodada = 1
         group by 1
      ) c on c.opcao = g.i;
    return jsonb_build_object('tipo', 'multipla', 'total', total, 'contagem', dados);

  elsif a.tipo = 'escala' then
    with v as (
      select (r.valor ->> 'numero')::numeric as x
        from public.respostas r
       where r.atividade_id = a.id and r.rodada = 1
    )
    select jsonb_build_object(
      'tipo', 'escala',
      'total', total,
      'media', (select round(avg(x), 2) from v),
      'mediana', (select percentile_cont(0.5) within group (order by x) from v),
      'histograma', coalesce(
        (select jsonb_agg(jsonb_build_object('valor', h.x, 'n', h.n) order by h.x)
           from (select x, count(*) as n from v group by x) h),
        '[]'::jsonb)
    ) into dados;
    return dados;

  elsif a.tipo = 'nuvem' then
    select coalesce(jsonb_agg(jsonb_build_object('palavra', p.palavra, 'n', p.n) order by p.n desc, p.palavra), '[]'::jsonb)
      into dados
      from (
        select lower(trim(w)) as palavra, count(*) as n
          from public.respostas r,
               jsonb_array_elements_text(r.valor -> 'palavras') as w
         where r.atividade_id = a.id and r.rodada = 1 and length(trim(w)) > 0
         group by 1
         order by 2 desc, 1
         limit 100
      ) p;
    return jsonb_build_object('tipo', 'nuvem', 'total', total, 'palavras', dados);
  end if;

  return null;
end;
$$;

revoke execute on function public.resultado_atividade(uuid) from public, anon;
grant execute on function public.resultado_atividade(uuid) to authenticated, service_role;
