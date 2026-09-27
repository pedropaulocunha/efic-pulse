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

-- Código de acesso e token da projeção gerados sozinhos, no formato certo.
do $$
declare
  codigo_a text;
begin
  if exists (select 1 from public.eventos
              where id in ('00000000-0000-4000-c000-00000000000a', '00000000-0000-4000-c000-00000000000b')
                and (codigo_acesso !~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$'
                     or length(projecao_token) < 64)) then
    raise exception 'FALHOU: código de acesso ou token da projeção fora do formato';
  end if;

  -- Letras que confundem (0, O, 1, I, L) são recusadas.
  begin
    update public.eventos set codigo_acesso = 'AB0O' where id = '00000000-0000-4000-c000-00000000000a';
    raise exception 'FALHOU: código de acesso aceitou caractere proibido';
  exception when check_violation then
    null;
  end;

  -- Dois eventos não encerrados não podem ter o mesmo código.
  select codigo_acesso into codigo_a from public.eventos where id = '00000000-0000-4000-c000-00000000000a';
  begin
    update public.eventos set codigo_acesso = codigo_a where id = '00000000-0000-4000-c000-00000000000b';
    raise exception 'FALHOU: dois eventos abertos com o mesmo código de acesso';
  exception when unique_violation then
    null;
  end;

  -- Depois de encerrado, o código pode ser reaproveitado.
  update public.eventos set estado = 'encerrado' where id = '00000000-0000-4000-c000-00000000000a';
  update public.eventos set codigo_acesso = codigo_a where id = '00000000-0000-4000-c000-00000000000b';
  update public.eventos set codigo_acesso = public.gerar_codigo_acesso() where id = '00000000-0000-4000-c000-00000000000b';
  update public.eventos set estado = 'planejamento' where id = '00000000-0000-4000-c000-00000000000a';
end $$;

-- As funções do participante (0013) só podem ser executadas pelo servidor.
do $$
declare
  funcao text;
  papel text;
begin
  foreach funcao in array array[
    'public.sala_entrar(text, text, text, text)',
    'public.sala_entrar_codigo(text, text, text)',
    'public.sala_estado(text)',
    'public.sala_responder(text, uuid, jsonb)',
    'public.normalizar_resposta(text, jsonb, jsonb)'
  ] loop
    foreach papel in array array['anon', 'authenticated'] loop
      if has_function_privilege(papel, funcao, 'execute') then
        raise exception 'FALHOU: % pode executar %', papel, funcao;
      end if;
    end loop;
    if not has_function_privilege('service_role', funcao, 'execute') then
      raise exception 'FALHOU: o servidor não pode executar %', funcao;
    end if;
  end loop;
end $$;

-- Uma sessão de participante e uma tentativa de entrada, para os testes de leitura.
insert into public.sessoes_participante (inscricao_id, token_hash, expira_em)
select id, repeat('a', 64), now() + interval '1 day'
  from public.inscricoes where evento_id = '00000000-0000-4000-c000-00000000000a';

insert into public.tentativas_entrada (ip_hash, sucesso) values ('teste', false);

-- Blocos: um em cada evento.
insert into public.blocos (id, evento_id, ordem, titulo)
values
  ('00000000-0000-4000-9000-0000000000a1', '00000000-0000-4000-c000-00000000000a', 1, 'Abertura do A'),
  ('00000000-0000-4000-9000-0000000000b1', '00000000-0000-4000-c000-00000000000b', 1, 'Abertura do B');

