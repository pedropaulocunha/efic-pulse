-- 0006 — só o admin apaga evento. O instrutor continua lendo, criando e
-- alterando os próprios eventos, mas não os apaga.

begin;

drop policy eventos_delete on public.eventos;

create policy eventos_delete_admin on public.eventos
  for delete to authenticated
  using ((select public.usuario_e_admin()));

commit;
