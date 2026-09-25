-- Teste de isolamento das políticas (RLS).
-- Rode inteiro no SQL Editor do Supabase. Tudo acontece dentro de uma
-- transação desfeita no final: nada fica gravado no banco.
--
-- Resultado esperado: uma linha "OK: todos os testes de isolamento passaram".
-- Se alguma regra falhar, aparece um erro começando com "FALHOU:".

begin;

-- ---------------------------------------------------------------
-- Preparação (como dono do banco, sem RLS)
-- ---------------------------------------------------------------

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-4000-a000-00000000000a', 'teste-instrutor-a@pulse.test', 'authenticated', 'authenticated', '{}', '{"nome":"Instrutor A"}'),
  ('00000000-0000-4000-a000-00000000000b', 'teste-instrutor-b@pulse.test', 'authenticated', 'authenticated', '{}', '{"nome":"Instrutor B"}'),
  ('00000000-0000-4000-a000-0000000000ad', 'teste-admin@pulse.test',       'authenticated', 'authenticated', '{}', '{"nome":"Admin"}');

-- O trigger deve ter criado os três perfis como instrutor.
do $$
begin
  if (select count(*) from public.perfis
       where id in ('00000000-0000-4000-a000-00000000000a',
                    '00000000-0000-4000-a000-00000000000b',
                    '00000000-0000-4000-a000-0000000000ad')
         and papel = 'instrutor') <> 3 then
    raise exception 'FALHOU: trigger não criou os perfis com papel instrutor';
  end if;
end $$;

update public.perfis set papel = 'admin' where id = '00000000-0000-4000-a000-0000000000ad';

insert into public.cooperativas (id, nome, uf)
values ('00000000-0000-4000-b000-000000000001', 'Cooperativa Teste', 'SC');

insert into public.eventos (id, cooperativa_id, nome_turma, data_inicio, data_fim, instrutor_id)
values
  ('00000000-0000-4000-c000-00000000000a', '00000000-0000-4000-b000-000000000001', 'Turma do A', '2099-01-10', '2099-01-10', '00000000-0000-4000-a000-00000000000a'),
  ('00000000-0000-4000-c000-00000000000b', '00000000-0000-4000-b000-000000000001', 'Turma do B', '2099-01-10', '2099-01-11', '00000000-0000-4000-a000-00000000000b');

-- Código interno gerado com sufixo sequencial no mesmo dia.
do $$
begin
  if (select string_agg(codigo_interno, ',' order by codigo_interno) from public.eventos
       where id in ('00000000-0000-4000-c000-00000000000a', '00000000-0000-4000-c000-00000000000b'))
     <> '20990110-1,20990110-2' then
    raise exception 'FALHOU: código interno não seguiu AAAAMMDD-N';
  end if;
end $$;

insert into public.pessoas (id, nome, email)
values
  ('00000000-0000-4000-d000-000000000001', 'Pessoa Um',   '  Pessoa.Um@Pulse.TEST '),
  ('00000000-0000-4000-d000-000000000002', 'Pessoa Dois', 'pessoa.dois@pulse.test');

do $$
begin
  if (select email from public.pessoas where id = '00000000-0000-4000-d000-000000000001')
     <> 'pessoa.um@pulse.test' then
    raise exception 'FALHOU: e-mail da pessoa não foi guardado em minúsculas';
  end if;
end $$;

insert into public.inscricoes (pessoa_id, evento_id, origem)
values
  ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-c000-00000000000a', 'lista'),
  ('00000000-0000-4000-d000-000000000002', '00000000-0000-4000-c000-00000000000b', 'lista');

-- ---------------------------------------------------------------
-- Instrutor A
-- ---------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}';

do $$
declare
  linhas integer;
