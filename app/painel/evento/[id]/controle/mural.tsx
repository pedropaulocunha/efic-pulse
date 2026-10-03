"use client";

import { useState, useTransition } from "react";
import { filtrarMural, totalDePaginas } from "@/lib/mural";
import type { ResumoAbertasControle } from "@/utils/controle";
import {
  definirFiltroMural,
  gerarResumoAbertas,
  mostrarResumoAbertasNoTelao,
  paginarMural,
  renomearTemaAbertas,
} from "../../acoes-atividades";

// Controles do mural das respostas de texto livre (docs/mural-abertas.md).
// Botões de pelo menos 44 px, para o dedo no tablet.

const estiloBotao =
  "inline-flex h-11 items-center justify-center rounded-lg border-2 border-slate-300 bg-white px-4 font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-40";
const estiloPrincipal =
  "inline-flex h-11 items-center justify-center rounded-lg bg-marca px-4 font-medium text-white hover:bg-marca-escura disabled:opacity-40";

function useExecutar(aoMudar: () => Promise<void>) {
  const [ocupado, iniciar] = useTransition();
  const [erro, setErro] = useState<string>();
  const executar = (acao: () => Promise<{ erro?: string }>) => {
    setErro(undefined);
    iniciar(async () => {
      const r = await acao();
      if (r.erro) setErro(r.erro);
      await aoMudar();
    });
  };
  return { ocupado, erro, executar };
}

