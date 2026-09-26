-- 0011 — respostas dos participantes.
-- Uma resposta por participante, atividade e rodada: responder de novo
-- com a votação aberta substitui a anterior (vale a última).
-- RLS ligada e SEM políticas: só o servidor, com a chave secreta, lê e grava.
-- O instrutor vê só números agregados, pela função resultado_atividade (0012).

create table public.respostas (
  id uuid primary key default gen_random_uuid(),
  atividade_id uuid not null references public.atividades (id) on delete cascade,
  inscricao_id uuid not null references public.inscricoes (id) on delete cascade,
  rodada integer not null default 1 constraint respostas_rodada_check check (rodada >= 1),
  valor jsonb not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint respostas_unica unique (atividade_id, inscricao_id, rodada)
);

create index respostas_inscricao_id_idx on public.respostas (inscricao_id);

-- Garantia no banco: só entra resposta para atividade ABERTA, e de alguém
-- inscrito no mesmo evento da atividade.
create or replace function public.conferir_resposta()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  estado_atividade text;
  evento_atividade uuid;
  evento_inscricao uuid;
begin
  select a.estado, a.evento_id into estado_atividade, evento_atividade
    from public.atividades a where a.id = new.atividade_id;
  select i.evento_id into evento_inscricao
    from public.inscricoes i where i.id = new.inscricao_id;

  if estado_atividade is distinct from 'aberta' then
    raise exception 'A atividade não está aberta' using errcode = 'check_violation';
  end if;
  if evento_atividade is distinct from evento_inscricao then
    raise exception 'Inscrição de outro evento' using errcode = 'check_violation';
  end if;

  new.atualizado_em := now();
  return new;
end;
$$;

create trigger respostas_conferir
  before insert or update on public.respostas
  for each row execute function public.conferir_resposta();

alter table public.respostas enable row level security;

revoke all on table public.respostas from anon, authenticated;
grant select, insert, update, delete on table public.respostas to service_role;