begin
  -- Vê o que é dele.
  if (select count(*) from public.eventos where id = '00000000-0000-4000-c000-00000000000a') <> 1 then
    raise exception 'FALHOU: instrutor A não vê o próprio evento';
  end if;
  if (select count(*) from public.inscricoes where evento_id = '00000000-0000-4000-c000-00000000000a') <> 1 then
    raise exception 'FALHOU: instrutor A não vê as inscrições do próprio evento';
  end if;

  -- Não lê evento nem inscrição do B.
  if (select count(*) from public.eventos where id = '00000000-0000-4000-c000-00000000000b') <> 0 then
    raise exception 'FALHOU: instrutor A lê evento do instrutor B';
  end if;
  if (select count(*) from public.inscricoes where evento_id = '00000000-0000-4000-c000-00000000000b') <> 0 then
    raise exception 'FALHOU: instrutor A lê inscrição do evento do instrutor B';
  end if;

  -- Não vê o perfil do B.
  if (select count(*) from public.perfis where id = '00000000-0000-4000-a000-00000000000b') <> 0 then
    raise exception 'FALHOU: instrutor A lê o perfil do instrutor B';
  end if;

  -- Lê cooperativas e pessoas.
  if (select count(*) from public.cooperativas where id = '00000000-0000-4000-b000-000000000001') <> 1 then
    raise exception 'FALHOU: instrutor não lê cooperativas';
  end if;
  if (select count(*) from public.pessoas where id in ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-d000-000000000002')) <> 2 then
    raise exception 'FALHOU: instrutor não lê pessoas';
  end if;

  -- Cria cooperativa e pessoa.
  insert into public.cooperativas (nome, uf) values ('Cooperativa do A', 'PR');
  insert into public.pessoas (nome, email) values ('Pessoa do A', 'pessoa.do.a@pulse.test');

  -- Não cria evento em nome do B.
  begin
    insert into public.eventos (cooperativa_id, nome_turma, data_inicio, data_fim, instrutor_id)
    values ('00000000-0000-4000-b000-000000000001', 'Intrusa', '2099-02-01', '2099-02-01', '00000000-0000-4000-a000-00000000000b');
    raise exception 'FALHOU: instrutor A criou evento com instrutor_id do B';
  exception when insufficient_privilege then
    null; -- bloqueado, como esperado
  end;

  -- Não transfere o próprio evento para o B.
  begin
    update public.eventos set instrutor_id = '00000000-0000-4000-a000-00000000000b'
     where id = '00000000-0000-4000-c000-00000000000a';
    raise exception 'FALHOU: instrutor A transferiu evento para o B';
  exception when insufficient_privilege then
    null;
  end;

  -- Não altera nem apaga evento do B.
  update public.eventos set nome_turma = 'Alterado por A' where id = '00000000-0000-4000-c000-00000000000b';
  get diagnostics linhas = row_count;
  if linhas <> 0 then
    raise exception 'FALHOU: instrutor A alterou evento do B';
  end if;
  delete from public.eventos where id = '00000000-0000-4000-c000-00000000000b';
  get diagnostics linhas = row_count;
  if linhas <> 0 then
    raise exception 'FALHOU: instrutor A apagou evento do B';
  end if;

  -- Não inscreve pessoa em evento do B.
  begin
    insert into public.inscricoes (pessoa_id, evento_id, origem)
    values ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-c000-00000000000b', 'cadastro_sala');
    raise exception 'FALHOU: instrutor A inscreveu pessoa em evento do B';
  exception when insufficient_privilege then
    null;
  end;

  -- Não altera o próprio papel.
  update public.perfis set papel = 'admin' where id = '00000000-0000-4000-a000-00000000000a';
  get diagnostics linhas = row_count;
  if linhas <> 0 then
    raise exception 'FALHOU: instrutor A alterou o próprio papel';
  end if;

  -- Não cria perfil para si.
  begin
    insert into public.perfis (id, nome, papel)
    values ('00000000-0000-4000-a000-00000000000a', 'A de novo', 'admin');
    raise exception 'FALHOU: instrutor A inseriu perfil';
  exception when insufficient_privilege then
    null;
  end;

  -- Não mexe em cooperativa (só admin altera).
  update public.cooperativas set nome = 'Alterada' where id = '00000000-0000-4000-b000-000000000001';
  get diagnostics linhas = row_count;
  if linhas <> 0 then
    raise exception 'FALHOU: instrutor alterou cooperativa';
  end if;
end $$;

reset role;

-- Confere, como dono do banco, que o papel do A continua instrutor.
do $$
begin
  if (select papel from public.perfis where id = '00000000-0000-4000-a000-00000000000a') <> 'instrutor' then
    raise exception 'FALHOU: papel do instrutor A mudou';
  end if;
end $$;

-- ---------------------------------------------------------------
-- Instrutor B (simetria)
-- ---------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-a000-00000000000b","role":"authenticated"}';

do $$
begin
  if (select count(*) from public.eventos where id = '00000000-0000-4000-c000-00000000000a') <> 0 then
    raise exception 'FALHOU: instrutor B lê evento do instrutor A';
  end if;
  if (select count(*) from public.inscricoes where evento_id = '00000000-0000-4000-c000-00000000000a') <> 0 then
    raise exception 'FALHOU: instrutor B lê inscrição do evento do instrutor A';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-a000-0000000000ad","role":"authenticated"}';

do $$
declare
  linhas integer;
begin
  if (select count(*) from public.eventos
       where id in ('00000000-0000-4000-c000-00000000000a', '00000000-0000-4000-c000-00000000000b')) <> 2 then
    raise exception 'FALHOU: admin não lê todos os eventos';
  end if;
  if (select count(*) from public.inscricoes
       where evento_id in ('00000000-0000-4000-c000-00000000000a', '00000000-0000-4000-c000-00000000000b')) <> 2 then
    raise exception 'FALHOU: admin não lê todas as inscrições';
  end if;
  if (select count(*) from public.perfis
       where id in ('00000000-0000-4000-a000-00000000000a',
                    '00000000-0000-4000-a000-00000000000b',
                    '00000000-0000-4000-a000-0000000000ad')) <> 3 then
    raise exception 'FALHOU: admin não lê todos os perfis';
  end if;

  -- Admin escreve em evento de outro instrutor.
  update public.eventos set nome_turma = 'Alterado pelo admin' where id = '00000000-0000-4000-c000-00000000000b';
  get diagnostics linhas = row_count;
  if linhas <> 1 then
    raise exception 'FALHOU: admin não alterou evento do instrutor B';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------
-- Visitante sem login (anon) não acessa nada
-- ---------------------------------------------------------------

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

do $$
begin
  begin
    perform 1 from public.eventos;
    raise exception 'FALHOU: visitante sem login lê eventos';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform 1 from public.perfis;
    raise exception 'FALHOU: visitante sem login lê perfis';
  exception when insufficient_privilege then
    null;
  end;
end $$;

reset role;

-- Só chega aqui se nenhuma verificação acima falhou.
select 'OK: todos os testes de isolamento passaram' as resultado;

rollback;