// Filtro por palavra e páginas do mural no telão.
export function PainelMural({
  eventoId,
  atividadeId,
  textosNoMural,
  filtro,
  pagina,
  automatico,
  aoMudar,
}: {
  eventoId: string;
  atividadeId: string;
  textosNoMural: string[];
  filtro: string | null;
  pagina: number;
  automatico: boolean;
  aoMudar: () => Promise<void>;
}) {
  const { ocupado, erro, executar } = useExecutar(aoMudar);
  const [busca, setBusca] = useState(filtro ?? "");
  const filtrados = filtrarMural(textosNoMural, filtro);
  const paginas = totalDePaginas(filtrados.length);
  const atual = Math.min(pagina, paginas);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="font-semibold">Mural no telão</h2>
      <p className="mt-1 text-sm text-slate-500">
        6 respostas por página. No automático, o telão troca de página a cada 15 segundos; ao tocar em Anterior ou
        Próxima, a página fica com você.
      </p>
      {erro && <p className="mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-800">{erro}</p>}

      <form
        className="mt-4 flex flex-wrap gap-2"
        onSubmit={(ev) => {
          ev.preventDefault();
          executar(() => definirFiltroMural(eventoId, atividadeId, busca));
        }}
      >
        <input
          value={busca}
          onChange={(ev) => setBusca(ev.target.value)}
          maxLength={60}
          placeholder="Filtrar por palavra (ex.: prazo)"
          aria-label="Filtrar o mural por palavra"
          className="h-11 min-w-56 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-marca focus:ring-2 focus:ring-marca/20"
        />
        <button type="submit" disabled={ocupado || !busca.trim()} className={estiloPrincipal}>
          Filtrar
        </button>
        {filtro && (
          <button
            type="button"
            disabled={ocupado}
            onClick={() => {
              setBusca("");
              executar(() => definirFiltroMural(eventoId, atividadeId, ""));
            }}
            className={estiloBotao}
          >
            Limpar filtro
          </button>
        )}
      </form>
      {filtro && (
        <p className="mt-2 text-sm text-slate-600">
          No telão, só as respostas com “{filtro}”: {filtrados.length} de {textosNoMural.length}.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={ocupado || (!automatico && atual <= 1)}
          onClick={() => executar(() => paginarMural(eventoId, atividadeId, automatico ? 1 : atual - 1))}
          className={estiloBotao}
        >
          ◀ Anterior
        </button>
        <span className="min-w-36 text-center text-sm text-slate-600">
          {automatico
            ? `Automático · ${paginas} ${paginas === 1 ? "página" : "páginas"}`
            : `Página ${atual} de ${paginas}`}
        </span>
        <button
          type="button"
          disabled={ocupado || (!automatico && atual >= paginas)}
          onClick={() => executar(() => paginarMural(eventoId, atividadeId, automatico ? Math.min(2, paginas) : atual + 1))}
          className={estiloBotao}
        >
          Próxima ▶
        </button>
        {!automatico && (
          <button
            type="button"
            disabled={ocupado}
            onClick={() => executar(() => paginarMural(eventoId, atividadeId, null))}
            className="h-11 px-3 text-sm font-medium text-marca hover:underline disabled:opacity-40"
          >
            Voltar ao automático
          </button>
        )}
      </div>
    </div>
  );
}

// Resumo por IA das respostas no mural: síntese + temas. Revisar antes do telão.
export function PainelResumoAbertas({
  eventoId,
  atividadeId,
  resumo,
  iaConfigurada,
  resultadoVisivel,
  aoMudar,
}: {
  eventoId: string;
  atividadeId: string;
  resumo: ResumoAbertasControle | null;
  iaConfigurada: boolean;
  resultadoVisivel: boolean;
  aoMudar: () => Promise<void>;
}) {
  const { ocupado, erro, executar } = useExecutar(aoMudar);
  const [gerando, setGerando] = useState(false);
  const [renomeando, setRenomeando] = useState<number | null>(null);
  const [novoTitulo, setNovoTitulo] = useState("");

  function gerar() {
    if (resumo && !window.confirm("Gerar o resumo de novo? Os nomes de tema que você mudou serão perdidos.")) return;
    setGerando(true);
    executar(async () => {
      const r = await gerarResumoAbertas(eventoId, atividadeId);
      setGerando(false);
      return r;
    });
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">
          Resumo por IA{" "}
          <span className="ml-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800">beta</span>
        </h2>
        {iaConfigurada && (
          <button type="button" disabled={ocupado} onClick={gerar} className={estiloBotao}>
            {gerando ? "Resumindo… (até 1 min)" : resumo ? "Gerar de novo" : "Resumir com IA"}
          </button>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-500">
        A IA escreve uma síntese e agrupa as respostas do mural em temas; o Pulse conta as pessoas de cada tema. O
        filtro não muda o resumo. Revise antes de mostrar no telão.
      </p>
      {!iaConfigurada && (
        <p className="mt-3 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-900">
          A IA ainda não está configurada: falta a chave <strong>OPENAI_API_KEY</strong> nas variáveis da Vercel.
        </p>
      )}
      {erro && <p className="mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-800">{erro}</p>}

      {resumo && (
        <>
          <p className="mt-4 border-l-4 border-marca pl-3 text-slate-700">{resumo.resultado.sintese}</p>
          <ul className="mt-4 space-y-2">
            {resumo.resultado.temas.map((t) => {
              const pct = resumo.resultado.total ? Math.round((t.pessoas / resumo.resultado.total) * 100) : 0;
              return (
                <li key={t.indice} className="rounded-xl border border-slate-200 p-3">
                  {renomeando === t.indice ? (
                    <form
                      className="flex flex-wrap gap-2"
                      onSubmit={(ev) => {
                        ev.preventDefault();
                        setRenomeando(null);
                        executar(() =>
                          renomearTemaAbertas(eventoId, atividadeId, resumo.rodada, t.indice - 1, novoTitulo),
                        );
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
                    <div className="flex flex-wrap items-center gap-2">
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
                    </div>
                  )}
                  {t.exemplo && <p className="mt-1 text-sm italic text-slate-500">“{t.exemplo}”</p>}
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={ocupado}
              onClick={() =>
                executar(() => mostrarResumoAbertasNoTelao(eventoId, atividadeId, resumo.rodada, !resumo.noTelao))
              }
              className={resumo.noTelao ? estiloBotao : estiloPrincipal}
            >
              {resumo.noTelao ? "Voltar para o mural no telão" : "Mostrar resumo no telão"}
            </button>
            {resumo.noTelao && !resultadoVisivel && (
              <span className="text-sm text-slate-500">Aparece no telão quando você mostrar o resultado.</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
