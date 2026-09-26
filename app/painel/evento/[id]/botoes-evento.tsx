"use client";

import { useState, useTransition } from "react";
import { estiloBotaoSecundario } from "@/components/ui";
import { excluirAtividade, moverAtividade } from "../acoes-atividades";

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