-- Atividades: duas no evento do A (múltipla e escala com referência), uma no do B (nuvem).
insert into public.atividades (id, evento_id, bloco_id, ordem, tipo, enunciado, config)
values
  ('00000000-0000-4000-e000-0000000000a1', '00000000-0000-4000-c000-00000000000a', '00000000-0000-4000-9000-0000000000a1', 1, 'multipla',
   'Qual a maior causa de atraso?', '{"opcoes": ["Desemprego", "Doença", "Descontrole"]}'),
  ('00000000-0000-4000-e000-0000000000a2', '00000000-0000-4000-c000-00000000000a', '00000000-0000-4000-9000-0000000000a1', 2, 'escala',
   'Quanto da carteira está em atraso?', '{"min": 0, "max": 100, "passo": 5, "unidade": "%", "referencia": 35}'),
  ('00000000-0000-4000-e000-0000000000b1', '00000000-0000-4000-c000-00000000000b', '00000000-0000-4000-9000-0000000000b1', 1, 'nuvem',
   'Uma palavra sobre cobrança', '{"max_palavras": 3}');

-- Daqui até o bloco do instrutor A, simula o servidor (chave secreta).
set local request.jwt.claims = '{"role":"service_role"}';

do $$
declare
  linhas integer;
begin
  -- Configuração inválida é recusada pelo banco.
  begin
    insert into public.atividades (evento_id, bloco_id, ordem, tipo, enunciado, config)
    values ('00000000-0000-4000-c000-00000000000a', '00000000-0000-4000-9000-0000000000a1', 9, 'multipla', 'Só uma opção', '{"opcoes": ["A"]}');
    raise exception 'FALHOU: aceitou múltipla escolha com uma opção só';
  exception when check_violation then
    null;
  end;
  begin
    insert into public.atividades (evento_id, bloco_id, ordem, tipo, enunciado, config)
    values ('00000000-0000-4000-c000-00000000000a', '00000000-0000-4000-9000-0000000000a1', 9, 'escala', 'Passo torto', '{"min": 0, "max": 10, "passo": 3}');
    raise exception 'FALHOU: aceitou escala com passo que não divide o intervalo';
  exception when check_violation then
    null;
  end;

  -- Resposta para atividade que não está aberta é recusada.
  begin
    insert into public.respostas (atividade_id, inscricao_id, valor)
    select '00000000-0000-4000-e000-0000000000a1', id, '{"opcao": 0}'
      from public.inscricoes where evento_id = '00000000-0000-4000-c000-00000000000a';
    raise exception 'FALHOU: aceitou resposta com a atividade fechada';
  exception when check_violation then
    null;
  end;

  -- Abrir: vira a atividade atual do evento.
  perform public.comandar_atividade('00000000-0000-4000-e000-0000000000a1', 'abrir');
  if (select atividade_atual_id from public.eventos where id = '00000000-0000-4000-c000-00000000000a')
     is distinct from '00000000-0000-4000-e000-0000000000a1' then
    raise exception 'FALHOU: abrir não definiu a atividade atual';
  end if;

  -- Resposta com a atividade aberta entra; responder de novo substitui.
  insert into public.respostas (atividade_id, inscricao_id, valor)
  select '00000000-0000-4000-e000-0000000000a1', id, '{"opcao": 0}'
    from public.inscricoes where evento_id = '00000000-0000-4000-c000-00000000000a';
  insert into public.respostas (atividade_id, inscricao_id, valor)
  select '00000000-0000-4000-e000-0000000000a1', id, '{"opcao": 2}'
    from public.inscricoes where evento_id = '00000000-0000-4000-c000-00000000000a'
  on conflict (atividade_id, inscricao_id, rodada) do update set valor = excluded.valor;
  if (select count(*) from public.respostas where atividade_id = '00000000-0000-4000-e000-0000000000a1') <> 1
     or (select valor ->> 'opcao' from public.respostas where atividade_id = '00000000-0000-4000-e000-0000000000a1') <> '2' then
    raise exception 'FALHOU: responder de novo não substituiu a resposta anterior';
  end if;

  -- Inscrito de outro evento não responde.
  begin
    insert into public.respostas (atividade_id, inscricao_id, valor)
    select '00000000-0000-4000-e000-0000000000a1', id, '{"opcao": 1}'
      from public.inscricoes where evento_id = '00000000-0000-4000-c000-00000000000b';
    raise exception 'FALHOU: aceitou resposta de inscrito de outro evento';
  exception when check_violation then
    null;
  end;

  -- Só uma aberta por evento: abrir a segunda encerra a primeira.
  perform public.comandar_atividade('00000000-0000-4000-e000-0000000000a2', 'abrir');
  if (select estado from public.atividades where id = '00000000-0000-4000-e000-0000000000a1') <> 'encerrada'
     or (select count(*) from public.atividades
          where evento_id = '00000000-0000-4000-c000-00000000000a' and estado = 'aberta') <> 1 then
    raise exception 'FALHOU: abrir outra atividade não encerrou a anterior';
  end if;

  -- Resultado agregado: o servidor lê; só números, sem quem respondeu.
  if public.resultado_atividade('00000000-0000-4000-e000-0000000000a1') is null then
    raise exception 'FALHOU: servidor não lê o resultado agregado';
  end if;
  if (public.resultado_atividade('00000000-0000-4000-e000-0000000000a1') -> 'contagem') <> '[0, 0, 1]'::jsonb then
    raise exception 'FALHOU: resultado da múltipla escolha errado';
  end if;
  if public.resultado_atividade('00000000-0000-4000-e000-0000000000a1')::text ~* 'inscricao|pessoa|email' then
    raise exception 'FALHOU: resultado agregado expõe quem respondeu';
  end if;
