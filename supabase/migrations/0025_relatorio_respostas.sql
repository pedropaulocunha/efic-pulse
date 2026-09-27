-- 0025 — respostas individuais para o relatório em Excel (uso interno da Efic).
-- Cada celular vira um número anônimo dentro do evento ("participante 17"),
-- na ordem em que entrou na sala. Nunca sai inscrição, pessoa, nome ou e-mail:
-- o número só serve para cruzar as respostas de uma mesma pessoa entre perguntas.
-- Só o instrutor do evento ou o admin; para os outros, devolve null.

-- Trava: se este arquivo chegar com os acentos trocados, para aqui.
do $$
begin
  if length('ção') <> 3 then
    raise exception 'ACENTOS TROCADOS AO COLAR. Copie de novo com o comando que tem -Encoding UTF8.';
  end if;
end $$;

create or replace function public.relatorio_respostas(evento uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.usuario_e_admin() or public.usuario_instrutor_do_evento(evento)) then
    return null;
  end if;

  return coalesce(
    (with quem as (
       -- Numera só quem respondeu alguma coisa, na ordem de entrada na sala.
       select i.id, row_number() over (order by i.criado_em, i.id) as numero
         from public.inscricoes i
        where i.evento_id = relatorio_respostas.evento
          and exists (select 1 from public.respostas r where r.inscricao_id = i.id)
     )
     select jsonb_agg(
              jsonb_build_object(
                'atividade', r.atividade_id,
                'rodada', r.rodada,
                'participante', q.numero,
                'valor', r.valor,
                'aprovada', r.aprovada,
                'em', r.atualizado_em
              )
              order by r.atividade_id, r.rodada, q.numero)
       from public.respostas r
       join public.atividades a on a.id = r.atividade_id
       join quem q on q.id = r.inscricao_id
      where a.evento_id = relatorio_respostas.evento),
    '[]'::jsonb
  );
end;
$$;

revoke execute on function public.relatorio_respostas(uuid) from public, anon;
grant execute on function public.relatorio_respostas(uuid) to authenticated;

-- Conferência: visitante sem login não executa.
do $$
begin
  if has_function_privilege('anon', 'public.relatorio_respostas(uuid)', 'execute') then
    raise exception 'FALHOU: visitante sem login pode executar relatorio_respostas';
  end if;
end $$;

select 'OK: 0025 aplicada' as resultado;
