-- 0026 — biblioteca de modelos de bloco e comparativo entre eventos.
-- Briefing: docs/biblioteca-modelos.md.
--   * modelos e modelo_perguntas: só o admin escreve; a equipe lê (para usar).
--   * atividades.modelo_pergunta_id: de qual pergunta do modelo a atividade veio.
--     Atividade ligada é idêntica ao modelo e não muda (tipo, pergunta, config).
--   * Pergunta de modelo já usada em evento não muda tipo nem config (o texto pode).
--   * usar_modelo: cria no evento um bloco com cópias ligadas das perguntas.
--   * comparativo_modelo: respostas anônimas de todos os eventos, só para o admin.

-- Trava: se este arquivo chegar com os acentos trocados, para aqui.
do $$
begin
  if length('ção') <> 3 then
    raise exception 'ACENTOS TROCADOS AO COLAR. Copie de novo com o comando que tem -Encoding UTF8.';
  end if;
end $$;

-- ---------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------

create table public.modelos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null constraint modelos_titulo_check check (length(trim(titulo)) between 1 and 120),
  arquivado boolean not null default false,
  criado_em timestamptz not null default now()
);

create table public.modelo_perguntas (
  id uuid primary key default gen_random_uuid(),
  modelo_id uuid not null references public.modelos (id) on delete cascade,
  ordem integer not null constraint modelo_perguntas_ordem_check check (ordem >= 1),
  -- Mesma lista do CHECK atividades_tipo_check (0014).
  tipo text not null
    constraint modelo_perguntas_tipo_check check (tipo in ('multipla', 'escala', 'nuvem', 'ordenar', 'numero', 'aberta')),
  enunciado text not null
    constraint modelo_perguntas_enunciado_check check (length(trim(enunciado)) between 1 and 300),
  config jsonb not null,
  criado_em timestamptz not null default now(),
  constraint modelo_perguntas_config_valida check (public.config_atividade_valida(tipo, config))
);

create index modelo_perguntas_modelo_id_ordem_idx on public.modelo_perguntas (modelo_id, ordem);

-- "no action": pergunta de modelo usada em evento não se apaga (o comparativo depende dela).
alter table public.atividades
  add column modelo_pergunta_id uuid references public.modelo_perguntas (id) on delete no action;

create index atividades_modelo_pergunta_id_idx on public.atividades (modelo_pergunta_id);

alter table public.modelos enable row level security;
alter table public.modelo_perguntas enable row level security;

revoke all on table public.modelos, public.modelo_perguntas from anon;
grant select, insert, update, delete on table public.modelos, public.modelo_perguntas to authenticated, service_role;

create policy modelos_select on public.modelos
  for select to authenticated using ((select public.usuario_e_equipe()));
create policy modelos_insert on public.modelos
  for insert to authenticated with check ((select public.usuario_e_admin()));
create policy modelos_update on public.modelos
  for update to authenticated
  using ((select public.usuario_e_admin())) with check ((select public.usuario_e_admin()));
create policy modelos_delete on public.modelos
  for delete to authenticated using ((select public.usuario_e_admin()));

create policy modelo_perguntas_select on public.modelo_perguntas
  for select to authenticated using ((select public.usuario_e_equipe()));
create policy modelo_perguntas_insert on public.modelo_perguntas
  for insert to authenticated with check ((select public.usuario_e_admin()));
create policy modelo_perguntas_update on public.modelo_perguntas
  for update to authenticated
  using ((select public.usuario_e_admin())) with check ((select public.usuario_e_admin()));
create policy modelo_perguntas_delete on public.modelo_perguntas
  for delete to authenticated using ((select public.usuario_e_admin()));

-- ---------------------------------------------------------------
-- Travas no banco
-- ---------------------------------------------------------------

-- Atividade ligada a modelo: nasce igual à pergunta do modelo e não muda depois.
create or replace function public.conferir_atividade_de_modelo()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  m record;
begin
  if tg_op = 'UPDATE' then
    if new.modelo_pergunta_id is distinct from old.modelo_pergunta_id then
      raise exception 'A ligação com a biblioteca não pode ser trocada' using errcode = 'check_violation';
    end if;
    if old.modelo_pergunta_id is not null
       and (new.tipo, new.enunciado, new.config) is distinct from (old.tipo, old.enunciado, old.config) then
      raise exception 'Pergunta da biblioteca não pode ser alterada no evento' using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if new.modelo_pergunta_id is not null then
    select tipo, enunciado, config into m from public.modelo_perguntas where id = new.modelo_pergunta_id;
    if not found or (new.tipo, new.enunciado, new.config) is distinct from (m.tipo, m.enunciado, m.config) then
      raise exception 'A pergunta não é igual à da biblioteca' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger atividades_conferir_modelo
  before insert or update of tipo, enunciado, config, modelo_pergunta_id on public.atividades
  for each row execute function public.conferir_atividade_de_modelo();