end $$;

-- Fatia 3: uma resposta aberta no evento do B, para os testes de moderação.
insert into public.atividades (id, evento_id, bloco_id, ordem, tipo, enunciado, config)
values ('00000000-0000-4000-e000-0000000000b2', '00000000-0000-4000-c000-00000000000b', '00000000-0000-4000-9000-0000000000b1', 2, 'aberta',
        'O que mais trava a cobrança?', '{"max_caracteres": 280}');

do $$
begin
  perform public.comandar_atividade('00000000-0000-4000-e000-0000000000b2', 'abrir');
  insert into public.respostas (id, atividade_id, inscricao_id, valor)
  select '00000000-0000-4000-f000-0000000000b2', '00000000-0000-4000-e000-0000000000b2', id,
         '{"texto": "Texto do participante do B"}'
    from public.inscricoes where evento_id = '00000000-0000-4000-c000-00000000000b';

  -- Funções de moderação e de evento: nunca para o visitante sem login.
  if has_function_privilege('anon', 'public.respostas_abertas(uuid)', 'execute')
     or has_function_privilege('anon', 'public.moderar_resposta(uuid, boolean)', 'execute')
     or has_function_privilege('anon', 'public.encerrar_evento(uuid)', 'execute')
     or has_function_privilege('anon', 'public.reabrir_evento(uuid)', 'execute') then
    raise exception 'FALHOU: visitante sem login pode executar função de moderação ou de evento';
  end if;
end $$;

-- Entrada só com o código (0022), como o servidor faz.
do $$
declare
  codigo_b text;
  r jsonb;
