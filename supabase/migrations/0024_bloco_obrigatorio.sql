-- 0024 — toda atividade pertence a um bloco; duplicar atividade e bloco.
--   * Atividades que estavam sem bloco vão para um bloco "Geral", criado no topo
--     de cada evento que tinha alguma (o instrutor pode renomear).
--   * atividades.bloco_id passa a ser obrigatório.
--   * Bloco com atividades não pode ser excluído (antes, elas ficavam sem bloco).
--     Apagar o evento inteiro continua apagando blocos e atividades juntos.
--   * mover_atividade: na ponta do primeiro bloco, não há mais "sem bloco" acima.
--   * duplicar_atividade e duplicar_bloco: cópias fechadas, sem respostas,
--     logo abaixo do original.

-- Trava: se este arquivo chegar com os acentos trocados, para aqui.
do $$
begin
  if length('ção') <> 3 then
    raise exception 'ACENTOS TROCADOS AO COLAR. Copie de novo com o comando que tem -Encoding UTF8.';
  end if;
end $$;

-- 1) Bloco "Geral" no topo dos eventos que têm atividade sem bloco.
do $$
declare
  ev uuid;
  novo uuid;
begin
  for ev in select distinct evento_id from public.atividades where bloco_id is null loop
    update public.blocos set ordem = ordem + 1 where evento_id = ev;
    insert into public.blocos (evento_id, ordem, titulo) values (ev, 1, 'Geral') returning id into novo;
    update public.atividades set bloco_id = novo where evento_id = ev and bloco_id is null;
  end loop;
end $$;

-- 2) Bloco obrigatório. "no action" (e não "restrict"): ao apagar o evento, blocos e
--    atividades saem juntos na mesma operação, e a conferência só acontece no fim dela.
alter table public.atividades drop constraint atividades_bloco_fk;
alter table public.atividades
  add constraint atividades_bloco_fk
    foreign key (evento_id, bloco_id)
    references public.blocos (evento_id, id)
    on delete no action;
alter table public.atividades alter column bloco_id set not null;

-- 3) Mover atividade: igual à 0023, sem o grupo "sem bloco".
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
     where evento_id = a.evento_id and bloco_id = a.bloco_id and (ordem, id) < (a.ordem, a.id)
     order by ordem desc, id desc limit 1;
  else
    select id, ordem into vizinha from public.atividades
     where evento_id = a.evento_id and bloco_id = a.bloco_id and (ordem, id) > (a.ordem, a.id)
     order by ordem, id limit 1;
  end if;

  if vizinha.id is not null then
    if a.ordem = vizinha.ordem then
      update public.atividades t
         set ordem = n.posicao
        from (
          select id, row_number() over (order by ordem, id) as posicao
            from public.atividades where evento_id = a.evento_id and bloco_id = a.bloco_id
        ) n
       where t.id = n.id;
    end if;
    select ordem into ordem_a from public.atividades where id = a.id;
    select ordem into ordem_v from public.atividades where id = vizinha.id;
    update public.atividades set ordem = ordem_v where id = a.id;
    update public.atividades set ordem = ordem_a where id = vizinha.id;
    return;
  end if;

  -- 2) Na ponta do bloco: passa para o bloco vizinho (se houver).
  select ordem, id into atual from public.blocos where id = a.bloco_id;
  if direcao < 0 then
    select b.id into destino from public.blocos b
     where b.evento_id = a.evento_id and (b.ordem, b.id) < (atual.ordem, atual.id)
     order by b.ordem desc, b.id desc limit 1;
    if destino is null then
      return; -- já está no topo de tudo
    end if;
    update public.atividades
       set bloco_id = destino,
           ordem = coalesce((select max(t.ordem) from public.atividades t where t.bloco_id = destino), 0) + 1
     where id = a.id;
  else
    select b.id into destino from public.blocos b
     where b.evento_id = a.evento_id and (b.ordem, b.id) > (atual.ordem, atual.id)
     order by b.ordem, b.id limit 1;
    if destino is null then
      return; -- já está no fim de tudo
    end if;
    update public.atividades set ordem = ordem + 1 where bloco_id = destino;
    update public.atividades set bloco_id = destino, ordem = 1 where id = a.id;
  end if;
end;
$$;

-- 4) Duplicar atividade: cópia fechada, logo abaixo da original, no mesmo bloco.
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
  select id, evento_id, bloco_id, ordem, tipo, enunciado, config
    into a from public.atividades where id = atividade;
  if not found then
    raise exception 'Atividade não encontrada' using errcode = 'no_data_found';
  end if;

  update public.atividades set ordem = ordem + 1 where bloco_id = a.bloco_id and ordem > a.ordem;
  insert into public.atividades (evento_id, bloco_id, ordem, tipo, enunciado, config)
  values (a.evento_id, a.bloco_id, a.ordem + 1, a.tipo, left(a.enunciado || ' (cópia)', 300), a.config)
  returning id into nova;
  return nova;
end;
$$;

-- 5) Duplicar bloco: bloco novo logo abaixo, com cópias fechadas de todas as atividades.
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

  insert into public.atividades (evento_id, bloco_id, ordem, tipo, enunciado, config)
  select a.evento_id, novo, a.ordem, a.tipo, a.enunciado, a.config
    from public.atividades a where a.bloco_id = b.id;
  return novo;
end;
$$;

revoke execute on function public.duplicar_atividade(uuid) from public, anon;
revoke execute on function public.duplicar_bloco(uuid) from public, anon;
grant execute on function public.duplicar_atividade(uuid) to authenticated;
grant execute on function public.duplicar_bloco(uuid) to authenticated;

-- Conferência: nenhuma atividade ficou sem bloco.
do $$
begin
  if exists (select 1 from public.atividades where bloco_id is null) then
    raise exception 'FALHOU: ainda há atividade sem bloco';
  end if;
end $$;

select 'OK: 0024 aplicada' as resultado;
