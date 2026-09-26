-- 0006 — só o admin apaga evento. O instrutor continua lendo, criando e
-- alterando os próprios eventos, mas não os apaga.
-- Pode ser rodada mais de uma vez sem erro.

begin;

drop policy if exists eventos_delete on public.eventos;
drop policy if exists eventos_delete_admin on public.eventos;

create policy eventos_delete_admin on public.eventos
  for delete to authenticated
  using ((select public.usuario_e_admin()));

commit;
