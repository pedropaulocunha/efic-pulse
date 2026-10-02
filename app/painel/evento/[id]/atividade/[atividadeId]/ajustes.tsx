"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { CampoTempo } from "@/components/formulario-pergunta";
import { Aviso, estiloBotaoCompacto, estiloBotaoSecundario, estiloCampo } from "@/components/ui";
import { salvarAjustesAtividade, type EstadoFormularioAtividade } from "../../../acoes-atividades";

const inicial: EstadoFormularioAtividade = {};

// Pergunta já aberta, encerrada ou da biblioteca: só o que não mexe nas respostas
// (tempo para responder e observação). Texto, tipo e opções ficam travados.
export default function FormularioAjustes({
  eventoId,
  atividadeId,
  tempo,
  observacaoInicial,
  daBiblioteca,
}: {
  eventoId: string;
  atividadeId: string;
  tempo: number | null;
  observacaoInicial: string | null;
  daBiblioteca: boolean;
}) {
  const [estado, acao, salvando] = useActionState(salvarAjustesAtividade.bind(null, eventoId, atividadeId), inicial);
  const [observacao, setObservacao] = useState(observacaoInicial ?? "");

  return (
    <form action={acao} className="space-y-6">
      {estado.erro && <Aviso tipo="erro">{estado.erro}</Aviso>}

      <CampoTempo inicial={tempo} />
      <p className="-mt-3 text-sm text-slate-500">
        Se a votação estiver aberta agora, o tempo novo vale a partir do próximo &quot;Abrir&quot; ou &quot;Nova
        rodada&quot;. Para a contagem atual, use &quot;+30 s&quot; no controle.
      </p>

      {daBiblioteca ? (
        <p className="text-sm text-slate-500">
          A observação desta pergunta vem da biblioteca e é igual em todos os eventos que usam o modelo.
        </p>
      ) : (
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Observação (opcional)</span>
          <textarea
            name="observacao"
            rows={2}
            maxLength={500}
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Ex.: Considere os atrasos dos últimos 3 meses."
            className={`${estiloCampo} h-auto py-3`}
          />
          <span className="mt-1 block text-sm text-slate-500">
            Aparece no celular do participante logo abaixo da pergunta, como explicação.
          </span>
        </label>
      )}

      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={salvando} className={estiloBotaoCompacto}>
          {salvando ? "Salvando…" : "Salvar ajustes"}
        </button>
        <Link href={`/painel/evento/${eventoId}#atividades`} className={estiloBotaoSecundario}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
