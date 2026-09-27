"use client";

import { useState } from "react";
import { Marca } from "@/components/marca";
import {
  BarrasMultipla,
  HistogramaNumerico,
  LegendaRodadas,
  MuralAbertas,
  NuvemPalavras,
  PontosOrdenar,
} from "@/components/resultado-telao";
import { useEstadoAoVivo } from "@/components/use-estado-ao-vivo";
import type { ConfigEscala, ConfigMultipla, ConfigNumero, ConfigOrdenar } from "@/lib/atividades";
import type { EstadoProjecao, ResultadoAgregado } from "@/utils/projecao";

type AtividadeTelao = NonNullable<EstadoProjecao["atividade"]>;

// O gráfico de cada tipo; a partir da rodada 2, comparado com a rodada 1.
function Resultado({ atividade }: { atividade: AtividadeTelao }) {
  const r = atividade.resultado as ResultadoAgregado;
  const antes = atividade.resultadoRodada1;
  switch (r.tipo) {
    case "multipla":
      return (
        <BarrasMultipla
          config={atividade.config as ConfigMultipla}
          resultado={r}
          anterior={antes?.tipo === "multipla" ? antes : null}
        />
      );
    case "ordenar":
      return (
        <PontosOrdenar
          config={atividade.config as ConfigOrdenar}
          resultado={r}
          anterior={antes?.tipo === "ordenar" ? antes : null}
        />
      );
    case "escala":
    case "numero":
      return (
        <HistogramaNumerico
          tipo={r.tipo}
          config={atividade.config as ConfigEscala | ConfigNumero}
          resultado={r}
          anterior={antes?.tipo === r.tipo ? antes : null}
        />
      );
    case "nuvem":
      return r.palavras.length > 0 ? (
        <NuvemPalavras resultado={r} />
      ) : (
        <p className="w-full text-center text-[2.4vw] text-slate-400">Nenhuma palavra ainda.</p>
      );
    case "aberta":
      return <MuralAbertas resultado={r} />;
  }
}

// Medidas em vw/vh: o telão ocupa a tela inteira em qualquer projetor.
export default function Telao({
  token,
  inicial,
  endereco,
}: {
  token: string;
  inicial: EstadoProjecao;
  endereco: string;
}) {
  const [removida, setRemovida] = useState(false);
  const { dados, semConexao } = useEstadoAoVivo<EstadoProjecao>(
    `/api/projecao/${token}`,
    inicial.evento.id,
    inicial,
    { ouvirRespostas: true, aoNaoEncontrar: () => setRemovida(true) },
  );
  const { evento, atividade } = dados;

  if (removida) {
    return (
      <main className="flex h-screen w-screen flex-col items-center justify-center gap-[4vh] bg-white text-center">
        <p className="text-[2.6vw] text-slate-600">Esta projeção não existe mais.</p>
        <Marca className="text-[2.4vw]" />
      </main>
    );
  }

  return (
    <main className="relative flex h-screen w-screen flex-col overflow-hidden bg-white px-[5vw] py-[5vh] text-slate-900">
      {atividade ? (
        <div className="flex min-h-0 flex-1 flex-col pb-[10vh]">
          <h1 className="text-[3.6vw] font-semibold leading-tight">{atividade.enunciado}</h1>

          {/* my-auto centraliza quando cabe e nunca sobe por cima da pergunta quando não cabe. */}
          <div className="mt-[4vh] flex min-h-0 flex-1 flex-col">
            {atividade.resultado ? (
              <div className="my-auto w-full">
                <p className="mb-[3vh] flex flex-wrap items-center gap-x-[2vw] text-[1.8vw] text-slate-500">
                  <span>
                    {atividade.resultado.tipo === "aberta"
                      ? `${atividade.resultado.aprovadas.length} no mural`
                      : atividade.resultado.total === 1
                        ? "1 resposta"
                        : `${atividade.resultado.total} respostas`}
                    {atividade.rodada > 1 ? ` · rodada ${atividade.rodada}` : ""}
                  </span>
                  {atividade.resultadoRodada1 && <LegendaRodadas rodada={atividade.rodada} />}
                </p>
                <Resultado atividade={atividade} />
              </div>
            ) : (
              <p className="my-auto w-full text-center text-[3vw] text-slate-500">
                {atividade.estado === "aberta"
                  ? atividade.rodada > 1
                    ? `Rodada ${atividade.rodada}: responda de novo pelo celular.`
                    : "Responda pelo celular."
                  : "Votação encerrada."}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center pb-[10vh] text-center">
          {evento.cooperativa && (
            <p className="text-[1.8vw] uppercase tracking-wide text-slate-500">{evento.cooperativa}</p>
          )}
          <h1 className="mt-[1vh] text-[4.5vw] font-semibold leading-tight">{evento.nomeTurma}</h1>
          <p className="mt-[7vh] text-[2.2vw] text-slate-500">Entre em {endereco} com o código</p>
          <p className="font-mono text-[11vw] font-semibold leading-none tracking-[0.12em]">{evento.codigoAcesso}</p>
        </div>
      )}

      {/* Rodapé fixo: código à esquerda, logo à direita, na mesma altura e discretos.
          Na tela de espera o código já está grande no centro, então não se repete. */}
      <div className="absolute inset-x-[4vw] bottom-[4vh] flex items-center justify-between">
        {atividade ? (
          <span className="font-mono text-[1.2vw] font-semibold leading-none tracking-[0.12em] text-slate-900">
            {evento.codigoAcesso}
          </span>
        ) : (
          <span />
        )}
        <Marca className="text-[1.2vw]" />
      </div>

      {semConexao && (
        <p className="absolute right-[4vw] top-[3vh] text-[1.2vw] text-amber-700">Reconectando…</p>
      )}
    </main>
  );
}
