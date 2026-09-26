-- 0007 — eventos ganham código de acesso (4 caracteres, para o participante)
-- e token da projeção (usado na fatia 2).

-- Alfabeto sem 0, O, 1, I e L, para não confundir quem digita no celular.
-- SECURITY DEFINER porque precisa enxergar os eventos de todos os instrutores
-- para não repetir um código já em uso.
create or replace function public.gerar_codigo_acesso()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  alfabeto constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  codigo text;
  tentativas integer := 0;
begin
  loop
    codigo := '';
    for i in 1..4 loop
      codigo := codigo || substr(alfabeto, 1 + floor(random() * length(alfabeto))::integer, 1);
    end loop;

    exit when not exists (
      select 1 from public.eventos e
       where e.codigo_acesso = codigo and e.estado <> 'encerrado'
    );

    tentativas := tentativas + 1;
    if tentativas > 50 then
      raise exception 'Não foi possível gerar um código de acesso livre';
    end if;
  end loop;

  return codigo;
end;
$$;

revoke execute on function public.gerar_codigo_acesso() from public, anon;
grant execute on function public.gerar_codigo_acesso() to authenticated;

-- Token longo e aleatório (2 uuid v4 sem hífens = 64 caracteres hexadecimais).
create or replace function public.gerar_token_projecao()
returns text
language sql
volatile
set search_path = ''
as $$
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
$$;

revoke execute on function public.gerar_token_projecao() from public, anon;
grant execute on function public.gerar_token_projecao() to authenticated;

-- Em etapas: cria as colunas vazias, preenche os eventos que já existem
-- e só então torna obrigatórias, com o gerador como valor padrão.
alter table public.eventos
  add column codigo_acesso text,
  add column projecao_token text;

update public.eventos
   set codigo_acesso = public.gerar_codigo_acesso(),
       projecao_token = public.gerar_token_projecao()
 where codigo_acesso is null or projecao_token is null;

alter table public.eventos
  alter column codigo_acesso set default public.gerar_codigo_acesso(),
  alter column codigo_acesso set not null,
  alter column projecao_token set default public.gerar_token_projecao(),
  alter column projecao_token set not null,
  add constraint eventos_codigo_acesso_formato
    check (codigo_acesso ~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$'),
  add constraint eventos_projecao_token_unico unique (projecao_token);

-- O mesmo código pode voltar a ser usado depois que o evento é encerrado.
create unique index eventos_codigo_acesso_ativo_idx
  on public.eventos (codigo_acesso)
  where estado <> 'encerrado';

-- Botão "Gerar outro código de acesso". Roda com as permissões de quem chama
-- (SECURITY INVOKER), então as políticas de eventos continuam valendo:
-- o instrutor só troca o código dos próprios eventos.
create or replace function public.regenerar_codigo_acesso(evento uuid)
returns text
language sql
volatile
security invoker
set search_path = ''
as $$
  update public.eventos
     set codigo_acesso = public.gerar_codigo_acesso()
   where id = evento
  returning codigo_acesso;
$$;

revoke execute on function public.regenerar_codigo_acesso(uuid) from public, anon;
grant execute on function public.regenerar_codigo_acesso(uuid) to authenticated;
