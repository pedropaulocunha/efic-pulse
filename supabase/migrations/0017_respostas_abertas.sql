-- 0017 — respostas abertas moderadas: só aparecem no telão depois de aprovadas
-- pelo instrutor. O texto nunca carrega o nome de quem escreveu.
-- aprovada: null = esperando o instrutor; true = aprovada (vai para o mural);
--           false = recusada (não vai, mas pode ser aprovada depois).

alter table public.respostas
  add column aprovada boolean;

-- A conferência (atividade aberta, mesmo evento, rodada atual) vale quando a
-- resposta nasce ou muda de conteúdo — não quando o instrutor só aprova ou recusa.
drop trigger respostas_conferir on public.respostas;
create trigger respostas_conferir
  before insert or update of atividade_id, inscricao_id, rodada, valor on public.respostas
  for each row execute function public.conferir_resposta();

-- Responder: se o participante muda o texto, ele volta a esperar aprovação.
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
  do update set valor = excluded.valor, aprovada = null;

  return jsonb_build_object('resultado', 'ok', 'evento_id', s.evento_id);
end;
$$;

revoke execute on function public.sala_responder(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.sala_responder(text, uuid, jsonb) to service_role;

-- Lista das respostas abertas de uma atividade, para o instrutor moderar.
-- Só texto e situação: nunca quem escreveu. Para quem não é o instrutor do
-- evento (nem admin), devolve null.
create or replace function public.respostas_abertas(atividade uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a record;
begin
  select id, evento_id, tipo into a from public.atividades where id = atividade;
  if not found or a.tipo <> 'aberta' then
    return null;
  end if;
  if not (public.usuario_e_admin() or public.usuario_instrutor_do_evento(a.evento_id)) then
    return null;
  end if;

  return coalesce(
    (select jsonb_agg(
              jsonb_build_object('id', r.id, 'texto', r.valor ->> 'texto', 'aprovada', r.aprovada)
              order by r.aprovada nulls first, r.atualizado_em desc)
       from public.respostas r
      where r.atividade_id = a.id),
    '[]'::jsonb
  );
end;
$$;

revoke execute on function public.respostas_abertas(uuid) from public, anon;
grant execute on function public.respostas_abertas(uuid) to authenticated;

-- Aprovar ou recusar uma resposta aberta. Só o instrutor do evento (ou o admin).
-- Devolve o id do evento (para avisar o telão) ou null se não pode.
create or replace function public.moderar_resposta(resposta uuid, aprovar boolean)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  evento uuid;
begin
  select a.evento_id into evento
    from public.respostas r
    join public.atividades a on a.id = r.atividade_id
   where r.id = resposta and a.tipo = 'aberta';
  if evento is null then
    return null;
  end if;
  if not (public.usuario_e_admin() or public.usuario_instrutor_do_evento(evento)) then
    return null;
  end if;

  -- Só muda "aprovada": o gatilho de conferência não roda (ver acima), então
  -- moderar vale também depois de encerrada a votação.
  update public.respostas set aprovada = moderar_resposta.aprovar where id = resposta;
  return evento;
end;
$$;

revoke execute on function public.moderar_resposta(uuid, boolean) from public, anon;
grant execute on function public.moderar_resposta(uuid, boolean) to authenticated;
