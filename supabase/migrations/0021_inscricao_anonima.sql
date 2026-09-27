-- 0021 — participante anônimo: entra só com o código do evento, sem e-mail.
-- Cada celular que entra vira uma inscrição de origem 'anonima', sem pessoa.
-- As respostas continuam ligadas à inscrição (uma por celular), como antes.
-- Nada é apagado aqui: a entrada por e-mail sai do código do site primeiro, e
-- as tabelas e funções antigas saem depois, em migração separada.

-- Trava: se este arquivo chegar com os acentos trocados, para aqui.
do $$
begin
  if length('ção') <> 3 then
    raise exception 'ACENTOS TROCADOS AO COLAR. Copie de novo com o comando que tem -Encoding UTF8.';
  end if;
end $$;

alter table public.inscricoes alter column pessoa_id drop not null;

alter table public.inscricoes drop constraint inscricoes_origem_check;
alter table public.inscricoes add constraint inscricoes_origem_check
  check (origem in ('lista', 'cadastro_sala', 'anonima'));

-- Anônima nunca tem pessoa; as outras sempre têm.
alter table public.inscricoes add constraint inscricoes_anonima_sem_pessoa
  check ((origem = 'anonima') = (pessoa_id is null));

select 'OK: 0021 aplicada' as resultado;
