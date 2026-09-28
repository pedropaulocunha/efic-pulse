"use client";

import { useState, useTransition } from "react";
import type { TemasControle } from "@/utils/controle";
import { gerarTemas, mostrarTemasNoTelao, moverPalavraTema, renomearTema } from "../../acoes-atividades";

// Quadro "Temas por IA" da nuvem (docs/ia-temas-nuvem.md). A IA sugere os temas;
// o instrutor revisa (renomeia, move palavras) e decide se vão ao telão.
// Botões de pelo menos 44 px, para o dedo no tablet.
export default function PainelTemas({
  eventoId,
  atividadeId,
  temas,
  iaConfigurada,
  resultadoVisivel,
  aoMudar,
}: {
  eventoId: string;
  atividadeId: string;
  temas: TemasControle | null;
  iaConfigurada: boolean;
  resultadoVisivel: boolean;
  aoMudar: () => Promise<void>;
}) {
  const [ocupado, iniciar] = useTransition();
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string>();
  const [palavraEscolhida, setPalavraEscolhida] = useState<string | null>(null);
  const [renomeando, setRenomeando] = useState<number | null>(null);
  const [novoTitulo, setNovoTitulo] = useState("");

  function executar(acao: () => Promise<{ erro?: string }>) {
    setErro(undefined);
    iniciar(async () => {
      const r = await acao();
      if (r.erro) setErro(r.erro);
      await aoMudar();
    });
  }

  function gerar() {
    if (temas && !window.confirm("Gerar os temas de novo? Os ajustes feitos à mão serão perdidos.")) return;
    setGerando(true);
    setPalavraEscolhida(null);
    executar(async () => {
      const r = await gerarTemas(eventoId, atividadeId);
      setGerando(false);
      return r;
    });
  }

  const estiloBotao =
    "inline-flex h-11 items-center justify-center rounded-lg border-2 border-slate-300 bg-white px-4 font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-40";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">
          Temas por IA{" "}
          <span className="ml-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800">beta</span>
        </h2>
        {iaConfigurada && (
          <button type="button" disabled={ocupado} onClick={gerar} className={estiloBotao}>
            {gerando ? "Resumindo… (até 30 s)" : temas ? "Gerar de novo" : "Resumir com IA"}
          </button>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-500">
        A IA junta as palavras parecidas em temas; o Pulse conta quantas pessoas caíram em cada um. Revise antes de
        mostrar no telão.
      </p>

      {!iaConfigurada && (
        <p className="mt-3 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-900">
          A IA ainda não está configurada: falta a chave <strong>OPENAI_API_KEY</strong> nas variáveis da Vercel.
        </p>
      )}
      {erro && <p className="mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-800">{erro}</p>}

      {temas?.resultado && (
        <>
          {temas.novas > 0 && (
            <p className="mt-3 rounded-lg bg-slate-50 px-4 py-2 text-sm text-slate-600">
              {temas.novas === 1 ? "1 palavra chegou" : `${temas.novas} palavras chegaram`} depois do resumo e{" "}
              {temas.novas === 1 ? "está" : "estão"} em Outros. Gere de novo para incluí-las.
            </p>
          )}
          <p className="mt-3 text-sm text-slate-500">
            {palavraEscolhida
              ? "Agora toque em “Mover para cá” no tema certo (ou toque de novo na palavra para cancelar)."
              : "Para trocar uma palavra de tema, toque nela."}
          </p>

          <ul className="mt-3 space-y-3">
            {temas.resultado.temas.map((t) => {
              const destino = t.indice === 0 ? -1 : t.indice - 1;
              const pct = temas.resultado!.total ? Math.round((t.pessoas / temas.resultado!.total) * 100) : 0;
              const jaAqui = palavraEscolhida !== null && t.palavras.some((w) => w.chave === palavraEscolhida);
              return (
                <li key={t.indice} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {renomeando === t.indice ? (
                      <form
                        className="flex flex-1 flex-wrap gap-2"
                        onSubmit={(ev) => {
                          ev.preventDefault();
                          setRenomeando(null);
                          executar(() => renomearTema(eventoId, atividadeId, temas.rodada, t.indice - 1, novoTitulo));
                        }}
                      >
                        <input
                          value={novoTitulo}
                          onChange={(ev) => setNovoTitulo(ev.target.value)}
                          maxLength={60}
                          autoFocus
                          aria-label="Nome do tema"
                          className="h-11 min-w-48 flex-1 rounded-lg border border-slate-300 px-3"
                        />
                        <button type="submit" className={estiloBotao}>
                          Salvar
                        </button>
                        <button type="button" onClick={() => setRenomeando(null)} className="h-11 px-2 text-slate-500">
                          Cancelar
                        </button>
                      </form>
                    ) : (
                      <>
                        <p className="mr-auto font-medium">
                          {t.titulo}{" "}
                          <span className="text-sm font-normal text-slate-500">
                            {pct}% · {t.pessoas} {t.pessoas === 1 ? "pessoa" : "pessoas"}
                          </span>
                        </p>
                        {t.indice !== 0 && (
                          <button
                            type="button"
                            disabled={ocupado}
                            onClick={() => {
                              setRenomeando(t.indice);
                              setNovoTitulo(t.titulo);
                            }}
                            className="h-11 px-2 text-sm text-slate-500 hover:underline"
                          >
                            Renomear
                          </button>
                        )}
                        {palavraEscolhida && !jaAqui && (
                          <button
                            type="button"
                            disabled={ocupado}
                            onClick={() => {
                              const chave = palavraEscolhida;
                              setPalavraEscolhida(null);
                              executar(() => moverPalavraTema(eventoId, atividadeId, temas.rodada, chave, destino));
                            }}
                            className="inline-flex h-11 items-center rounded-lg bg-marca px-4 font-medium text-white disabled:opacity-40"
                          >
                            Mover para cá
                          </button>
                        )}
                      </>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {t.palavras.map((w) => (
                      <button
                        key={w.chave}
                        type="button"
                        disabled={ocupado}
                        onClick={() => setPalavraEscolhida((atual) => (atual === w.chave ? null : w.chave))}
                        aria-pressed={palavraEscolhida === w.chave}
                        className={`inline-flex h-11 items-center gap-2 rounded-full border px-4 disabled:opacity-50 ${
                          palavraEscolhida === w.chave
                            ? "border-marca bg-marca text-white"
                            : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                        }`}
                      >
                        {w.palavra}
                        <span className={palavraEscolhida === w.chave ? "text-sm text-white/80" : "text-sm text-slate-400"}>
                          {w.n}
                        </span>
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={ocupado}
              onClick={() => executar(() => mostrarTemasNoTelao(eventoId, atividadeId, temas.rodada, !temas.noTelao))}
              className={
                temas.noTelao
                  ? estiloBotao
                  : "inline-flex h-11 items-center rounded-lg bg-marca px-4 font-medium text-white disabled:opacity-40"
              }
            >
              {temas.noTelao ? "Voltar para a nuvem no telão" : "Mostrar temas no telão"}
            </button>
            {temas.noTelao && !resultadoVisivel && (
              <span className="text-sm text-slate-500">Aparece no telão quando você mostrar o resultado.</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
