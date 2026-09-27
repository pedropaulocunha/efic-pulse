-- 0022 — entrada só com o código do evento.
--   * sala_entrar_codigo: limite de tentativas, evento pelo código, teto de
--     participantes, inscrição anônima e sessão, numa chamada só.
--   * O código para de valer sozinho às 23h59 (Brasília) do último dia do evento,
--     mesmo que o instrutor esqueça de tocar em "Encerrar evento".
--   * sala_estado passa a aceitar inscrição sem pessoa.
-- Só o servidor do Pulse (chave secreta, papel service_role) executa estas funções.

-- Trava: se este arquivo chegar com os acentos trocados, para aqui.
do $$
begin
  if length('ção') <> 3 then
    raise exception 'ACENTOS TROCADOS AO COLAR. Copie de novo com o comando que tem -Encoding UTF8.';
  end if;
end $$;

-- ---------------------------------------------------------------
-- Entrar só com o código.
-- Devolve {"resultado": "ok", "expira_em": ...} ou
--         {"resultado": "bloqueado" | "nao_confere" | "terminou" | "lotado"}.
-- ---------------------------------------------------------------
create or replace function public.sala_entrar_codigo(codigo text, ip_hash text, token_hash text)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  teto constant integer := 150;
  falhas integer;
  ev record;
  inscricao uuid;
  expira timestamptz;
begin
  -- 10 tentativas erradas SEGUIDAS em 15 minutos pelo mesmo IP bloqueiam.
  -- Uma entrada certa zera a contagem (celulares da sala saem pelo mesmo IP).
  with ultimas as (
    select t.sucesso, row_number() over (order by t.criado_em desc) as n
      from public.tentativas_entrada t
     where t.ip_hash = sala_entrar_codigo.ip_hash
       and t.criado_em >= now() - interval '15 minutes'
     order by t.criado_em desc
     limit 10
  )
  select coalesce((select min(n) - 1 from ultimas where sucesso), (select count(*) from ultimas))
    into falhas;
  if falhas >= 10 then
    return jsonb_build_object('resultado', 'bloqueado');
  end if;

  -- Faxina de vez em quando: tentativas com mais de um dia não servem para nada.
  if random() < 0.05 then
    delete from public.tentativas_entrada where criado_em < now() - interval '1 day';
  end if;

  if codigo !~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$' then
    insert into public.tentativas_entrada (ip_hash, sucesso) values (sala_entrar_codigo.ip_hash, false);
    return jsonb_build_object('resultado', 'nao_confere');
  end if;

  -- Evento com esse código, não encerrado e dentro do prazo (até 23h59 do último dia).
  select e.id, e.data_fim into ev
    from public.eventos e
   where e.codigo_acesso = sala_entrar_codigo.codigo
     and e.estado <> 'encerrado'
     and now() <= (e.data_fim + time '23:59:59') at time zone 'America/Sao_Paulo';

  if not found then
    if exists (select 1 from public.eventos e where e.codigo_acesso = sala_entrar_codigo.codigo) then
      return jsonb_build_object('resultado', 'terminou');
    end if;
    insert into public.tentativas_entrada (ip_hash, sucesso) values (sala_entrar_codigo.ip_hash, false);
    return jsonb_build_object('resultado', 'nao_confere');
  end if;

  -- Teto de participantes por evento, contra abuso de quem viu o código de fora.
  if (select count(*) from public.inscricoes i
       where i.evento_id = ev.id and i.origem = 'anonima') >= teto then
    return jsonb_build_object('resultado', 'lotado');
  end if;

  insert into public.inscricoes (evento_id, pessoa_id, origem, confirmada)
  values (ev.id, null, 'anonima', true)
  returning id into inscricao;

  insert into public.tentativas_entrada (ip_hash, sucesso) values (sala_entrar_codigo.ip_hash, true);

  -- Validade da sessão: fim do evento + 1 dia (23h59 de Brasília); no mínimo 12 horas.
  expira := greatest(
    ((ev.data_fim + 1) + time '23:59:59') at time zone 'America/Sao_Paulo',
    now() + interval '12 hours'
  );
  insert into public.sessoes_participante (inscricao_id, token_hash, expira_em)
  values (inscricao, sala_entrar_codigo.token_hash, expira);

  return jsonb_build_object('resultado', 'ok', 'expira_em', expira);
end;
$$;

-- ---------------------------------------------------------------
-- Estado da sala: igual à versão de 0015, com a pessoa opcional (left join).
-- ---------------------------------------------------------------
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

revoke execute on function public.sala_entrar_codigo(text, text, text) from public, anon, authenticated;
revoke execute on function public.sala_estado(text) from public, anon, authenticated;
grant execute on function public.sala_entrar_codigo(text, text, text) to service_role;
grant execute on function public.sala_estado(text) to service_role;

-- Conferência: a entrada nova existe e só o servidor a executa.
do $$
begin
  if has_function_privilege('anon', 'public.sala_entrar_codigo(text, text, text)', 'execute') then
    raise exception 'FALHOU: visitante sem login pode executar sala_entrar_codigo';
  end if;
end $$;

select 'OK: 0022 aplicada' as resultado;
