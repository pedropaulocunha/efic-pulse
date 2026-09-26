"use client";

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
  const { dados, semConexao } = useEstadoAoVivo<EstadoProjecao>(
    `/api/projecao/${token}`,
    inicial.evento.id,
    inicial,
    { ouvirRespostas: true },
  );
  const { evento, atividade } = dados;

  return (
    <main className="relative flex h-screen w-screen flex-col overflow-hidden bg-white px-[5vw] py-[5vh] text-slate-900">
      {atividade ? (
        <div className="flex min-h-0 flex-1 flex-col pb-[14vh]">
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

      {/* Canto fixo: wordmark, endereço e código de acesso. */}
      <div className="absolute bottom-[4vh] right-[4vw] flex items-end gap-[2.5vw]">
        <div className="text-right">
          <Marca className="text-[2vw]" />
          <p className="text-[1.4vw] text-slate-500">{endereco}</p>
        </div>
        <p className="font-mono text-[4.5vw] font-semibold leading-none tracking-[0.1em]">{evento.codigoAcesso}</p>
      </div>

      {semConexao && (
        <p className="absolute left-[4vw] bottom-[4vh] text-[1.2vw] text-amber-700">Reconectando…</p>
      )}
    </main>
  );
}
