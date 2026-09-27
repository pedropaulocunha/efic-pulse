-- 0015 — caso em rodadas: a mesma pergunta aberta de novo (rodada 2, 3...),
-- para comparar antes e depois da discussão. Vale para múltipla, escala,
-- número e ordenar; nuvem e aberta ficam sempre na rodada 1.

alter table public.atividades
  add column rodada_atual integer not null default 1
    constraint atividades_rodada_atual_check check (rodada_atual >= 1);

-- Resposta só entra na rodada atual da atividade (além das regras da 0011).
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

-- Comandos do controle, agora com "nova_rodada".
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

-- Estado da sala: agora informa a rodada e busca a resposta da rodada atual.
create or replace function public.sala_estado(token_hash text)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  s record;
  atividade jsonb;
  resposta jsonb;
begin
  select ses.id as sessao_id, ses.expira_em, ses.ultimo_acesso,
         i.id as inscricao_id, p.nome,
         e.id as evento_id, e.nome_turma, e.codigo_acesso, e.estado, e.atividade_atual_id,
         c.nome as cooperativa
    into s
    from public.sessoes_participante ses
    join public.inscricoes i on i.id = ses.inscricao_id
    join public.pessoas p on p.id = i.pessoa_id
    join public.eventos e on e.id = i.evento_id
    left join public.cooperativas c on c.id = e.cooperativa_id
   where ses.token_hash = sala_estado.token_hash;

  if not found then
    return null;
  end if;
  if s.expira_em <= now() then
    delete from public.sessoes_participante where id = s.sessao_id;
    return null;
  end if;

  if s.ultimo_acesso < now() - interval '5 minutes' then
    update public.sessoes_participante set ultimo_acesso = now() where id = s.sessao_id;
  end if;

  if s.atividade_atual_id is not null then
    select jsonb_build_object(
             'id', a.id,
             'tipo', a.tipo,
             'enunciado', a.enunciado,
             'config', case when a.tipo in ('escala', 'numero') then a.config - 'referencia' else a.config end,
             'estado', a.estado,
             'rodada', a.rodada_atual
           )
      into atividade
      from public.atividades a
     where a.id = s.atividade_atual_id and a.estado <> 'fechada';

    if atividade ->> 'estado' = 'aberta' then
      select r.valor into resposta
        from public.respostas r
       where r.atividade_id = s.atividade_atual_id
         and r.inscricao_id = s.inscricao_id
         and r.rodada = (atividade ->> 'rodada')::integer;
    end if;
  end if;

  return jsonb_build_object(
    'participante', jsonb_build_object(
      'sessaoId', s.sessao_id,
      'inscricaoId', s.inscricao_id,
      'nome', s.nome,
      'evento', jsonb_build_object(
        'id', s.evento_id,
        'nome_turma', s.nome_turma,
        'codigo_acesso', s.codigo_acesso,
        'estado', s.estado,
        'cooperativa', s.cooperativa,
        'atividade_atual_id', s.atividade_atual_id
      )
    ),
    'sala', jsonb_build_object(
      'eventoEncerrado', s.estado = 'encerrado',
      'atividade', atividade,
      'resposta', resposta
    )
  );
end;
$$;

-- Responder: grava na rodada atual da atividade.
create or replace function public.sala_responder(token_hash text, atividade uuid, valor jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  s record;
  a record;
  normalizado jsonb;
begin
  select ses.inscricao_id, i.evento_id
    into s
    from public.sessoes_participante ses
    join public.inscricoes i on i.id = ses.inscricao_id
   where ses.token_hash = sala_responder.token_hash and ses.expira_em > now();
  if not found then
    return jsonb_build_object('resultado', 'sem_sessao');
  end if;

  select ativ.id, ativ.evento_id, ativ.tipo, ativ.config, ativ.estado, ativ.rodada_atual
    into a
    from public.atividades ativ
   where ativ.id = sala_responder.atividade;
  if not found or a.evento_id <> s.evento_id then
    return jsonb_build_object('resultado', 'invalida');
  end if;
  if a.estado <> 'aberta' then
    return jsonb_build_object('resultado', 'encerrada');
  end if;

  normalizado := public.normalizar_resposta(a.tipo, a.config, sala_responder.valor);
  if normalizado is null then
    return jsonb_build_object('resultado', 'valor_invalido');
  end if;

  insert into public.respostas (atividade_id, inscricao_id, rodada, valor)
  values (a.id, s.inscricao_id, a.rodada_atual, normalizado)
  on conflict (atividade_id, inscricao_id, rodada)
  do update set valor = excluded.valor;

  return jsonb_build_object('resultado', 'ok', 'evento_id', s.evento_id);
end;
$$;

revoke execute on function public.sala_estado(text) from public, anon, authenticated;
revoke execute on function public.sala_responder(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.sala_estado(text) to service_role;
grant execute on function public.sala_responder(text, uuid, jsonb) to service_role;
