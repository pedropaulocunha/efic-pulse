-- 0033 — respostas de texto livre liberadas automaticamente (pedido do Pedro, 03/10/2026).
--   * A resposta aberta entra no mural na hora (aprovada = true).
--   * O instrutor continua podendo tirar do mural (false) e devolver (true), por moderar_resposta.
--   * Tirada do mural continua fora mesmo se a pessoa editar o texto.
--   * As que estavam esperando aprovação em atividades AINDA ABERTAS entram no mural agora.
-- sala_responder é a de 0017, só com a regra nova de aprovação.

-- Trava: se este arquivo chegar com os acentos trocados, para aqui.
do $$
begin
  if length('ção') <> 3 then
    raise exception 'ACENTOS TROCADOS AO COLAR. Copie de novo com o comando que tem -Encoding UTF8.';
  end if;
end $$;

-- sala_responder (versão de 0017_respostas_abertas.sql, com a liberação automática)
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

  -- Texto livre entra direto no mural (aprovada = true). Se o instrutor tirou do
  -- mural (false), continua fora mesmo que a pessoa edite o texto.
  insert into public.respostas as r (atividade_id, inscricao_id, rodada, valor, aprovada)
  values (a.id, s.inscricao_id, a.rodada_atual, normalizado, case when a.tipo = 'aberta' then true end)
  on conflict (atividade_id, inscricao_id, rodada)
  do update set valor = excluded.valor,
                aprovada = case when r.aprovada is false then false else excluded.aprovada end;

  return jsonb_build_object('resultado', 'ok', 'evento_id', s.evento_id);
end;
$$;

revoke execute on function public.sala_responder(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.sala_responder(text, uuid, jsonb) to service_role;

-- Pendentes de votações ainda abertas: liberadas agora, como as novas.
update public.respostas r
   set aprovada = true
  from public.atividades a
 where a.id = r.atividade_id and a.tipo = 'aberta' and a.estado = 'aberta' and r.aprovada is null;

select 'OK: 0033 aplicada' as resultado;
