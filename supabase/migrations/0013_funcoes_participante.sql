-- 0013 — ações do participante numa chamada só ao banco.
-- Com 40 celulares ao mesmo tempo, cada pedido ao Supabase entra na fila; juntar
-- cada ação num único pedido (em vez de 2 a 5) é o que mais reduz a espera.
-- As regras são as mesmas de utils/entrada.ts, utils/sala.ts e lib/atividades.ts.
--
-- Só o servidor do Pulse (chave secreta, papel service_role) executa estas funções.

-- ---------------------------------------------------------------
-- Validação da resposta (mesmas regras de validarValor em lib/atividades.ts).
-- Devolve o valor normalizado, ou null se for inválido.
-- ---------------------------------------------------------------
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
    -- Só os valores da escala: min + k * passo (tolerância para arredondamento do navegador).
    passos := (n - (config ->> 'min')::numeric) / (config ->> 'passo')::numeric;
    if abs(passos - round(passos)) > 0.000001 then
      return null;
    end if;
    return jsonb_build_object(
      'numero', (config ->> 'min')::numeric + round(passos) * (config ->> 'passo')::numeric
    );

  elsif tipo = 'nuvem' then
    if coalesce(jsonb_typeof(valor -> 'palavras'), '') <> 'array' then
      return null;
    end if;
    maximo := (config ->> 'max_palavras')::integer;
    -- minúsculas, espaços juntados e aparados, até 40 caracteres, sem vazias e sem repetidas
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
  end if;

  return null;
end;
$$;

-- ---------------------------------------------------------------
-- Entrar: limite de tentativas, evento pelo código, inscrição pelo e-mail,
-- registro da tentativa e criação da sessão, tudo numa chamada.
-- O servidor gera o token e manda só o hash (o banco nunca vê o token).
--
-- Devolve {"resultado": "ok", "expira_em": ...} ou
--         {"resultado": "bloqueado" | "nao_conferem" | "terminou"}.
-- ---------------------------------------------------------------
create or replace function public.sala_entrar(codigo text, email text, ip_hash text, token_hash text)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
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
     where t.ip_hash = sala_entrar.ip_hash
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
    insert into public.tentativas_entrada (ip_hash, sucesso) values (sala_entrar.ip_hash, false);
    return jsonb_build_object('resultado', 'nao_conferem');
  end if;

  select e.id, e.data_fim into ev
    from public.eventos e
   where e.codigo_acesso = sala_entrar.codigo and e.estado <> 'encerrado';

  if not found then
    if exists (select 1 from public.eventos e where e.codigo_acesso = sala_entrar.codigo) then
      return jsonb_build_object('resultado', 'terminou');
    end if;
    insert into public.tentativas_entrada (ip_hash, sucesso) values (sala_entrar.ip_hash, false);
    return jsonb_build_object('resultado', 'nao_conferem');
  end if;

  select i.id into inscricao
    from public.inscricoes i
    join public.pessoas p on p.id = i.pessoa_id
   where i.evento_id = ev.id and p.email = sala_entrar.email;

  if inscricao is null then
    insert into public.tentativas_entrada (ip_hash, sucesso) values (sala_entrar.ip_hash, false);
    return jsonb_build_object('resultado', 'nao_conferem');
  end if;

  insert into public.tentativas_entrada (ip_hash, sucesso) values (sala_entrar.ip_hash, true);

  -- Validade: fim do evento + 1 dia (23h59 de Brasília); no mínimo 12 horas a partir de agora.
  expira := greatest(
    ((ev.data_fim + 1) + time '23:59:59') at time zone 'America/Sao_Paulo',
    now() + interval '12 hours'
  );
  insert into public.sessoes_participante (inscricao_id, token_hash, expira_em)
  values (inscricao, sala_entrar.token_hash, expira);

  return jsonb_build_object('resultado', 'ok', 'expira_em', expira);
end;
$$;

-- ---------------------------------------------------------------
-- Estado da sala: quem é o participante, o evento, a atividade atual e a
-- resposta dele, numa chamada. Nunca devolve resultado nem a referência da escala.
-- Devolve null se a sessão não existe ou venceu.
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

  -- Registra o acesso no máximo a cada 5 minutos.
  if s.ultimo_acesso < now() - interval '5 minutes' then
    update public.sessoes_participante set ultimo_acesso = now() where id = s.sessao_id;
  end if;

  if s.atividade_atual_id is not null then
    select jsonb_build_object(
             'id', a.id,
             'tipo', a.tipo,
             'enunciado', a.enunciado,
             'config', case when a.tipo = 'escala' then a.config - 'referencia' else a.config end,
             'estado', a.estado
           )
      into atividade
      from public.atividades a
     where a.id = s.atividade_atual_id and a.estado <> 'fechada';

    if atividade ->> 'estado' = 'aberta' then
      select r.valor into resposta
        from public.respostas r
       where r.atividade_id = s.atividade_atual_id
         and r.inscricao_id = s.inscricao_id
         and r.rodada = 1;
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

-- ---------------------------------------------------------------
-- Responder: confere a sessão, a atividade (aberta e do mesmo evento) e o valor,
-- e grava ou substitui a resposta, numa chamada.
-- Devolve {"resultado": "ok", "evento_id": ...} ou
--         {"resultado": "sem_sessao" | "invalida" | "encerrada" | "valor_invalido"}.
-- ---------------------------------------------------------------
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

  select ativ.id, ativ.evento_id, ativ.tipo, ativ.config, ativ.estado
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
  values (a.id, s.inscricao_id, 1, normalizado)
  on conflict (atividade_id, inscricao_id, rodada)
  do update set valor = excluded.valor;

  return jsonb_build_object('resultado', 'ok', 'evento_id', s.evento_id);
end;
$$;

revoke execute on function public.normalizar_resposta(text, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.sala_entrar(text, text, text, text) from public, anon, authenticated;
revoke execute on function public.sala_estado(text) from public, anon, authenticated;
revoke execute on function public.sala_responder(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.normalizar_resposta(text, jsonb, jsonb) to service_role;
grant execute on function public.sala_entrar(text, text, text, text) to service_role;
grant execute on function public.sala_estado(text) to service_role;
grant execute on function public.sala_responder(text, uuid, jsonb) to service_role;
