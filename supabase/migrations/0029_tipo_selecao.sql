-- 0029 — tipo novo "selecao" (seleção múltipla): lista de tipos nos CHECK.
-- Migração própria só para as listas (regra 3); as funções vêm na 0030.
-- Até a 0030 rodar, nenhuma pergunta "selecao" passa na conferência de configuração.

-- Trava: se este arquivo chegar com os acentos trocados, para aqui.
do $$
begin
  if length('ção') <> 3 then
    raise exception 'ACENTOS TROCADOS AO COLAR. Copie de novo com o comando que tem -Encoding UTF8.';
  end if;
end $$;

alter table public.atividades drop constraint atividades_tipo_check;
alter table public.atividades
  add constraint atividades_tipo_check check (tipo in ('multipla', 'escala', 'nuvem', 'ordenar', 'numero', 'aberta', 'selecao'));

alter table public.modelo_perguntas drop constraint modelo_perguntas_tipo_check;
alter table public.modelo_perguntas
  add constraint modelo_perguntas_tipo_check check (tipo in ('multipla', 'escala', 'nuvem', 'ordenar', 'numero', 'aberta', 'selecao'));

select 'OK: 0029 aplicada' as resultado;
