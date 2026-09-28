"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Marca } from "@/components/marca";
import { TelaProjecao } from "@/components/tela-projecao";
import { useEstadoAoVivo } from "@/components/use-estado-ao-vivo";
import {
  formatarNumero,
  rotuloEstadoAtividade,
  rotuloTipo,
  TIPOS_COM_REFERENCIA,
  TIPOS_COM_RODADAS,
  type ConfigAberta,
  type ConfigEscala,
  type ConfigMultipla,
  type ConfigNumero,
  type ConfigNuvem,
  type ConfigOrdenar,
  type ConfigSelecao,
  type EstadoAtividade,
} from "@/lib/atividades";
import type { AtividadeControle, EstadoControle } from "@/utils/controle";
import { comandarAtividade, type Comando } from "../../acoes-atividades";
import PainelModeracao from "./moderacao";
import PainelTemas from "./temas";

const corEstado: Record<EstadoAtividade, string> = {
  fechada: "bg-slate-100 text-slate-600",
  aberta: "bg-emerald-100 text-emerald-800",
  encerrada: "bg-sky-100 text-sky-800",
};

function resumo(a: AtividadeControle) {
  switch (a.tipo) {
    case "multipla":
      return (a.config as ConfigMultipla).opcoes.join(" · ");
    case "selecao": {
      const c = a.config as ConfigSelecao;
      const marca = c.min_escolhas === c.max_escolhas ? `${c.min_escolhas}` : `${c.min_escolhas} a ${c.max_escolhas}`;
      return `Marcar ${marca} · ${c.opcoes.join(" · ")}`;
    }
    case "ordenar":
      return (a.config as ConfigOrdenar).itens.join(" · ");
    case "escala": {
      const c = a.config as ConfigEscala;
      return `De ${formatarNumero(c.min, c.unidade)} a ${formatarNumero(c.max, c.unidade)}, passo ${c.passo}`;
    }
    case "numero": {
      const c = a.config as ConfigNumero;
      return c.unidade ? `Número em ${c.unidade}` : "Número digitado pela pessoa";
    }
    case "nuvem": {
      const n = (a.config as ConfigNuvem).max_palavras;
      return n === 1 ? "1 palavra por pessoa" : `Até ${n} palavras por pessoa`;
    }
    case "aberta":
      return `Texto de até ${(a.config as ConfigAberta).max_caracteres} caracteres; aprove no quadro abaixo`;
  }
}

