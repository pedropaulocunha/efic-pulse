-- 0019 — encerrar e reabrir evento.
-- Encerrar: o instrutor do evento (ou o admin). Encerra a atividade aberta, e o
-- código de acesso fica livre para outro evento.
-- Reabrir: só o admin. Se o código já foi pego por outro evento, ganha um novo.

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

revoke execute on function public.encerrar_evento(uuid) from public, anon;
grant execute on function public.encerrar_evento(uuid) to authenticated;

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

revoke execute on function public.reabrir_evento(uuid) from public, anon;
grant execute on function public.reabrir_evento(uuid) to authenticated;

-- Garantia no banco: um instrutor não tira o evento de "encerrado" por outro
-- caminho (a política de UPDATE de eventos permite que ele altere o próprio
-- evento). O servidor e o SQL Editor (sem usuário logado) não são afetados.
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

create trigger eventos_conferir_reabertura
  before update of estado on public.eventos
  for each row execute function public.conferir_reabertura();
