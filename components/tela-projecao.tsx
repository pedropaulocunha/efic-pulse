// O desenho do telão, usado em dois lugares:
//  - a página da projeção (tela cheia no projetor);
//  - a prévia do controle do instrutor (caixa pequena).
// As medidas são proporcionais à CAIXA onde ele está (unidades cqw/cqh), e não à
// tela: por isso o mesmo desenho cabe inteiro no projetor e na caixinha.

import { Marca } from "@/components/marca";
import {
  BarrasMultipla,
  HistogramaNumerico,
  LegendaRodadas,
  MuralAbertas,
  NuvemPalavras,
  PontosOrdenar,
  RankingSelecao,
  TemasNuvem,
} from "@/components/resultado-telao";
import type { ConfigEscala, ConfigMultipla, ConfigNumero, ConfigOrdenar, ConfigSelecao } from "@/lib/atividades";
import type { EstadoProjecao, ResultadoAgregado } from "@/utils/projecao";

export type AtividadeTelao = NonNullable<EstadoProjecao["atividade"]>;

// "40 respostas", "1 resposta · rodada 2", "5 no mural".
function textoContagem(resultado: ResultadoAgregado, rodada: number) {
  const base =
    resultado.tipo === "aberta"
      ? `${resultado.aprovadas.length} no mural`
      : resultado.total === 1
        ? "1 resposta"
        : `${resultado.total} respostas`;
  return rodada > 1 ? `${base} · rodada ${rodada}` : base;
}

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
    case "selecao":
      return (
        <RankingSelecao
          config={atividade.config as ConfigSelecao}
          resultado={r}
          anterior={antes?.tipo === "selecao" ? antes : null}
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
      // Temas por IA no lugar das palavras, quando o instrutor escolheu mostrá-los.
      if (atividade.temas) return <TemasNuvem temas={atividade.temas} />;
      return r.palavras.length > 0 ? (
        <NuvemPalavras resultado={r} />
      ) : (
        <p className="my-auto w-full text-center text-[2.4cqw] text-slate-400">Nenhuma palavra ainda.</p>
      );
    case "aberta":
      return <MuralAbertas resultado={r} />;
  }
}

export function TelaProjecao({
  evento,
  atividade,
  endereco,
  semConexao = false,
  mensagemSemResultado,
}: {
  evento: EstadoProjecao["evento"];
  atividade: AtividadeTelao | null;
  endereco: string;
  semConexao?: boolean;
  // Texto no lugar do resultado (padrão: "Responda pelo celular." / "Votação encerrada.").
  mensagemSemResultado?: string;
}) {
  return (
    <div className="relative h-full w-full overflow-hidden bg-white text-slate-900 [container-type:size]">
      <div className="flex h-full w-full flex-col px-[5cqw] py-[5cqh]">
        {atividade ? (
          <div className="flex min-h-0 flex-1 flex-col pb-[10cqh]">
            {/* Pergunta na serifa da logo, em petróleo escuro, com linha embaixo: separa
                a pergunta das respostas. Tamanho pelo menor entre largura e altura. */}
            <h1 className="font-marca-serif text-[min(3cqw,5.2cqh)] font-semibold leading-tight text-[#0f4c64]">
              {atividade.enunciado}
            </h1>
            <div className="mt-[2cqh] h-[2px] w-full bg-slate-300" />

            {/* my-auto centraliza quando cabe e nunca sobe por cima da pergunta quando não cabe. */}
            <div className="mt-[4cqh] flex min-h-0 flex-1 flex-col">
              {atividade.resultado ? (
                // A nuvem ocupa todo o espaço livre (e se ajusta a ele); os outros gráficos centralizam.
                <div
                  className={
                    atividade.resultado.tipo === "nuvem" && !atividade.temas ? "flex min-h-0 w-full flex-1 flex-col" : "my-auto w-full"
                  }
                >
                  {atividade.resultadoRodada1 && (
                    <p className="mb-[3cqh]">
                      <LegendaRodadas rodada={atividade.rodada} />
                    </p>
                  )}
                  <Resultado atividade={atividade} />
                </div>
              ) : (
                <p className="my-auto w-full text-center text-[2.4cqw] text-slate-500">
                  {mensagemSemResultado ??
                    (atividade.estado === "aberta"
                      ? atividade.rodada > 1
                        ? `Rodada ${atividade.rodada}: responda de novo pelo celular.`
                        : "Responda pelo celular."
                      : "Votação encerrada.")}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center pb-[10cqh] text-center">
            {evento.cooperativa && (
              <p className="text-[1.8cqw] uppercase tracking-wide text-slate-500">{evento.cooperativa}</p>
            )}
            <h1 className="mt-[1cqh] text-[4.5cqw] font-semibold leading-tight">{evento.nomeTurma}</h1>
            <p className="mt-[7cqh] text-[2.2cqw] text-slate-500">Entre em {endereco} com o código</p>
            <p className="font-mono text-[11cqw] font-semibold leading-none tracking-[0.12em]">{evento.codigoAcesso}</p>
          </div>
        )}
      </div>

      {/* Rodapé fixo, discreto e na mesma altura: código à esquerda, quantidade de
          respostas no centro (quando há resultado) e logo à direita.
          Na tela de espera o código já está grande no centro, então não se repete. */}
      <div className="absolute inset-x-[4cqw] bottom-[4cqh] grid grid-cols-3 items-center text-[1.2cqw] leading-none">
        <span className="justify-self-start font-mono font-semibold tracking-[0.12em] text-slate-900">
          {atividade ? evento.codigoAcesso : ""}
        </span>
        <span className="justify-self-center whitespace-nowrap text-slate-500">
          {atividade?.resultado ? textoContagem(atividade.resultado, atividade.rodada) : ""}
        </span>
        <Marca className="justify-self-end" />
      </div>

      {semConexao && (
        <p className="absolute right-[4cqw] top-[3cqh] text-[1.2cqw] text-amber-700">Reconectando…</p>
      )}
    </div>
  );
}
