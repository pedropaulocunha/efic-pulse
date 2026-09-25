-- 0005 — inscrições (pessoa em evento).

create table public.inscricoes (
  id uuid primary key default gen_random_uuid(),
  pessoa_id uuid not null references public.pessoas (id) on delete restrict,
  evento_id uuid not null references public.eventos (id) on delete cascade,
  agencia text,
  origem text not null
    constraint inscricoes_origem_check check (origem in ('lista', 'cadastro_sala')),
  confirmada boolean not null default false,
  criado_em timestamptz not null default now(),
  constraint inscricoes_pessoa_evento_unico unique (pessoa_id, evento_id)
);

create index inscricoes_evento_id_idx on public.inscricoes (evento_id);
create index inscricoes_pessoa_id_idx on public.inscricoes (pessoa_id);

alter table public.inscricoes enable row level security;

revoke all on table public.inscricoes from anon;
grant select, insert, update, delete on table public.inscricoes to authenticated;

-- Admin: tudo. Instrutor: só inscrições dos seus eventos.

create policy inscricoes_select on public.inscricoes
  for select to authenticated
  using (
    (select public.usuario_e_admin())
    or (select public.usuario_instrutor_do_evento(evento_id))
  );

create policy inscricoes_insert on public.inscricoes
  for insert to authenticated
  with check (
    (select public.usuario_e_admin())
    or (select public.usuario_instrutor_do_evento(evento_id))
  );

create policy inscricoes_update on public.inscricoes
  for update to authenticated
  using (
    (select public.usuario_e_admin())
    or (select public.usuario_instrutor_do_evento(evento_id))
  )
  with check (
    (select public.usuario_e_admin())
    or (select public.usuario_instrutor_do_evento(evento_id))
  );

create policy inscricoes_delete on public.inscricoes
  for delete to authenticated
  using (
    (select public.usuario_e_admin())
    or (select public.usuario_instrutor_do_evento(evento_id))
  );
