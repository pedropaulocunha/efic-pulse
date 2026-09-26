"use client";

import { useState } from "react";
import { Marca } from "@/components/marca";
import { BarrasMultipla, HistogramaEscala, NuvemPalavras } from "@/components/resultado-telao";
import { useEstadoAoVivo } from "@/components/use-estado-ao-vivo";
import type { ConfigEscala, ConfigMultipla } from "@/lib/atividades";
import type { EstadoProjecao } from "@/utils/projecao";

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
                <p className="mb-[3vh] text-[1.8vw] text-slate-500">
                  {atividade.resultado.total === 1 ? "1 resposta" : `${atividade.resultado.total} respostas`}
                </p>
                {atividade.resultado.tipo === "multipla" && (
                  <BarrasMultipla config={atividade.config as ConfigMultipla} resultado={atividade.resultado} />
                )}
                {atividade.resultado.tipo === "escala" && (
                  <HistogramaEscala config={atividade.config as ConfigEscala} resultado={atividade.resultado} />
                )}
                {atividade.resultado.tipo === "nuvem" &&
                  (atividade.resultado.palavras.length > 0 ? (
                    <NuvemPalavras resultado={atividade.resultado} />
                  ) : (
                    <p className="w-full text-center text-[2.4vw] text-slate-400">Nenhuma palavra ainda.</p>
                  ))}
              </div>
            ) : (
              <p className="my-auto w-full text-center text-[3vw] text-slate-500">
                {atividade.estado === "aberta" ? "Responda pelo celular." : "Votação encerrada."}
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

      {/* Rodapé fixo: endereço e código à esquerda, logo à direita, na mesma altura.
          Na tela de espera o código já está grande no centro, então não se repete. */}
      <div className="absolute inset-x-[4vw] bottom-[4vh] flex items-center justify-between">
        {atividade ? (
          <p className="flex items-center gap-[1.2vw] leading-none">
            <span className="text-[1.4vw] text-slate-500">{endereco}</span>
            <span className="font-mono text-[2.4vw] font-semibold tracking-[0.12em] text-slate-900">
              {evento.codigoAcesso}
            </span>
          </p>
        ) : (
          <span />
        )}
        <Marca className="text-[2.4vw]" />
      </div>

      {semConexao && (
        <p className="absolute right-[4vw] top-[3vh] text-[1.2vw] text-amber-700">Reconectando…</p>
      )}
    </main>
  );
}