begin
  select codigo_acesso into codigo_b from public.eventos where id = '00000000-0000-4000-c000-00000000000b';

  r := public.sala_entrar_codigo(codigo_b, 'ip-anonimo', repeat('c', 64));
  if r ->> 'resultado' <> 'ok' then
    raise exception 'FALHOU: entrada só com o código não entrou (%)', r;
  end if;
  if (select count(*) from public.inscricoes i
        join public.sessoes_participante s on s.inscricao_id = i.id
       where i.evento_id = '00000000-0000-4000-c000-00000000000b'
         and i.origem = 'anonima' and i.pessoa_id is null
         and s.token_hash = repeat('c', 64)) <> 1 then
    raise exception 'FALHOU: entrada só com o código não criou participante anônimo com sessão';
  end if;
  if public.sala_estado(repeat('c', 64)) -> 'participante' ->> 'inscricaoId' is null then
    raise exception 'FALHOU: sala_estado não reconhece participante anônimo';
  end if;

  if public.sala_entrar_codigo('ZZZZ', 'ip-anonimo', repeat('d', 64)) ->> 'resultado' <> 'nao_confere' then
    raise exception 'FALHOU: código inexistente não foi recusado';
  end if;

  -- Passou das 23h59 do último dia: o código não vale mais.
  update public.eventos set data_inicio = '2020-01-01', data_fim = '2020-01-01'
   where id = '00000000-0000-4000-c000-00000000000b';
  if public.sala_entrar_codigo(codigo_b, 'ip-anonimo', repeat('d', 64)) ->> 'resultado' <> 'terminou' then
    raise exception 'FALHOU: código valeu depois do último dia do evento';
  end if;
  update public.eventos set data_inicio = '2099-01-10', data_fim = '2099-01-11'
   where id = '00000000-0000-4000-c000-00000000000b';

  -- Anônima sem pessoa, e só anônima: o banco confere.
  begin
    insert into public.inscricoes (evento_id, pessoa_id, origem)
    values ('00000000-0000-4000-c000-00000000000b', null, 'lista');
    raise exception 'FALHOU: aceitou inscrição de lista sem pessoa';
  exception when check_violation then
    null;
  end;

  -- Teto de 150 participantes por evento.
  insert into public.inscricoes (evento_id, pessoa_id, origem)
  select '00000000-0000-4000-c000-00000000000b', null, 'anonima' from generate_series(1, 149);
  if public.sala_entrar_codigo(codigo_b, 'ip-anonimo', repeat('d', 64)) ->> 'resultado' <> 'lotado' then
    raise exception 'FALHOU: entrou além do teto de participantes';
  end if;

  -- Limpa: os testes seguintes contam as inscrições do B.
  delete from public.inscricoes where origem = 'anonima';
