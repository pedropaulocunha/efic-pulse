"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { estiloBotaoSecundario } from "@/components/ui";
import {
  criarBloco,
  encerrarEvento,
  excluirAtividade,
  excluirBloco,
  moverAtividade,
  moverBloco,
  reabrirEvento,
  renomearBloco,
} from "../acoes-atividades";

// Encerrar (instrutor ou admin) ou reabrir (só admin) o evento.
export function BotaoEstadoEvento({
  eventoId,
  encerrado,
  podeReabrir,
}: {
  eventoId: string;
  encerrado: boolean;
  podeReabrir: boolean;
}) {
  const [ocupado, iniciar] = useTransition();
  const [erro, setErro] = useState<string>();

  if (encerrado && !podeReabrir) return null;

  function agir() {
    const pergunta = encerrado
      ? "Reabrir este evento? Se o código de acesso já estiver em uso por outro evento, ele ganha um código novo."
      : "Encerrar este evento?\n\nOs celulares passam a mostrar \"Este evento já terminou.\" e o código de acesso fica livre para outro evento.";
    if (!window.confirm(pergunta)) return;
    setErro(undefined);
    iniciar(async () => {
      const r = encerrado ? await reabrirEvento(eventoId) : await encerrarEvento(eventoId);
      if (r.erro) setErro(r.erro);
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={agir}
        disabled={ocupado}
        className={`${estiloBotaoSecundario} ${encerrado ? "" : "text-red-700"}`}
      >
        {ocupado ? "Aguarde…" : encerrado ? "Reabrir evento" : "Encerrar evento"}
      </button>
      {erro && <p className="mt-2 text-sm text-red-700">{erro}</p>}
    </div>
  );
}

export function BotaoCopiarLink({ caminho }: { caminho: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    const link = `${window.location.origin}${caminho}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      window.prompt("Copie o link da projeção:", link);
    }
  }

  return (
    <button type="button" onClick={copiar} className={estiloBotaoSecundario}>
      {copiado ? "Link copiado ✓" : "Copiar link da projeção"}
    </button>
  );
}

const estiloBotaoPequeno =
  "inline-flex h-11 min-w-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-slate-600 hover:bg-slate-50 disabled:opacity-40";

export function BotoesAtividade({
  eventoId,
  atividadeId,
  primeira,
  ultima,
  podeExcluir,
}: {
  eventoId: string;
  atividadeId: string;
  primeira: boolean;
  ultima: boolean;
  podeExcluir: boolean;
}) {
  const [ocupado, iniciar] = useTransition();
  const [erro, setErro] = useState<string>();

  function excluir() {
    if (!window.confirm("Excluir esta atividade? As respostas dela também serão apagadas.")) return;
    iniciar(async () => {
      const r = await excluirAtividade(eventoId, atividadeId);
      if (r.erro) setErro(r.erro);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={ocupado || primeira}
        onClick={() => iniciar(() => moverAtividade(eventoId, atividadeId, -1))}
        aria-label="Subir"
        className={estiloBotaoPequeno}
      >
        ↑
      </button>
      <button
        type="button"
        disabled={ocupado || ultima}
        onClick={() => iniciar(() => moverAtividade(eventoId, atividadeId, 1))}
        aria-label="Descer"
        className={estiloBotaoPequeno}
      >
        ↓
      </button>
      {podeExcluir && (
        <button type="button" disabled={ocupado} onClick={excluir} className={`${estiloBotaoPequeno} text-red-700`}>
          Excluir
        </button>
      )}
      {erro && <span className="text-sm text-red-700">{erro}</span>}
    </div>
  );
}

// Campo de nome do bloco, usado para criar e para renomear.
function FormularioNomeBloco({
  inicial,
  rotuloBotao,
  ocupado,
  aoSalvar,
  aoCancelar,
}: {
  inicial: string;
  rotuloBotao: string;
  ocupado: boolean;
  aoSalvar: (titulo: string) => void;
  aoCancelar: () => void;
}) {
  const [titulo, setTitulo] = useState(inicial);
  return (
    <form
      onSubmit={(ev) => {
        ev.preventDefault();
        aoSalvar(titulo);
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <input
        value={titulo}
        onChange={(ev) => setTitulo(ev.target.value)}
        maxLength={120}
        autoFocus
        placeholder="Ex.: Estudo de caso 1"
        aria-label="Nome do bloco"
        className="h-11 min-w-56 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-marca focus:ring-2 focus:ring-marca/20"
      />
      <button type="submit" disabled={ocupado || !titulo.trim()} className={estiloBotaoSecundario}>
        {ocupado ? "Salvando…" : rotuloBotao}
      </button>
      <button type="button" onClick={aoCancelar} className="h-11 px-2 text-slate-500 hover:underline">
        Cancelar
      </button>
    </form>
  );
}

export function BotaoNovoBloco({ eventoId }: { eventoId: string }) {
  const [aberto, setAberto] = useState(false);
  const [ocupado, iniciar] = useTransition();
  const [erro, setErro] = useState<string>();

  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} className={estiloBotaoSecundario}>
        Novo bloco
      </button>
    );
  }

  return (
    <div>
      <FormularioNomeBloco
        inicial=""
        rotuloBotao="Criar bloco"
        ocupado={ocupado}
        aoCancelar={() => {
          setAberto(false);
          setErro(undefined);
        }}
        aoSalvar={(titulo) =>
          iniciar(async () => {
            const r = await criarBloco(eventoId, titulo);
            if (r.erro) setErro(r.erro);
            else setAberto(false);
          })
        }
      />
      {erro && <p className="mt-2 text-sm text-red-700">{erro}</p>}
    </div>
  );
}

// Título do bloco, com mover, renomear, excluir e "+ Atividade" neste bloco.
export function CabecalhoBloco({
  eventoId,
  bloco,
  quantidade,
  primeiro,
  ultimo,
}: {
  eventoId: string;
  bloco: { id: string; titulo: string };
  quantidade: number;
  primeiro: boolean;
  ultimo: boolean;
}) {
  const [renomeando, setRenomeando] = useState(false);
  const [ocupado, iniciar] = useTransition();
  const [erro, setErro] = useState<string>();

  function excluir() {
    const aviso =
      quantidade > 0
        ? `Excluir o bloco "${bloco.titulo}"?\n\nAs ${quantidade} atividades dele NÃO são apagadas: ficam sem bloco, no topo da lista.`
        : `Excluir o bloco "${bloco.titulo}"?`;
    if (!window.confirm(aviso)) return;
    iniciar(async () => {
      const r = await excluirBloco(eventoId, bloco.id);
      if (r.erro) setErro(r.erro);
    });
  }

  return (
    <div className="mb-2">
      {renomeando ? (
        <FormularioNomeBloco
          inicial={bloco.titulo}
          rotuloBotao="Salvar"
          ocupado={ocupado}
          aoCancelar={() => setRenomeando(false)}
          aoSalvar={(titulo) =>
            iniciar(async () => {
              const r = await renomearBloco(eventoId, bloco.id, titulo);
              if (r.erro) setErro(r.erro);
              else setRenomeando(false);
            })
          }
        />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="mr-auto text-base font-semibold uppercase tracking-wide text-marca">{bloco.titulo}</h3>
          <Link
            href={`/painel/evento/${eventoId}/atividade/nova?bloco=${bloco.id}`}
            className="inline-flex h-11 items-center rounded-lg px-3 font-medium text-marca hover:bg-slate-100"
          >
            + Atividade
          </Link>
          <button
            type="button"
            disabled={ocupado || primeiro}
            onClick={() => iniciar(() => moverBloco(eventoId, bloco.id, -1))}
            aria-label="Subir bloco"
            className={estiloBotaoPequeno}
          >
            ↑
          </button>
          <button
            type="button"
            disabled={ocupado || ultimo}
            onClick={() => iniciar(() => moverBloco(eventoId, bloco.id, 1))}
            aria-label="Descer bloco"
            className={estiloBotaoPequeno}
          >
            ↓
          </button>
          <button type="button" disabled={ocupado} onClick={() => setRenomeando(true)} className={estiloBotaoPequeno}>
            Renomear
          </button>
          <button type="button" disabled={ocupado} onClick={excluir} className={`${estiloBotaoPequeno} text-red-700`}>
            Excluir
          </button>
        </div>
      )}
      {erro && <p className="mt-1 text-sm text-red-700">{erro}</p>}
    </div>
  );
}
