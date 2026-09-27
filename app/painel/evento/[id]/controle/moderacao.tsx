"use client";

import { useState, useTransition } from "react";
import type { Moderacao } from "@/utils/controle";
import { moderarResposta, ocultarPalavra } from "../../acoes-atividades";

// Quadro de moderação do controle: palavras da nuvem e respostas abertas.
// Botões de pelo menos 44 px, para o dedo no tablet.
export default function PainelModeracao({
  eventoId,
  moderacao,
  aoMudar,
}: {
  eventoId: string;
  moderacao: Moderacao;
  aoMudar: () => Promise<void>;
}) {
  const [ocupado, iniciar] = useTransition();
  const [erro, setErro] = useState<string>();

  function executar(acao: () => Promise<{ erro?: string }>) {
    setErro(undefined);
    iniciar(async () => {
      const r = await acao();
      if (r.erro) setErro(r.erro);
      await aoMudar();
    });
  }

  if (moderacao.tipo === "nuvem") {
    const { palavras, ocultas, atividadeId } = moderacao;
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold">Palavras no telão</h2>
        <p className="mt-1 text-sm text-slate-500">
          Toque numa palavra para tirá-la do telão. A resposta não é apagada. Palavras como “de” e “para”, e
          palavrões, já ficam de fora sozinhas.
        </p>
        {erro && <p className="mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-800">{erro}</p>}
        {palavras.length === 0 ? (
          <p className="mt-4 text-slate-500">Nenhuma palavra ainda.</p>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            {palavras.map((p) => (
              <button
                key={p.chave}
                type="button"
                disabled={ocupado}
                onClick={() => executar(() => ocultarPalavra(eventoId, atividadeId, p.chave, true))}
                className="inline-flex h-11 items-center gap-2 rounded-full border border-slate-300 bg-white px-4 text-slate-800 hover:border-red-300 hover:bg-red-50 disabled:opacity-50"
                aria-label={`Ocultar "${p.palavra}" (${p.n})`}
              >
                {p.palavra}
                <span className="text-sm text-slate-400">{p.n}</span>
                <span aria-hidden className="text-slate-400">×</span>
              </button>
            ))}
          </div>
        )}
        {ocultas.length > 0 && (
          <>
            <h3 className="mt-5 text-sm font-medium text-slate-600">Ocultas (toque para voltar ao telão)</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {ocultas.map((chave) => (
                <button
                  key={chave}
                  type="button"
                  disabled={ocupado}
                  onClick={() => executar(() => ocultarPalavra(eventoId, atividadeId, chave, false))}
                  className="inline-flex h-11 items-center rounded-full bg-slate-100 px-4 text-slate-500 line-through hover:bg-slate-200 disabled:opacity-50"
                >
                  {chave}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  const pendentes = moderacao.respostas.filter((r) => r.aprovada === null);
  const aprovadas = moderacao.respostas.filter((r) => r.aprovada === true);
  const recusadas = moderacao.respostas.filter((r) => r.aprovada === false);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="font-semibold">
        Respostas para aprovar
        {pendentes.length > 0 && (
          <span className="ml-2 rounded-full bg-amber-100 px-2.5 py-0.5 text-sm font-normal text-amber-800">
            {pendentes.length}
          </span>
        )}
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        Só as aprovadas aparecem no telão, sempre sem o nome de quem escreveu.
      </p>
      {erro && <p className="mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-800">{erro}</p>}

      {pendentes.length === 0 ? (
        <p className="mt-4 text-slate-500">Nenhuma resposta esperando aprovação.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {pendentes.map((r) => (
            <li key={r.id} className="rounded-xl border border-slate-200 p-4">
              <p className="text-slate-800">{r.texto}</p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => executar(() => moderarResposta(eventoId, r.id, true))}
                  className="h-11 rounded-lg bg-marca px-5 font-medium text-white hover:bg-marca-escura disabled:opacity-50"
                >
                  Aprovar
                </button>
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => executar(() => moderarResposta(eventoId, r.id, false))}
                  className="h-11 rounded-lg border border-slate-300 px-5 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  Recusar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {aprovadas.length > 0 && (
        <>
          <h3 className="mt-6 text-sm font-medium text-slate-600">No mural ({aprovadas.length})</h3>
          <ul className="mt-2 space-y-2">
            {aprovadas.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 p-3">
                <p className="text-slate-700">{r.texto}</p>
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => executar(() => moderarResposta(eventoId, r.id, false))}
                  className="h-11 shrink-0 rounded-lg px-3 text-sm text-slate-500 hover:bg-slate-200 disabled:opacity-50"
                >
                  Tirar do mural
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {recusadas.length > 0 && (
        <>
          <h3 className="mt-6 text-sm font-medium text-slate-600">Recusadas ({recusadas.length})</h3>
          <ul className="mt-2 space-y-2">
            {recusadas.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3 rounded-xl border border-dashed border-slate-200 p-3">
                <p className="text-slate-400">{r.texto}</p>
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => executar(() => moderarResposta(eventoId, r.id, true))}
                  className="h-11 shrink-0 rounded-lg px-3 text-sm text-marca hover:bg-slate-100 disabled:opacity-50"
                >
                  Aprovar
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