end $$;


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

  -- Não apaga nem o próprio evento (só admin apaga).
  delete from public.eventos where id = '00000000-0000-4000-c000-00000000000a';
  get diagnostics linhas = row_count;
  if linhas <> 0 then
    raise exception 'FALHOU: instrutor A apagou o próprio evento';
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

  -- Não lê sessões de participante nem tentativas de entrada (só o servidor lê).
  begin
    perform 1 from public.sessoes_participante;
    if found then
      raise exception 'FALHOU: instrutor lê sessões de participante';
    end if;
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform 1 from public.tentativas_entrada;
    if found then
      raise exception 'FALHOU: instrutor lê tentativas de entrada';
    end if;
  exception when insufficient_privilege then
    null;
  end;

  -- Gera outro código de acesso para o próprio evento, mas não para o do B.
  if (select public.regenerar_codigo_acesso('00000000-0000-4000-c000-00000000000a')) is null then
    raise exception 'FALHOU: instrutor A não gerou outro código para o próprio evento';
  end if;
  if (select public.regenerar_codigo_acesso('00000000-0000-4000-c000-00000000000b')) is not null then
    raise exception 'FALHOU: instrutor A trocou o código de acesso do evento do B';
  end if;

  -- Atividades: vê as do próprio evento, não as do B.
  if (select count(*) from public.atividades where evento_id = '00000000-0000-4000-c000-00000000000a') <> 2 then
    raise exception 'FALHOU: instrutor A não vê as atividades do próprio evento';
  end if;
  if (select count(*) from public.atividades where evento_id = '00000000-0000-4000-c000-00000000000b') <> 0 then
    raise exception 'FALHOU: instrutor A vê atividade do evento do B';
  end if;

  -- Cria atividade no próprio evento, mas não no do B.
  insert into public.atividades (evento_id, bloco_id, ordem, tipo, enunciado, config)
  values ('00000000-0000-4000-c000-00000000000a', '00000000-0000-4000-9000-0000000000a1', 3, 'nuvem', 'Nova do A', '{"max_palavras": 1}');
  begin
    insert into public.atividades (evento_id, bloco_id, ordem, tipo, enunciado, config)
    values ('00000000-0000-4000-c000-00000000000b', '00000000-0000-4000-9000-0000000000b1', 9, 'nuvem', 'Intrusa', '{"max_palavras": 1}');
    raise exception 'FALHOU: instrutor A criou atividade no evento do B';
  exception when insufficient_privilege then
    null;
  end;

  -- Não altera atividade do B.
  update public.atividades set enunciado = 'Alterada por A' where id = '00000000-0000-4000-e000-0000000000b1';
  get diagnostics linhas = row_count;
  if linhas <> 0 then
    raise exception 'FALHOU: instrutor A alterou atividade do B';
  end if;

  -- Não comanda atividade do B (para ele, ela não existe).
  begin
    perform public.comandar_atividade('00000000-0000-4000-e000-0000000000b1', 'abrir');
    raise exception 'FALHOU: instrutor A abriu atividade do B';
  exception when no_data_found then
    null;
  end;

  -- Comanda as próprias.
  perform public.comandar_atividade('00000000-0000-4000-e000-0000000000a2', 'encerrar');
  perform public.comandar_atividade('00000000-0000-4000-e000-0000000000a2', 'revelar_referencia');
  if not (select referencia_revelada from public.atividades where id = '00000000-0000-4000-e000-0000000000a2') then
    raise exception 'FALHOU: instrutor A não revelou a referência';
  end if;

  -- As funções do participante são só do servidor (chave secreta).
  begin
    perform public.sala_estado(repeat('a', 64));
    raise exception 'FALHOU: instrutor executa sala_estado (dados de sessão de participante)';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.sala_entrar('ABCD', 'x@pulse.test', 'ip', repeat('b', 64));
    raise exception 'FALHOU: instrutor executa sala_entrar';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.sala_responder(repeat('a', 64), '00000000-0000-4000-e000-0000000000a1', '{"opcao": 0}');
    raise exception 'FALHOU: instrutor executa sala_responder';
  exception when insufficient_privilege then
    null;
  end;

  -- Respostas: não lê a tabela; só o resultado agregado dos próprios eventos.
  begin
    perform 1 from public.respostas;
    if found then
      raise exception 'FALHOU: instrutor lê respostas individuais';
    end if;
  exception when insufficient_privilege then
    null;
  end;
  if (public.resultado_atividade('00000000-0000-4000-e000-0000000000a1') ->> 'total') is distinct from '1' then
    raise exception 'FALHOU: instrutor A não lê o resultado agregado do próprio evento';
  end if;
  if public.resultado_atividade('00000000-0000-4000-e000-0000000000b1') is not null then
    raise exception 'FALHOU: instrutor A lê o resultado do evento do B';
  end if;

  -- Relatório (0025): respostas do próprio evento, com número anônimo e sem
  -- identificar ninguém; nada do evento do B.
  if jsonb_array_length(public.relatorio_respostas('00000000-0000-4000-c000-00000000000a')) <> 1
     or (public.relatorio_respostas('00000000-0000-4000-c000-00000000000a') -> 0 ->> 'participante') <> '1' then
    raise exception 'FALHOU: instrutor A não lê o relatório do próprio evento';
  end if;
  if public.relatorio_respostas('00000000-0000-4000-c000-00000000000a')::text ~* 'inscricao|pessoa|email|nome' then
    raise exception 'FALHOU: relatório expõe quem respondeu';
  end if;
  if public.relatorio_respostas('00000000-0000-4000-c000-00000000000b') is not null then
    raise exception 'FALHOU: instrutor A lê o relatório do evento do B';
  end if;

  -- Fatia 3: não modera nem lê as respostas abertas do evento do B.
  if public.respostas_abertas('00000000-0000-4000-e000-0000000000b2') is not null then
    raise exception 'FALHOU: instrutor A lê respostas abertas do evento do B';
  end if;
  if public.moderar_resposta('00000000-0000-4000-f000-0000000000b2', true) is not null then
    raise exception 'FALHOU: instrutor A aprovou resposta do evento do B';
  end if;

  -- Não oculta palavra em atividade do B; oculta na própria.
  begin
    insert into public.palavras_ocultas (atividade_id, chave)
    values ('00000000-0000-4000-e000-0000000000b1', 'prazo');
    raise exception 'FALHOU: instrutor A ocultou palavra na atividade do B';
  exception when insufficient_privilege then
    null;
  end;
  insert into public.palavras_ocultas (atividade_id, chave)
  values ('00000000-0000-4000-e000-0000000000a1', 'prazo');

  -- Blocos: vê e mexe nos do próprio evento, não nos do B.
  if (select count(*) from public.blocos where evento_id = '00000000-0000-4000-c000-00000000000a') <> 1 then
    raise exception 'FALHOU: instrutor A não vê os blocos do próprio evento';
  end if;
  if (select count(*) from public.blocos where evento_id = '00000000-0000-4000-c000-00000000000b') <> 0 then
    raise exception 'FALHOU: instrutor A vê bloco do evento do B';
  end if;
  insert into public.blocos (evento_id, ordem, titulo)
  values ('00000000-0000-4000-c000-00000000000a', 2, 'Caso 1 do A');
  begin
    insert into public.blocos (evento_id, ordem, titulo)
    values ('00000000-0000-4000-c000-00000000000b', 2, 'Intruso');
    raise exception 'FALHOU: instrutor A criou bloco no evento do B';
  exception when insufficient_privilege then
    null;
  end;
  update public.blocos set titulo = 'Alterado por A' where id = '00000000-0000-4000-9000-0000000000b1';
  get diagnostics linhas = row_count;
  if linhas <> 0 then
    raise exception 'FALHOU: instrutor A alterou bloco do B';
  end if;
  begin
    perform public.mover_bloco('00000000-0000-4000-9000-0000000000b1', 1);
    raise exception 'FALHOU: instrutor A moveu bloco do B';
  exception when no_data_found then
    null;
  end;
  -- Atividade do A não entra em bloco do B (o banco confere o evento do bloco).
  begin
    update public.atividades set bloco_id = '00000000-0000-4000-9000-0000000000b1'
     where id = '00000000-0000-4000-e000-0000000000a1';
    raise exception 'FALHOU: atividade do A entrou em bloco do evento do B';
  exception when foreign_key_violation then
    null;
  end;
  update public.atividades set bloco_id = '00000000-0000-4000-9000-0000000000a1'
   where id = '00000000-0000-4000-e000-0000000000a1';
  get diagnostics linhas = row_count;
  if linhas <> 1 then
    raise exception 'FALHOU: instrutor A não pôs atividade no próprio bloco';
  end if;

  -- Atividade sem bloco é recusada pelo banco (0024).
  begin
    insert into public.atividades (evento_id, ordem, tipo, enunciado, config)
    values ('00000000-0000-4000-c000-00000000000a', 9, 'nuvem', 'Sem bloco', '{"max_palavras": 1}');
    raise exception 'FALHOU: aceitou atividade sem bloco';
  exception when not_null_violation then
    null;
  end;

  -- Duplica a própria atividade e o próprio bloco; não os do B.
  perform public.duplicar_atividade('00000000-0000-4000-e000-0000000000a2');
  if (select count(*) from public.atividades
       where evento_id = '00000000-0000-4000-c000-00000000000a'
         and enunciado = 'Quanto da carteira está em atraso? (cópia)' and estado = 'fechada') <> 1 then
    raise exception 'FALHOU: instrutor A não duplicou a própria atividade';
  end if;
  perform public.duplicar_bloco('00000000-0000-4000-9000-0000000000a1');
  if (select count(*) from public.blocos
       where evento_id = '00000000-0000-4000-c000-00000000000a' and titulo = 'Abertura do A (cópia)') <> 1 then
    raise exception 'FALHOU: instrutor A não duplicou o próprio bloco';
  end if;
  begin
    perform public.duplicar_atividade('00000000-0000-4000-e000-0000000000b1');
    raise exception 'FALHOU: instrutor A duplicou atividade do B';
  exception when no_data_found then
    null;
  end;
  begin
    perform public.duplicar_bloco('00000000-0000-4000-9000-0000000000b1');
    raise exception 'FALHOU: instrutor A duplicou bloco do B';
  exception when no_data_found then
    null;
  end;

  -- Bloco com atividades não pode ser excluído.
  begin
    delete from public.blocos where id = '00000000-0000-4000-9000-0000000000a1';
    raise exception 'FALHOU: excluiu bloco com atividades';
  exception when foreign_key_violation then
    null;
  end;

  -- Não encerra o evento do B.
  begin
    perform public.encerrar_evento('00000000-0000-4000-c000-00000000000b');
    raise exception 'FALHOU: instrutor A encerrou o evento do B';
  exception when no_data_found then
    null;
  end;

  -- Não reabre evento (só admin).
  begin
    perform public.reabrir_evento('00000000-0000-4000-c000-00000000000a');
    raise exception 'FALHOU: instrutor reabriu evento';
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

