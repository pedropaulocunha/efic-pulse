-- 0016 — nuvem de palavras limpa e moderada.
-- Cada palavra vira uma "chave": minúsculas, sem acento e no singular.
-- "Crédito", "credito" e "créditos" têm a mesma chave ("credito") e contam juntos.
-- Palavras vazias ("de", "para"...) e uma lista padrão de palavrões não entram.
-- O instrutor pode ocultar uma chave no controle (tabela palavras_ocultas).

create or replace function public.chave_palavra(palavra text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  w text;
  -- Palavras que já terminam em "s" no singular.
  excecoes constant text[] := array[
    'juros', 'onus', 'bonus', 'virus', 'lapis', 'tenis', 'status', 'campus', 'atlas',
    'pires', 'simples', 'mais', 'menos', 'depois', 'antes', 'apos', 'tras', 'pois',
    'tres', 'seis', 'dois', 'gas', 'mes', 'pais', 'deus', 'onibus', 'cais'
  ];
begin
  w := translate(
    lower(trim(regexp_replace(coalesce(palavra, ''), '\s+', ' ', 'g'))),
    'áàâãäéèêëíìîïóòôõöúùûüç',
    'aaaaaeeeeiiiiooooouuuuc'
  );
  if w = '' then
    return null;
  end if;
  if w = any (excecoes) then
    return w;
  end if;
  if length(w) > 4 and right(w, 3) in ('oes', 'aes') then
    return left(w, length(w) - 3) || 'ao';         -- renegociações → renegociacao
  end if;
  if length(w) > 3 and right(w, 2) = 'ns' then
    return left(w, length(w) - 2) || 'm';          -- bens → bem
  end if;
  if length(w) > 4 and right(w, 3) in ('res', 'zes') then
    return left(w, length(w) - 2);                 -- valores → valor
  end if;
  if length(w) > 3 and right(w, 1) = 's' and right(w, 2) not in ('ss', 'us', 'is') then
    return left(w, length(w) - 1);                 -- prazos → prazo
  end if;
  return w;
end;
$$;

-- Palavras vazias (já sem acento, como sai de chave_palavra).
create or replace function public.palavra_vazia(chave text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select chave = any (array[
    'a', 'o', 'as', 'os', 'um', 'uma', 'uns', 'de', 'da', 'do', 'das', 'dos', 'em', 'na', 'no',
    'nas', 'nos', 'por', 'pela', 'pelo', 'para', 'pra', 'pro', 'com', 'sem', 'sob', 'sobre',
    'e', 'ou', 'mas', 'que', 'se', 'nao', 'sim', 'muito', 'muita', 'mais', 'menos', 'ja',
    'tambem', 'so', 'como', 'quando', 'onde', 'ao', 'aos', 'eu', 'ele', 'ela', 'voce', 'isso',
    'isto', 'aquilo', 'esse', 'essa', 'este', 'esta', 'meu', 'minha', 'meus', 'seu', 'sua',
    'seus', 'lhe', 'me', 'te', 'ser', 'estar', 'ter', 'tem', 'ha', 'foi', 'era', 'sao', 'estao',
    'vai', 'vao', 'fazer', 'faz', 'coisa', 'tudo', 'todo', 'toda', 'nada', 'qual', 'quem',
    'porque', 'pq', 'entao', 'ate', 'apos', 'bem', 'mal', 'aqui', 'la', 'ai', 'ne', 'tipo'
  ]);
$$;

-- Lista padrão de palavras que nunca vão para o telão (já sem acento).
create or replace function public.palavra_bloqueada(chave text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select chave = any (array[
    'porra', 'caralho', 'merda', 'bosta', 'puta', 'puto', 'foda', 'foder', 'fodase', 'buceta',
    'cu', 'viado', 'veado', 'arrombado', 'arrombada', 'otario', 'otaria', 'babaca', 'idiota',
    'imbecil', 'desgracado', 'desgracada', 'vagabundo', 'vagabunda', 'corno', 'cacete', 'piranha'
  ]);
$$;

revoke execute on function public.chave_palavra(text) from public, anon;
revoke execute on function public.palavra_vazia(text) from public, anon;
revoke execute on function public.palavra_bloqueada(text) from public, anon;
grant execute on function public.chave_palavra(text) to authenticated, service_role;
grant execute on function public.palavra_vazia(text) to authenticated, service_role;
grant execute on function public.palavra_bloqueada(text) to authenticated, service_role;

-- Palavras que o instrutor ocultou do telão, por atividade (guarda a chave).
create table public.palavras_ocultas (
  atividade_id uuid not null references public.atividades (id) on delete cascade,
  chave text not null constraint palavras_ocultas_chave_check check (length(chave) > 0),
  criado_em timestamptz not null default now(),
  primary key (atividade_id, chave)
);

-- Função de apoio: o usuário é instrutor do evento desta atividade? Falha fechado.
create or replace function public.usuario_instrutor_da_atividade(atividade uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select e.instrutor_id = auth.uid()
       from public.atividades a
       join public.eventos e on e.id = a.evento_id
      where a.id = atividade),
    false
  );
$$;

revoke execute on function public.usuario_instrutor_da_atividade(uuid) from public, anon;
grant execute on function public.usuario_instrutor_da_atividade(uuid) to authenticated;

alter table public.palavras_ocultas enable row level security;

revoke all on table public.palavras_ocultas from anon;
grant select, insert, delete on table public.palavras_ocultas to authenticated;
grant select, insert, update, delete on table public.palavras_ocultas to service_role;

create policy palavras_ocultas_select on public.palavras_ocultas
  for select to authenticated
  using (
    (select public.usuario_e_admin())
    or (select public.usuario_instrutor_da_atividade(atividade_id))
  );

create policy palavras_ocultas_insert on public.palavras_ocultas
  for insert to authenticated
  with check (
    (select public.usuario_e_admin())
    or (select public.usuario_instrutor_da_atividade(atividade_id))
  );

create policy palavras_ocultas_delete on public.palavras_ocultas
  for delete to authenticated
  using (
    (select public.usuario_e_admin())
    or (select public.usuario_instrutor_da_atividade(atividade_id))
  );
