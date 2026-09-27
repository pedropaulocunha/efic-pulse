-- 0023 — blocos: grupos de atividades dentro do evento
-- (ex.: Abertura, Estudo de caso 1, Estudo de caso 2, Encerramento).
--   * A ordem na tela é: primeiro as atividades sem bloco, depois cada bloco
--     na ordem dele, e dentro de cada um a ordem das atividades.
--   * Subir a primeira atividade de um bloco leva-a para o fim do bloco de cima;
--     descer a última leva-a para o começo do bloco de baixo.
--   * Excluir um bloco não apaga as atividades: elas ficam sem bloco.

-- Trava: se este arquivo chegar com os acentos trocados, para aqui.
do $$
begin
  if length('ção') <> 3 then
    raise exception 'ACENTOS TROCADOS AO COLAR. Copie de novo com o comando que tem -Encoding UTF8.';
  end if;
end $$;

create table public.blocos (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.eventos (id) on delete cascade,
  ordem integer not null constraint blocos_ordem_check check (ordem >= 1),
  titulo text not null
    constraint blocos_titulo_check check (length(trim(titulo)) between 1 and 120),
  criado_em timestamptz not null default now(),
  -- Permite que a atividade aponte só para bloco do próprio evento.
  constraint blocos_evento_id_id_unico unique (evento_id, id)
);

create index blocos_evento_id_ordem_idx on public.blocos (evento_id, ordem);

alter table public.atividades
  add column bloco_id uuid,
  add constraint atividades_bloco_fk
    foreign key (evento_id, bloco_id)
    references public.blocos (evento_id, id)
    on delete set null (bloco_id);

create index atividades_bloco_id_idx on public.atividades (bloco_id);

alter table public.blocos enable row level security;

revoke all on table public.blocos from anon;
grant select, insert, update, delete on table public.blocos to authenticated, service_role;

-- Admin: tudo. Instrutor: só os blocos dos próprios eventos (igual às atividades).

create policy blocos_select on public.blocos
  for select to authenticated
  using (
    (select public.usuario_e_admin())
    or (select public.usuario_instrutor_do_evento(evento_id))
  );

create policy blocos_insert on public.blocos
  for insert to authenticated
  with check (
    (select public.usuario_e_admin())
    or (select public.usuario_instrutor_do_evento(evento_id))
  );

create policy blocos_update on public.blocos
  for update to authenticated
  using (
    (select public.usuario_e_admin())
    or (select public.usuario_instrutor_do_evento(evento_id))
  )
  with check (
    (select public.usuario_e_admin())
    or (select public.usuario_instrutor_do_evento(evento_id))
  );

create policy blocos_delete on public.blocos
  for delete to authenticated
  using (
    (select public.usuario_e_admin())
    or (select public.usuario_instrutor_do_evento(evento_id))
  );

-- ---------------------------------------------------------------
-- Mover atividade (substitui a versão de 0020): dentro do bloco, troca com a
-- vizinha; na ponta do bloco, passa para o bloco de cima ou de baixo.
-- A sequência de blocos é: "sem bloco" primeiro, depois os blocos na ordem.
-- ---------------------------------------------------------------
create or replace function public.mover_atividade(atividade uuid, direcao integer)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  a record;
  vizinha record;
  atual record;
  destino uuid;
  ordem_a integer;
  ordem_v integer;