-- Pergunta de modelo já usada: tipo e config travados (o texto pode mudar).
create or replace function public.conferir_pergunta_de_modelo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.tipo, new.config) is distinct from (old.tipo, old.config)
     and exists (select 1 from public.atividades a where a.modelo_pergunta_id = old.id) then
    raise exception 'Esta pergunta já foi usada em eventos: duplique o modelo para mudar as opções'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger modelo_perguntas_conferir_uso
  before update of tipo, config on public.modelo_perguntas
  for each row execute function public.conferir_pergunta_de_modelo();

-- ---------------------------------------------------------------
-- Usar o modelo num evento: bloco novo no fim, com cópias ligadas.
-- security invoker: valem as políticas (instrutor só no próprio evento).
-- ---------------------------------------------------------------
create or replace function public.usar_modelo(evento uuid, modelo uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  m record;
  novo uuid;
begin
  select id, titulo into m from public.modelos where id = modelo and not arquivado;
  if not found then
    raise exception 'Modelo não encontrado' using errcode = 'no_data_found';
  end if;
  if not exists (select 1 from public.eventos where id = evento) then
    raise exception 'Evento não encontrado' using errcode = 'no_data_found';
  end if;

  insert into public.blocos (evento_id, ordem, titulo)
  values (evento, coalesce((select max(ordem) from public.blocos where evento_id = evento), 0) + 1, m.titulo)
  returning id into novo;

  insert into public.atividades (evento_id, bloco_id, ordem, tipo, enunciado, config, modelo_pergunta_id)
  select evento, novo, row_number() over (order by p.ordem, p.id), p.tipo, p.enunciado, p.config, p.id
    from public.modelo_perguntas p where p.modelo_id = m.id;
  return novo;
end;
$$;

-- Duplicar modelo (para mudar opções sem misturar comparativos): só admin (políticas).
create or replace function public.duplicar_modelo(modelo uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  m record;
  novo uuid;
begin
  select id, titulo into m from public.modelos where id = modelo;
  if not found then
    raise exception 'Modelo não encontrado' using errcode = 'no_data_found';
  end if;
  insert into public.modelos (titulo) values (left(m.titulo || ' (cópia)', 120)) returning id into novo;
  insert into public.modelo_perguntas (modelo_id, ordem, tipo, enunciado, config)
  select novo, p.ordem, p.tipo, p.enunciado, p.config from public.modelo_perguntas p where p.modelo_id = m.id;
  return novo;
end;
$$;

-- Mover pergunta dentro do modelo: troca com a vizinha.
create or replace function public.mover_pergunta_modelo(pergunta uuid, direcao integer)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  p record;
  vizinha record;
  ordem_p integer;
  ordem_v integer;
begin
  select id, modelo_id, ordem into p from public.modelo_perguntas where id = pergunta for update;
  if not found then
    raise exception 'Pergunta não encontrada' using errcode = 'no_data_found';
  end if;
  if direcao < 0 then
    select id, ordem into vizinha from public.modelo_perguntas
     where modelo_id = p.modelo_id and (ordem, id) < (p.ordem, p.id) order by ordem desc, id desc limit 1;
  else
    select id, ordem into vizinha from public.modelo_perguntas
     where modelo_id = p.modelo_id and (ordem, id) > (p.ordem, p.id) order by ordem, id limit 1;
  end if;
  if vizinha.id is null then
    return;
  end if;
  if p.ordem = vizinha.ordem then
    update public.modelo_perguntas t set ordem = n.posicao
      from (select id, row_number() over (order by ordem, id) as posicao
              from public.modelo_perguntas where modelo_id = p.modelo_id) n
     where t.id = n.id;
  end if;
  select ordem into ordem_p from public.modelo_perguntas where id = p.id;
  select ordem into ordem_v from public.modelo_perguntas where id = vizinha.id;
  update public.modelo_perguntas set ordem = ordem_v where id = p.id;
  update public.modelo_perguntas set ordem = ordem_p where id = vizinha.id;
end;
$$;

-- ---------------------------------------------------------------
-- Comparativo: eventos e respostas anônimas das perguntas do modelo.
-- Filtros opcionais: cooperativas e período (data de início do evento).
-- Só o admin; para os outros, devolve null.
-- ---------------------------------------------------------------
create or replace function public.comparativo_modelo(
  modelo uuid,
  cooperativas uuid[] default null,
  de date default null,
  ate date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.usuario_e_admin() then
    return null;
  end if;

  return (
    with evs as (
      select distinct e.id, e.nome_turma, e.codigo_interno, e.data_inicio, e.data_fim, c.nome as cooperativa, c.uf
        from public.eventos e
        join public.atividades a on a.evento_id = e.id
        join public.modelo_perguntas p on p.id = a.modelo_pergunta_id
        left join public.cooperativas c on c.id = e.cooperativa_id
       where p.modelo_id = comparativo_modelo.modelo
         and (comparativo_modelo.cooperativas is null or e.cooperativa_id = any (comparativo_modelo.cooperativas))
         and (comparativo_modelo.de is null or e.data_inicio >= comparativo_modelo.de)
         and (comparativo_modelo.ate is null or e.data_inicio <= comparativo_modelo.ate)
    ),
    -- Número anônimo por celular, dentro de cada evento (quem respondeu a perguntas do modelo).
    quem as (
      select i.id, i.evento_id, row_number() over (partition by i.evento_id order by i.criado_em, i.id) as numero
        from public.inscricoes i
       where i.evento_id in (select id from evs)
         and exists (
           select 1 from public.respostas r
             join public.atividades a on a.id = r.atividade_id
            where r.inscricao_id = i.id and a.modelo_pergunta_id is not null
         )
    )
    select jsonb_build_object(
      'eventos', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', v.id, 'nome_turma', v.nome_turma, 'codigo_interno', v.codigo_interno,
                 'data_inicio', v.data_inicio, 'data_fim', v.data_fim,
                 'cooperativa', v.cooperativa, 'uf', v.uf,
                 'participantes', (select count(*) from quem q where q.evento_id = v.id))
               order by v.data_inicio, v.nome_turma)
          from evs v), '[]'::jsonb),
      'atividades', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', a.id, 'evento', a.evento_id, 'pergunta', a.modelo_pergunta_id, 'rodada_atual', a.rodada_atual))
          from public.atividades a
          join public.modelo_perguntas p on p.id = a.modelo_pergunta_id
         where p.modelo_id = comparativo_modelo.modelo and a.evento_id in (select id from evs)), '[]'::jsonb),
      'respostas', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'evento', a.evento_id, 'pergunta', a.modelo_pergunta_id, 'rodada', r.rodada,
                 'participante', q.numero, 'valor', r.valor, 'aprovada', r.aprovada, 'em', r.atualizado_em))
          from public.respostas r
          join public.atividades a on a.id = r.atividade_id
          join public.modelo_perguntas p on p.id = a.modelo_pergunta_id
          join quem q on q.id = r.inscricao_id
         where p.modelo_id = comparativo_modelo.modelo and a.evento_id in (select id from evs)), '[]'::jsonb)
    )
  );
end;
$$;

revoke execute on function public.usar_modelo(uuid, uuid) from public, anon;
revoke execute on function public.duplicar_modelo(uuid) from public, anon;
revoke execute on function public.mover_pergunta_modelo(uuid, integer) from public, anon;
revoke execute on function public.comparativo_modelo(uuid, uuid[], date, date) from public, anon;
grant execute on function public.usar_modelo(uuid, uuid) to authenticated;
grant execute on function public.duplicar_modelo(uuid) to authenticated;
grant execute on function public.mover_pergunta_modelo(uuid, integer) to authenticated;
grant execute on function public.comparativo_modelo(uuid, uuid[], date, date) to authenticated;

-- Conferência: acentos das mensagens e nada para o visitante sem login.
do $$
begin
  if length('não') <> 3 then
    raise exception 'ACENTOS TROCADOS AO COLAR.';
  end if;
  if has_function_privilege('anon', 'public.comparativo_modelo(uuid, uuid[], date, date)', 'execute')
     or has_function_privilege('anon', 'public.usar_modelo(uuid, uuid)', 'execute') then
    raise exception 'FALHOU: visitante sem login pode executar função da biblioteca';
  end if;
end $$;

select 'OK: 0026 aplicada' as resultado;
