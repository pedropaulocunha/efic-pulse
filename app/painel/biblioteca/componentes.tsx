"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { estiloBotaoCompacto, estiloBotaoSecundario } from "@/components/ui";
import {
  arquivarModelo,
  criarModelo,
  duplicarModelo,
  excluirPerguntaModelo,
  moverPerguntaModelo,
  renomearModelo,
} from "./acoes";

const estiloCampoCurto =
  "h-11 min-w-56 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-marca focus:ring-2 focus:ring-marca/20";
const estiloBotaoPequeno =
  "inline-flex h-11 min-w-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-slate-600 hover:bg-slate-50 disabled:opacity-40";

// Campo de nome, para criar e para renomear modelo.
function FormularioNome({
  inicial,
  rotulo,
  ocupado,
  aoSalvar,
  aoCancelar,
}: {
  inicial: string;
  rotulo: string;
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
        placeholder="Ex.: Quebra gelo"
        aria-label="Nome do modelo"
        className={estiloCampoCurto}
      />
      <button type="submit" disabled={ocupado || !titulo.trim()} className={estiloBotaoSecundario}>
        {ocupado ? "Salvando…" : rotulo}
      </button>
      <button type="button" onClick={aoCancelar} className="h-11 px-2 text-slate-500 hover:underline">
        Cancelar
      </button>
    </form>
  );
}

export function NovoModelo() {
  const [aberto, setAberto] = useState(false);
  const [ocupado, iniciar] = useTransition();
  const [erro, setErro] = useState<string>();

  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} className={estiloBotaoCompacto}>
        Novo modelo
      </button>
    );
  }
  return (
    <div className="w-full sm:w-auto">
      <FormularioNome
        inicial=""
        rotulo="Criar modelo"
        ocupado={ocupado}
        aoCancelar={() => setAberto(false)}
        aoSalvar={(titulo) =>
          iniciar(async () => {
            const r = await criarModelo(titulo);
            if (r?.erro) setErro(r.erro);
          })
        }
      />
      {erro && <p className="mt-2 text-sm text-red-700">{erro}</p>}
    </div>
  );
}

export function TituloModelo({ modeloId, titulo }: { modeloId: string; titulo: string }) {
  const [renomeando, setRenomeando] = useState(false);
  const [ocupado, iniciar] = useTransition();
  const [erro, setErro] = useState<string>();

  return (
    <div className="mt-4">
      {renomeando ? (
        <FormularioNome
          inicial={titulo}
          rotulo="Salvar"
          ocupado={ocupado}
          aoCancelar={() => setRenomeando(false)}
          aoSalvar={(novo) =>
            iniciar(async () => {
              const r = await renomearModelo(modeloId, novo);
              if (r.erro) setErro(r.erro);
              else setRenomeando(false);
            })
          }
        />
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold">{titulo}</h1>
          <button type="button" onClick={() => setRenomeando(true)} className="text-slate-500 hover:underline">
            Renomear
          </button>
        </div>
      )}
      {erro && <p className="mt-2 text-sm text-red-700">{erro}</p>}
    </div>
  );
}

export function BotoesModelo({ modeloId, arquivado }: { modeloId: string; arquivado: boolean }) {
  const [ocupado, iniciar] = useTransition();
  const [erro, setErro] = useState<string>();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={ocupado}
        onClick={() =>
          iniciar(async () => {
            const r = await duplicarModelo(modeloId);
            if (r?.erro) setErro(r.erro);
          })
        }
        className={estiloBotaoSecundario}
      >
        Duplicar modelo
      </button>
      <button
        type="button"
        disabled={ocupado}
        onClick={() => {
          if (
            !arquivado &&
            !window.confirm(
              "Arquivar este modelo?\n\nEle some da lista \"Bloco da biblioteca\" dos eventos. Os eventos que já o usaram e o comparativo continuam iguais.",
            )
          ) {
            return;
          }
          iniciar(async () => {
            const r = await arquivarModelo(modeloId, !arquivado);
            if (r.erro) setErro(r.erro);
          });
        }}
        className={estiloBotaoSecundario}
      >
        {arquivado ? "Desarquivar" : "Arquivar"}
      </button>
      {erro && <p className="text-sm text-red-700">{erro}</p>}
    </div>
  );
}

export function BotoesPerguntaModelo({
  modeloId,
  perguntaId,
  primeira,
  ultima,
  usada,
}: {
  modeloId: string;
  perguntaId: string;
  primeira: boolean;
  ultima: boolean;
  usada: boolean;
}) {
  const [ocupado, iniciar] = useTransition();
  const [erro, setErro] = useState<string>();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={`/painel/biblioteca/${modeloId}/pergunta/${perguntaId}`} className={estiloBotaoPequeno}>
        Editar
      </Link>
      <button
        type="button"
        disabled={ocupado || primeira}
        onClick={() => iniciar(() => moverPerguntaModelo(modeloId, perguntaId, -1))}
        aria-label="Subir"
        className={estiloBotaoPequeno}
      >
        ↑
      </button>
      <button
        type="button"
        disabled={ocupado || ultima}
        onClick={() => iniciar(() => moverPerguntaModelo(modeloId, perguntaId, 1))}
        aria-label="Descer"
        className={estiloBotaoPequeno}
      >
        ↓
      </button>
      {!usada && (
        <button
          type="button"
          disabled={ocupado}
          onClick={() => {
            if (!window.confirm("Excluir esta pergunta do modelo?")) return;
            iniciar(async () => {
              const r = await excluirPerguntaModelo(modeloId, perguntaId);
              if (r.erro) setErro(r.erro);
            });
          }}
          className={`${estiloBotaoPequeno} text-red-700`}
        >
          Excluir
        </button>
      )}
      {erro && <span className="text-sm text-red-700">{erro}</span>}
    </div>
  );
}
