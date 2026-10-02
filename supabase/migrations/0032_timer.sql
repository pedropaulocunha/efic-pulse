-- 0032 — timer opcional por pergunta (tempo para responder).
--   * tempo_resposta_seg (10 s a 30 min) na pergunta do evento e na da biblioteca.
--     Não faz parte da "pergunta" para o comparativo: pode mudar no evento.
--   * timer_fim: quando o tempo acaba. Começa em "Abrir" e em "Nova rodada";
--     "mais_tempo" soma 30 s; "Encerrar" apaga.
--   * Só AVISA (decisão do Pedro, 02/10/2026): a votação continua aberta depois
--     de zerar, até o instrutor encerrar.
--   * sala_estado entrega ao celular o tempo que falta pelo relógio do banco.
-- As funções abaixo são as de 0030 e 0028, com o timer acrescentado.

-- Trava: se este arquivo chegar com os acentos trocados, para aqui.
do $$
begin
  if length('ção') <> 3 then
    raise exception 'ACENTOS TROCADOS AO COLAR. Copie de novo com o comando que tem -Encoding UTF8.';
  end if;
end $$;

alter table public.atividades
  add column tempo_resposta_seg integer
    constraint atividades_tempo_resposta_check check (tempo_resposta_seg between 10 and 1800),
  add column timer_fim timestamptz;
alter table public.modelo_perguntas
  add column tempo_resposta_seg integer
    constraint modelo_perguntas_tempo_resposta_check check (tempo_resposta_seg between 10 and 1800);

-- comandar_atividade (versão de 0030_funcoes_selecao.sql, com o timer e o comando mais_tempo)
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
  select id, evento_id, estado, tipo, config, tempo_resposta_seg
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
       set estado = 'encerrada', encerrada_em = now(), timer_fim = null
     where evento_id = a.evento_id and estado = 'aberta' and id <> a.id;
    update public.atividades
       set estado = 'aberta', aberta_em = now(), encerrada_em = null,
           timer_fim = case when a.tempo_resposta_seg is null then null else now() + make_interval(secs => a.tempo_resposta_seg) end
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
       set estado = 'encerrada', encerrada_em = now(), timer_fim = null
     where evento_id = a.evento_id and estado = 'aberta' and id <> a.id;
    -- Nova rodada começa aberta e com o resultado escondido no telão.
    update public.atividades
       set rodada_atual = rodada_atual + 1,
           estado = 'aberta', aberta_em = now(), encerrada_em = null,
           resultado_visivel = false,
           timer_fim = case when a.tempo_resposta_seg is null then null else now() + make_interval(secs => a.tempo_resposta_seg) end
     where id = a.id;
    update public.eventos set atividade_atual_id = a.id where id = a.evento_id;

  elsif comando = 'encerrar' then
    if a.estado <> 'aberta' then
      raise exception 'A atividade não está aberta' using errcode = 'check_violation';
    end if;
    update public.atividades
       set estado = 'encerrada', encerrada_em = now(), timer_fim = null
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

  elsif comando = 'mais_tempo' then
    -- +30 s no timer (se já zerou, conta 30 s a partir de agora).
    if a.estado <> 'aberta' then
      raise exception 'A atividade não está aberta' using errcode = 'check_violation';
    end if;
    update public.atividades
       set timer_fim = greatest(coalesce(timer_fim, now()), now()) + interval '30 seconds'
     where id = a.id;

  else
    raise exception 'Comando desconhecido: %', comando using errcode = 'invalid_parameter_value';
  end if;
end;
$$;

-- sala_estado (versão de 0028_observacao.sql, com o tempo que falta)
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
    left join public.pessoas p on p.id = i.pessoa_id
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
             'observacao', a.observacao,
             -- Tempo que falta, pelo relógio do banco (o celular não confia no próprio relógio).
             'restante_ms', case when a.timer_fim is null then null
                                 else round(extract(epoch from (a.timer_fim - now())) * 1000) end,
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