-- Confere, como dono do banco, que o papel do A continua instrutor
-- e que a resposta aberta do B continua sem aprovação.
do $$
begin
  if (select papel from public.perfis where id = '00000000-0000-4000-a000-00000000000a') <> 'instrutor' then
    raise exception 'FALHOU: papel do instrutor A mudou';
  end if;
  if (select aprovada from public.respostas where id = '00000000-0000-4000-f000-0000000000b2') then
    raise exception 'FALHOU: resposta aberta do B foi aprovada pelo instrutor A';
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

  -- Nem o admin lê sessões e tentativas pelo login: só o servidor.
  begin
    perform 1 from public.sessoes_participante;
    if found then
      raise exception 'FALHOU: admin lê sessões de participante pelo login';
    end if;
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform 1 from public.tentativas_entrada;
    if found then
      raise exception 'FALHOU: admin lê tentativas de entrada pelo login';
    end if;
  exception when insufficient_privilege then
    null;
  end;

  -- Admin vê atividades e resultados de qualquer evento.
  if (select count(*) from public.atividades where evento_id = '00000000-0000-4000-c000-00000000000b') <> 2 then
    raise exception 'FALHOU: admin não vê as atividades do evento do B';
  end if;
  if public.respostas_abertas('00000000-0000-4000-e000-0000000000b2') is null then
    raise exception 'FALHOU: admin não lê respostas abertas do evento do B';
  end if;
  if public.resultado_atividade('00000000-0000-4000-e000-0000000000b1') is null then
    raise exception 'FALHOU: admin não lê o resultado do evento do B';
  end if;

  -- Admin apaga evento (e as atividades vão junto).
  delete from public.eventos where id = '00000000-0000-4000-c000-00000000000b';
  get diagnostics linhas = row_count;
  if linhas <> 1 then
    raise exception 'FALHOU: admin não apagou evento';
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
  begin
    perform 1 from public.atividades;
    raise exception 'FALHOU: visitante sem login lê atividades';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform 1 from public.respostas;
    raise exception 'FALHOU: visitante sem login lê respostas';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.resultado_atividade('00000000-0000-4000-e000-0000000000a1');
    raise exception 'FALHOU: visitante sem login lê resultado agregado';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.sala_estado(repeat('a', 64));
    raise exception 'FALHOU: visitante sem login executa sala_estado';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.relatorio_respostas('00000000-0000-4000-c000-00000000000a');
    raise exception 'FALHOU: visitante sem login lê o relatório';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform 1 from public.blocos;
    raise exception 'FALHOU: visitante sem login lê blocos';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.sala_entrar_codigo('ABCD', 'ip', repeat('e', 64));
    raise exception 'FALHOU: visitante sem login executa sala_entrar_codigo';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform 1 from public.palavras_ocultas;
    raise exception 'FALHOU: visitante sem login lê palavras ocultas';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.sala_responder(repeat('a', 64), '00000000-0000-4000-e000-0000000000a1', '{"opcao": 0}');
    raise exception 'FALHOU: visitante sem login executa sala_responder';
  exception when insufficient_privilege then
    null;
  end;
end $$;

reset role;

-- Só chega aqui se nenhuma verificação acima falhou.
select 'OK: todos os testes de isolamento passaram' as resultado;

rollback;