begin
  select id, evento_id, bloco_id, ordem into a from public.atividades where id = atividade for update;
  if not found then
    raise exception 'Atividade não encontrada' using errcode = 'no_data_found';
  end if;

  -- 1) Vizinha no mesmo bloco: troca de lugar.
  if direcao < 0 then
    select id, ordem into vizinha from public.atividades
     where evento_id = a.evento_id and bloco_id is not distinct from a.bloco_id
       and (ordem, id) < (a.ordem, a.id)
     order by ordem desc, id desc limit 1;
  else
    select id, ordem into vizinha from public.atividades
     where evento_id = a.evento_id and bloco_id is not distinct from a.bloco_id
       and (ordem, id) > (a.ordem, a.id)
     order by ordem, id limit 1;
  end if;

  if vizinha.id is not null then
    -- Se as duas estão na mesma posição, renumera o bloco (1, 2, 3...) antes de trocar.
    if a.ordem = vizinha.ordem then
      update public.atividades t
         set ordem = n.posicao
        from (
          select id, row_number() over (order by ordem, id) as posicao
            from public.atividades
           where evento_id = a.evento_id and bloco_id is not distinct from a.bloco_id
        ) n
       where t.id = n.id;
    end if;
    select ordem into ordem_a from public.atividades where id = a.id;
    select ordem into ordem_v from public.atividades where id = vizinha.id;
    update public.atividades set ordem = ordem_v where id = a.id;
    update public.atividades set ordem = ordem_a where id = vizinha.id;
    return;
  end if;

  -- 2) Na ponta do bloco: passa para o bloco vizinho.
  if a.bloco_id is not null then
    select ordem, id into atual from public.blocos where id = a.bloco_id;
  end if;

  if direcao < 0 then
    if a.bloco_id is null then
      return; -- já está no topo de tudo
    end if;
    select b.id into destino from public.blocos b
     where b.evento_id = a.evento_id and (b.ordem, b.id) < (atual.ordem, atual.id)
     order by b.ordem desc, b.id desc limit 1;
    -- Sem bloco acima: vai para "sem bloco" (destino fica null).
    update public.atividades
       set bloco_id = destino,
           ordem = coalesce((select max(t.ordem) from public.atividades t
                              where t.evento_id = a.evento_id
                                and t.bloco_id is not distinct from destino), 0) + 1
     where id = a.id;
  else
    if a.bloco_id is null then
      select b.id into destino from public.blocos b
       where b.evento_id = a.evento_id
       order by b.ordem, b.id limit 1;
    else
      select b.id into destino from public.blocos b
       where b.evento_id = a.evento_id and (b.ordem, b.id) > (atual.ordem, atual.id)
       order by b.ordem, b.id limit 1;
    end if;
    if destino is null then
      return; -- já está no fim de tudo
    end if;
    -- Entra no começo do bloco de baixo.
    update public.atividades set ordem = ordem + 1
     where evento_id = a.evento_id and bloco_id = destino;
    update public.atividades set bloco_id = destino, ordem = 1 where id = a.id;
  end if;
end;
$$;

-- ---------------------------------------------------------------
-- Mover bloco: troca de lugar com o bloco vizinho.
-- ---------------------------------------------------------------
create or replace function public.mover_bloco(bloco uuid, direcao integer)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  b record;
  vizinho record;
  ordem_b integer;
  ordem_v integer;
begin
  select id, evento_id, ordem into b from public.blocos where id = bloco for update;
  if not found then
    raise exception 'Bloco não encontrado' using errcode = 'no_data_found';
  end if;

  if direcao < 0 then
    select id, ordem into vizinho from public.blocos
     where evento_id = b.evento_id and (ordem, id) < (b.ordem, b.id)
     order by ordem desc, id desc limit 1;
  else
    select id, ordem into vizinho from public.blocos
     where evento_id = b.evento_id and (ordem, id) > (b.ordem, b.id)
     order by ordem, id limit 1;
  end if;
  if vizinho.id is null then
    return; -- já está na ponta
  end if;

  if b.ordem = vizinho.ordem then
    update public.blocos t
       set ordem = n.posicao
      from (
        select id, row_number() over (order by ordem, id) as posicao
          from public.blocos where evento_id = b.evento_id
      ) n
     where t.id = n.id;
  end if;

  select ordem into ordem_b from public.blocos where id = b.id;
  select ordem into ordem_v from public.blocos where id = vizinho.id;
  update public.blocos set ordem = ordem_v where id = b.id;
  update public.blocos set ordem = ordem_b where id = vizinho.id;
end;
$$;

revoke execute on function public.mover_atividade(uuid, integer) from public, anon;
revoke execute on function public.mover_bloco(uuid, integer) from public, anon;
grant execute on function public.mover_atividade(uuid, integer) to authenticated;
grant execute on function public.mover_bloco(uuid, integer) to authenticated;

-- Conferência: acentos certos nas mensagens desta migração.
do $$
begin
  if length('Bloco não encontrado') <> 20 then
    raise exception 'ACENTOS TROCADOS AO COLAR.';
  end if;
end $$;

select 'OK: 0023 aplicada' as resultado;