-- duplicar_atividade (versão de 0028_observacao.sql, com o tempo)
create or replace function public.duplicar_atividade(atividade uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  a record;
  nova uuid;
begin
  select id, evento_id, bloco_id, ordem, tipo, enunciado, config, observacao, tempo_resposta_seg
    into a from public.atividades where id = atividade;
  if not found then
    raise exception 'Atividade não encontrada' using errcode = 'no_data_found';
  end if;

  update public.atividades set ordem = ordem + 1 where bloco_id = a.bloco_id and ordem > a.ordem;
  insert into public.atividades (evento_id, bloco_id, ordem, tipo, enunciado, config, observacao, tempo_resposta_seg)
  values (a.evento_id, a.bloco_id, a.ordem + 1, a.tipo, left(a.enunciado || ' (cópia)', 300), a.config, a.observacao,
          a.tempo_resposta_seg)
  returning id into nova;
  return nova;
end;
$$;

-- duplicar_bloco (versão de 0028_observacao.sql, com o tempo)
create or replace function public.duplicar_bloco(bloco uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  b record;
  novo uuid;
begin
  select id, evento_id, ordem, titulo into b from public.blocos where id = bloco;
  if not found then
    raise exception 'Bloco não encontrado' using errcode = 'no_data_found';
  end if;

  update public.blocos set ordem = ordem + 1 where evento_id = b.evento_id and ordem > b.ordem;
  insert into public.blocos (evento_id, ordem, titulo)
  values (b.evento_id, b.ordem + 1, left(b.titulo || ' (cópia)', 120))
  returning id into novo;

  insert into public.atividades (evento_id, bloco_id, ordem, tipo, enunciado, config, observacao, tempo_resposta_seg)
  select a.evento_id, novo, a.ordem, a.tipo, a.enunciado, a.config, a.observacao, a.tempo_resposta_seg
    from public.atividades a where a.bloco_id = b.id;
  return novo;
end;
$$;

-- usar_modelo (versão de 0028_observacao.sql, com o tempo)
create or replace function public.usar_modelo(evento uuid, modelo uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  m record;
  novo uuid;
begin
  select id, titulo into m from public.modelos where id = modelo and not arquivado;
  if not found then
    raise exception 'Modelo não encontrado' using errcode = 'no_data_found';
  end if;
  if not exists (select 1 from public.eventos where id = evento) then
    raise exception 'Evento não encontrado' using errcode = 'no_data_found';
  end if;

  insert into public.blocos (evento_id, ordem, titulo)
  values (evento, coalesce((select max(ordem) from public.blocos where evento_id = evento), 0) + 1, m.titulo)
  returning id into novo;

  insert into public.atividades (evento_id, bloco_id, ordem, tipo, enunciado, config, observacao, tempo_resposta_seg,
                                 modelo_pergunta_id)
  select evento, novo, row_number() over (order by p.ordem, p.id), p.tipo, p.enunciado, p.config, p.observacao,
         p.tempo_resposta_seg, p.id
    from public.modelo_perguntas p where p.modelo_id = m.id;
  return novo;
end;
$$;

-- duplicar_modelo (versão de 0028_observacao.sql, com o tempo)
create or replace function public.duplicar_modelo(modelo uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  m record;
  novo uuid;
begin
  select id, titulo into m from public.modelos where id = modelo;
  if not found then
    raise exception 'Modelo não encontrado' using errcode = 'no_data_found';
  end if;
  insert into public.modelos (titulo) values (left(m.titulo || ' (cópia)', 120)) returning id into novo;
  insert into public.modelo_perguntas (modelo_id, ordem, tipo, enunciado, config, observacao, tempo_resposta_seg)
  select novo, p.ordem, p.tipo, p.enunciado, p.config, p.observacao, p.tempo_resposta_seg from public.modelo_perguntas p where p.modelo_id = m.id;
  return novo;
end;
$$;

select 'OK: 0032 aplicada' as resultado;