export default function Controle({ inicial }: { inicial: EstadoControle }) {
  const router = useRouter();
  const eventoId = inicial.evento.id;

  const [selecionadaId, setSelecionadaId] = useState<string | null>(
    inicial.evento.atividadeAtualId ?? inicial.atividades[0]?.id ?? null,
  );

  // A atividade selecionada vem com a prévia do telão e a moderação (nuvem e abertas).
  const { dados, semConexao, recarregar } = useEstadoAoVivo<EstadoControle>(
    `/api/painel/evento/${eventoId}/controle${selecionadaId ? `?selecionada=${selecionadaId}` : ""}`,
    eventoId,
    inicial,
    { ouvirRespostas: true, aoPerderSessao: () => router.replace("/login") },
  );
  const { evento, atividades, blocos, participantes, moderacao, previa, temas, iaConfigurada } = dados;

  const selecionada = atividades.find((a) => a.id === selecionadaId) ?? atividades[0] ?? null;
  const aberta = atividades.find((a) => a.estado === "aberta") ?? null;

  const [ocupado, iniciar] = useTransition();
  const [erro, setErro] = useState<string>();

  function comandar(comando: Comando) {
    if (!selecionada) return;
    setErro(undefined);
    iniciar(async () => {
      const r = await comandarAtividade(eventoId, selecionada.id, comando);
      if (r.erro) setErro(r.erro);
      await recarregar();
    });
  }

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="flex h-16 items-center gap-4 px-5">
          <Link href={`/painel/evento/${eventoId}`} className="text-slate-500 hover:underline">
            ← Evento
          </Link>
          <Marca className="text-xl" />
          <p className="min-w-0 flex-1 truncate font-medium">{evento.nomeTurma}</p>
          {semConexao && <span className="text-sm text-amber-700">Reconectando…</span>}
          <span className="rounded-lg bg-slate-100 px-3 py-1 font-mono text-lg tracking-widest">{evento.codigoAcesso}</span>
        </div>
      </header>

      {atividades.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="text-lg text-slate-600">Este evento ainda não tem atividades.</p>
          <Link href={`/painel/evento/${eventoId}/atividade/nova`} className="font-medium text-marca hover:underline">
            Criar a primeira atividade
          </Link>
        </div>
      ) : (
        <div className="grid flex-1 gap-5 p-5 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          {/* Lista das atividades, na ordem, com o título de cada bloco */}
          <ol className="space-y-2">
            {atividades.map((a, i) => {
              const ativa = selecionada?.id === a.id;
              const noTelao = evento.atividadeAtualId === a.id && (a.estado === "aberta" || a.resultado_visivel);
              const comecaBloco = blocos.length > 0 && (i === 0 || a.bloco_id !== atividades[i - 1].bloco_id);
              const tituloBloco = blocos.find((b) => b.id === a.bloco_id)?.titulo ?? "Sem bloco";
              return (
                <li key={a.id}>
                  {comecaBloco && (
                    <p className={`mb-2 px-1 text-sm font-semibold uppercase tracking-wide text-marca ${i > 0 ? "mt-5" : ""}`}>
                      {tituloBloco}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setSelecionadaId(a.id);
                      setErro(undefined);
                    }}
                    className={`w-full rounded-xl border-2 px-4 py-3 text-left ${
                      ativa ? "border-marca bg-white shadow-sm" : "border-transparent bg-white hover:border-slate-200"
                    }`}
                  >
                    <p className="font-medium leading-snug">
                      <span className="mr-2 text-slate-400">{i + 1}.</span>
                      {a.enunciado}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                      <span className={`rounded-full px-2.5 py-0.5 ${corEstado[a.estado]}`}>
                        {rotuloEstadoAtividade[a.estado]}
                      </span>
                      {noTelao && <span className="rounded-full bg-marca px-2.5 py-0.5 text-white">No telão</span>}
                      {a.estado !== "fechada" && <span className="text-slate-500">{a.respostas} respostas</span>}
                    </div>
                  </button>
                </li>
              );
            })}
          </ol>

          {/* Atividade selecionada */}
          {selecionada && (
            <section className="flex flex-col gap-5">
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                  <span>{rotuloTipo[selecionada.tipo]}</span>
                  <span className={`rounded-full px-2.5 py-0.5 ${corEstado[selecionada.estado]}`}>
                    {rotuloEstadoAtividade[selecionada.estado]}
                  </span>
                  {selecionada.rodada_atual > 1 && (
                    <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-violet-800">
                      Rodada {selecionada.rodada_atual}
                    </span>
                  )}
                </div>
                <h1 className="mt-2 text-2xl font-semibold leading-snug">{selecionada.enunciado}</h1>
                {selecionada.observacao && (
                  <p className="mt-1 text-slate-600">Observação: {selecionada.observacao}</p>
                )}
                <p className="mt-1 text-slate-500">{resumo(selecionada)}</p>

                <p className="mt-5 text-4xl font-semibold tabular-nums">
                  {selecionada.respostas}
                  <span className="ml-2 text-lg font-normal text-slate-500">
                    {selecionada.respostas === 1 ? "resposta" : "respostas"} de {participantes} na sala
                    {selecionada.rodada_atual > 1 ? ` nesta rodada` : ""}
                  </span>
                </p>

                <BotoesComando
                  atividade={selecionada}
                  noTelao={evento.atividadeAtualId === selecionada.id}
                  outraAberta={Boolean(aberta && aberta.id !== selecionada.id)}
                  ocupado={ocupado}
                  aoComandar={comandar}
                />
                {erro && <p className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-red-800">{erro}</p>}
              </div>

              {moderacao && moderacao.atividadeId === selecionada.id && (
                <PainelModeracao eventoId={eventoId} moderacao={moderacao} aoMudar={recarregar} />
              )}

              {selecionada.tipo === "nuvem" && selecionada.estado !== "fechada" && (
                <PainelTemas
                  eventoId={eventoId}
                  atividadeId={selecionada.id}
                  temas={temas && temas.atividadeId === selecionada.id ? temas : null}
                  iaConfigurada={iaConfigurada}
                  resultadoVisivel={selecionada.resultado_visivel}
                  aoMudar={recarregar}
                />
              )}

              {previa && previa.id === selecionada.id && (
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="mb-2 flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium text-slate-700">Prévia: só você vê</span>
                    <Link
                      href={`/projecao/${evento.projecaoToken}`}
                      target="_blank"
                      className="shrink-0 text-slate-500 hover:underline"
                    >
                      Abrir projeção ↗
                    </Link>
                  </div>
                  <div className="aspect-video w-full overflow-hidden rounded-lg border-2 border-dashed border-slate-300">
                    <TelaProjecao
                      evento={evento}
                      atividade={previa}
                      endereco=""
                      mensagemSemResultado={
                        selecionada.estado === "fechada"
                          ? "Ainda não aberta: o resultado aparece aqui quando as respostas chegarem."
                          : undefined
                      }
                    />
                  </div>
                  <p className="mt-2 text-sm text-slate-500">{legendaPrevia(selecionada, evento.atividadeAtualId)}</p>
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

// Botões de pelo menos 44 px, pensados para o dedo no tablet.
function BotoesComando({
  atividade,
  noTelao,
  outraAberta,
  ocupado,
  aoComandar,
}: {
  atividade: AtividadeControle;
  noTelao: boolean;
  outraAberta: boolean;
  ocupado: boolean;
  aoComandar: (c: Comando) => void;
}) {
  const estilo = "h-14 rounded-xl px-5 text-lg font-semibold disabled:opacity-40";
  const principal = `${estilo} bg-marca text-white hover:bg-marca-escura`;
  const secundario = `${estilo} border-2 border-slate-300 bg-white text-slate-800 hover:bg-slate-50`;

  const temReferencia =
    TIPOS_COM_REFERENCIA.includes(atividade.tipo) &&
    typeof (atividade.config as ConfigEscala | ConfigNumero).referencia === "number";
  const temRodadas = TIPOS_COM_RODADAS.includes(atividade.tipo) && atividade.estado !== "fechada";
  const resultadoNoTelao = noTelao && atividade.resultado_visivel;
  const referenciaNoTelao = noTelao && atividade.referencia_revelada;

  function novaRodada() {
    const confirmar = window.confirm(
      `Começar a rodada ${atividade.rodada_atual + 1}?\n\nA pergunta abre de novo nos celulares, do zero. As respostas da rodada ${atividade.rodada_atual} ficam guardadas, e o telão compara a rodada 1 com a nova quando você mostrar o resultado.`,
    );
    if (confirmar) aoComandar("nova_rodada");
  }

  return (
    <div className="mt-6 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {atividade.estado === "aberta" ? (
          <button type="button" disabled={ocupado} onClick={() => aoComandar("encerrar")} className={principal}>
            Encerrar
          </button>
        ) : (
          <button type="button" disabled={ocupado} onClick={() => aoComandar("abrir")} className={principal}>
            {atividade.estado === "encerrada" ? "Reabrir" : "Abrir"}
          </button>
        )}
        <button
          type="button"
          disabled={ocupado || atividade.estado === "fechada" || (outraAberta && !resultadoNoTelao)}
          onClick={() => aoComandar(resultadoNoTelao ? "esconder_resultado" : "mostrar_resultado")}
          className={secundario}
        >
          {resultadoNoTelao ? "Esconder resultado" : "Mostrar resultado"}
        </button>
        {temReferencia && (
          <button
            type="button"
            disabled={ocupado || (outraAberta && !referenciaNoTelao)}
            onClick={() => aoComandar(referenciaNoTelao ? "esconder_referencia" : "revelar_referencia")}
            className={`${secundario} sm:col-span-2`}
          >
            {referenciaNoTelao ? "Esconder referência" : "Revelar referência"}
          </button>
        )}
        {temRodadas && (
          <button type="button" disabled={ocupado} onClick={novaRodada} className={`${secundario} sm:col-span-2`}>
            Nova rodada ({atividade.rodada_atual + 1}ª)
          </button>
        )}
      </div>
      {outraAberta && (
        <p className="text-sm text-slate-500">
          Outra atividade está aberta. Abrir esta encerra a outra; para mostrar resultado, encerre a outra antes.
        </p>
      )}
      {atividade.estado === "fechada" && (
        <p className="text-sm text-slate-500">Abra a atividade para os celulares receberem a pergunta.</p>
      )}
    </div>
  );
}

// Diz se a prévia (que sempre mostra o resultado) é o que a turma está vendo.
function legendaPrevia(a: AtividadeControle, atividadeAtualId: string | null) {
  const noTelao = atividadeAtualId === a.id && (a.estado === "aberta" || a.resultado_visivel);
  if (!noTelao) return "Esta atividade não está no telão.";
  if (a.resultado_visivel) return "No telão agora, igual a esta prévia.";
  return "No telão agora só a pergunta; o resultado aparece quando você tocar em Mostrar resultado.";
}
