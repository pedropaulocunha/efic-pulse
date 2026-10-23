-- 0035 — ligar ao modelo da biblioteca perguntas que já existiam em eventos
-- (pedido do Pedro, 23/10/2026: Cacoal, Ariquemes, Juína e Curitiba no mesmo
-- comparativo dos eventos importados do Forms).
--   * A trava da biblioteca passa a aceitar UMA mudança: de "sem modelo" para
--     "com modelo", e só se a pergunta for idêntica à do modelo (tipo, texto,
--     opções e observação). Trocar ou desfazer a ligação continua proibido.
--   * perguntas_para_ligar(modelo): lista o que pode ser ligado (só admin).
--   * ligar_perguntas_ao_modelo(modelo): liga tudo o que for idêntico (só admin).
--     Em cada evento, liga no máximo uma pergunta por pergunta do modelo (a
--     primeira na ordem), para ninguém ser contado duas vezes no comparativo.

-- Trava: se este arquivo chegar com os acentos trocados, para aqui.
do $$
begin
  if length('ção') <> 3 then
    raise exception 'ACENTOS TROCADOS AO COLAR. Copie de novo com o comando que tem -Encoding UTF8.';
  end if;
end $$;

-- conferir_atividade_de_modelo (versão de 0028_observacao.sql, aceitando ligar pergunta idêntica)
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
      -- Só "sem modelo" -> "com modelo", com a pergunta igual à do modelo.
      if old.modelo_pergunta_id is not null or new.modelo_pergunta_id is null then
        raise exception 'A ligação com a biblioteca não pode ser trocada' using errcode = 'check_violation';
      end if;
      select tipo, enunciado, config, observacao into m from public.modelo_perguntas where id = new.modelo_pergunta_id;
      if not found
         or (new.tipo, new.enunciado, new.config, new.observacao)
            is distinct from (m.tipo, m.enunciado, m.config, m.observacao) then
        raise exception 'A pergunta não é igual à da biblioteca' using errcode = 'check_violation';
      end if;
      return new;
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

-- O que pode ser ligado: perguntas sem modelo, idênticas a uma pergunta do modelo,
-- em eventos que ainda não têm essa pergunta do modelo. Uma por evento e pergunta.
create or replace function public.perguntas_para_ligar(modelo uuid)
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
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'atividade', c.atividade, 'pergunta', c.pergunta, 'evento', c.evento,
             'nome_turma', c.nome_turma, 'data_inicio', c.data_inicio, 'enunciado', c.enunciado)
           order by c.data_inicio, c.nome_turma, c.enunciado)
      from (
        select distinct on (a.evento_id, p.id)
               a.id as atividade, p.id as pergunta, a.evento_id as evento,
               e.nome_turma, e.data_inicio, a.enunciado
          from public.atividades a
          join public.modelo_perguntas p
            on (a.tipo, a.enunciado, a.config, a.observacao)
               is not distinct from (p.tipo, p.enunciado, p.config, p.observacao)
          join public.eventos e on e.id = a.evento_id
         where p.modelo_id = perguntas_para_ligar.modelo
           and a.modelo_pergunta_id is null
           and not exists (
             select 1 from public.atividades j
              where j.evento_id = a.evento_id and j.modelo_pergunta_id = p.id
           )
         order by a.evento_id, p.id, a.ordem, a.id
      ) c
  ), '[]'::jsonb);
end;
$$;

-- Liga tudo o que perguntas_para_ligar lista. Devolve quantas ligou (null se não é admin).
create or replace function public.ligar_perguntas_ao_modelo(modelo uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  lista jsonb;
  item jsonb;
  ligadas integer := 0;
begin
  if not public.usuario_e_admin() then
    return null;
  end if;
  lista := public.perguntas_para_ligar(modelo);
  for item in select * from jsonb_array_elements(lista) loop
    update public.atividades
       set modelo_pergunta_id = (item ->> 'pergunta')::uuid
     where id = (item ->> 'atividade')::uuid and modelo_pergunta_id is null;
    ligadas := ligadas + 1;
  end loop;
  return ligadas;
end;
$$;

revoke execute on function public.perguntas_para_ligar(uuid) from public, anon;
revoke execute on function public.ligar_perguntas_ao_modelo(uuid) from public, anon;
grant execute on function public.perguntas_para_ligar(uuid) to authenticated;
grant execute on function public.ligar_perguntas_ao_modelo(uuid) to authenticated;

select 'OK: 0035 aplicada' as resultado;
