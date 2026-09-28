-- 0028 — observação opcional em cada pergunta (atividades e perguntas da biblioteca).
-- Quando preenchida, aparece no celular do participante logo abaixo da pergunta.
-- As funções abaixo são as mesmas de 0022, 0024 e 0026, agora levando a observação:
--   * sala_estado entrega a observação ao celular;
--   * duplicar atividade, bloco e modelo copiam a observação;
--   * usar_modelo copia a observação do modelo, e a trava da biblioteca a inclui
--     (pergunta de modelo tem a mesma observação em todos os eventos).

-- Trava: se este arquivo chegar com os acentos trocados, para aqui.
do $$
begin
  if length('ção') <> 3 then
    raise exception 'ACENTOS TROCADOS AO COLAR. Copie de novo com o comando que tem -Encoding UTF8.';
  end if;
end $$;

-- Vazia é null; preenchida tem de 1 a 500 caracteres.
alter table public.atividades
  add column observacao text
    constraint atividades_observacao_check check (observacao is null or length(trim(observacao)) between 1 and 500);
alter table public.modelo_perguntas
  add column observacao text
    constraint modelo_perguntas_observacao_check check (observacao is null or length(trim(observacao)) between 1 and 500);

-- sala_estado (versão de 0022_entrada_so_codigo.sql, com a observação)
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
    left join public.pessoas p on p.id = i.pessoa_id
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

  if s.ultimo_acesso < now() - interval '5 minutes' then
    update public.sessoes_participante set ultimo_acesso = now() where id = s.sessao_id;
  end if;

  if s.atividade_atual_id is not null then
    select jsonb_build_object(
             'id', a.id,
             'tipo', a.tipo,
             'enunciado', a.enunciado,
             'observacao', a.observacao,
             'config', case when a.tipo in ('escala', 'numero') then a.config - 'referencia' else a.config end,
             'estado', a.estado,
             'rodada', a.rodada_atual
           )
      into atividade
      from public.atividades a
     where a.id = s.atividade_atual_id and a.estado <> 'fechada';

    if atividade ->> 'estado' = 'aberta' then
      select r.valor into resposta
        from public.respostas r
       where r.atividade_id = s.atividade_atual_id
         and r.inscricao_id = s.inscricao_id
         and r.rodada = (atividade ->> 'rodada')::integer;
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

-- duplicar_atividade (versão de 0024_bloco_obrigatorio.sql, com a observação)
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
  select id, evento_id, bloco_id, ordem, tipo, enunciado, config, observacao
    into a from public.atividades where id = atividade;
  if not found then
    raise exception 'Atividade não encontrada' using errcode = 'no_data_found';
  end if;

  update public.atividades set ordem = ordem + 1 where bloco_id = a.bloco_id and ordem > a.ordem;
  insert into public.atividades (evento_id, bloco_id, ordem, tipo, enunciado, config, observacao)
  values (a.evento_id, a.bloco_id, a.ordem + 1, a.tipo, left(a.enunciado || ' (cópia)', 300), a.config, a.observacao)
  returning id into nova;
  return nova;
end;
$$;

-- duplicar_bloco (versão de 0024_bloco_obrigatorio.sql, com a observação)
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

  insert into public.atividades (evento_id, bloco_id, ordem, tipo, enunciado, config, observacao)
  select a.evento_id, novo, a.ordem, a.tipo, a.enunciado, a.config, a.observacao
    from public.atividades a where a.bloco_id = b.id;
  return novo;
end;
$$;

-- conferir_atividade_de_modelo (versão de 0026_biblioteca_modelos.sql, com a observação)
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
       and (new.tipo, new.enunciado, new.config, new.observacao)
           is distinct from (old.tipo, old.enunciado, old.config, old.observacao) then
      raise exception 'Pergunta da biblioteca não pode ser alterada no evento' using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if new.modelo_pergunta_id is not null then
    select tipo, enunciado, config, observacao into m from public.modelo_perguntas where id = new.modelo_pergunta_id;
    if not found
       or (new.tipo, new.enunciado, new.config, new.observacao)
          is distinct from (m.tipo, m.enunciado, m.config, m.observacao) then
      raise exception 'A pergunta não é igual à da biblioteca' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

-- O gatilho passa a olhar também a coluna observacao.
drop trigger atividades_conferir_modelo on public.atividades;
create trigger atividades_conferir_modelo
  before insert or update of tipo, enunciado, config, observacao, modelo_pergunta_id on public.atividades
  for each row execute function public.conferir_atividade_de_modelo();

-- usar_modelo (versão de 0026_biblioteca_modelos.sql, com a observação)
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

  insert into public.atividades (evento_id, bloco_id, ordem, tipo, enunciado, config, observacao, modelo_pergunta_id)
  select evento, novo, row_number() over (order by p.ordem, p.id), p.tipo, p.enunciado, p.config, p.observacao, p.id
    from public.modelo_perguntas p where p.modelo_id = m.id;
  return novo;
end;
$$;

-- duplicar_modelo (versão de 0026_biblioteca_modelos.sql, com a observação)
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
  insert into public.modelo_perguntas (modelo_id, ordem, tipo, enunciado, config, observacao)
  select novo, p.ordem, p.tipo, p.enunciado, p.config, p.observacao from public.modelo_perguntas p where p.modelo_id = m.id;
  return novo;
end;
$$;

select 'OK: 0028 aplicada' as resultado;
