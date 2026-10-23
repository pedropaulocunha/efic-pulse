"use client";

import { useMemo, useState, useTransition } from "react";
import { estiloBotaoCompacto, estiloBotaoSecundario, estiloCampo } from "@/components/ui";
import { pct, somarGrupo, type ContagemEvento, type EventoConsolidado } from "@/lib/consolidado";
import { formatarData } from "@/lib/formatos";
import { classificarNovasNoConsolidado, gerarConsolidado, renomearTemaConsolidado } from "../../../../acoes";

type Consolidado = {
  temas: string[];
  sintese: string | null;
  de: string | null;
  ate: string | null;
  geradoEm: string;
  exemplos: string[][];
  novos: number;
  contagens: Record<string, ContagemEvento>;
};

// Diferença, em pontos percentuais, a partir da qual a linha ganha destaque.
const DESTAQUE_PP = 10;

export default function PainelConsolidado({
  modeloId,
  perguntaId,
  tipo,
  eventos,
  consolidado,
  iaConfigurada,
}: {
  modeloId: string;
  perguntaId: string;
  tipo: string;
  eventos: EventoConsolidado[];
  consolidado: Consolidado | null;
  iaConfigurada: boolean;
}) {
  const [ocupado, iniciar] = useTransition();
  const [mensagem, setMensagem] = useState<string>();
  const [de, setDe] = useState(consolidado?.de ?? "");
  const [ate, setAte] = useState(consolidado?.ate ?? "");
  const [grupoA, setGrupoA] = useState<string[]>([]);

  const gerar = () => {
    if (consolidado && !confirm("Gerar de novo troca os temas atuais (e os nomes que você ajustou). Continuar?")) return;
    iniciar(async () => {
      setMensagem(undefined);
      const r = await gerarConsolidado(modeloId, perguntaId, de, ate);
      setMensagem(r.erro ?? "Consolidado gerado.");
    });
  };

  return (
    <>
      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-medium text-slate-800">Período</h2>
        <p className="mt-1 text-sm text-slate-600">
          Pela data de início do evento. Em branco, vale todo o histórico. Mudar o período pede gerar o consolidado de
          novo.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-sm text-slate-700">
            De
            <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className={`${estiloCampo} mt-1 block`} />
          </label>
          <label className="text-sm text-slate-700">
            Até
            <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className={`${estiloCampo} mt-1 block`} />
          </label>
          <button type="button" disabled={ocupado || !iaConfigurada} onClick={gerar} className={estiloBotaoCompacto}>
            {ocupado ? "A IA está lendo as respostas…" : consolidado ? "Gerar de novo com IA" : "Gerar consolidado com IA"}
          </button>
        </div>
        {!iaConfigurada && (
          <p className="mt-3 text-sm text-amber-800">IA ainda não está configurada: falta a chave OPENAI_API_KEY na Vercel.</p>
        )}
        {ocupado && <p className="mt-3 text-sm text-slate-500">Com muitas respostas, pode levar até alguns minutos.</p>}
        {mensagem && <p className="mt-3 text-sm text-slate-700">{mensagem}</p>}
      </section>

      {consolidado ? (
        <Resultado
          modeloId={modeloId}
          perguntaId={perguntaId}
          tipo={tipo}
          eventos={eventos}
          c={consolidado}
          grupoA={grupoA}
          setGrupoA={setGrupoA}
          iaConfigurada={iaConfigurada}
        />
      ) : (
        <p className="mt-8 text-slate-600">
          Ainda não há consolidado desta pergunta. Escolha o período (ou deixe em branco) e peça à IA para gerar.
        </p>
      )}
    </>
  );
}

function Resultado({
  modeloId,
  perguntaId,
  tipo,
  eventos,
  c,
  grupoA,
  setGrupoA,
  iaConfigurada,
}: {
  modeloId: string;
  perguntaId: string;
  tipo: string;
  eventos: EventoConsolidado[];
  c: Consolidado;
  grupoA: string[];
  setGrupoA: (ids: string[]) => void;
  iaConfigurada: boolean;
}) {
  const [ocupado, iniciar] = useTransition();
  const [mensagem, setMensagem] = useState<string>();
  const n = c.temas.length;
  const porEvento = useMemo(() => new Map(Object.entries(c.contagens)), [c.contagens]);
  const comResposta = eventos.filter((e) => (porEvento.get(e.id)?.total ?? 0) > 0);
  const comparando = grupoA.length > 0;
  const idsB = comResposta.map((e) => e.id).filter((id) => !grupoA.includes(id));
  const A = somarGrupo(porEvento, comparando ? grupoA : comResposta.map((e) => e.id), n);
  const B = somarGrupo(porEvento, idsB, n);

  // Temas na ordem da IA; Outros (0) por último; "Sem tema" só se houver respostas novas.
  // Ordenação pelo clique no título da coluna: maior primeiro, menor primeiro, ordem da IA. Outros fica sempre no fim.
  const [ordem, setOrdem] = useState<{ coluna: "A" | "B"; desc: boolean } | null>(null);
  const coluna = ordem && (ordem.coluna === "A" || comparando) ? ordem : null;
  const temas = c.temas.map((t, i) => ({ numero: i + 1, titulo: t }));
  if (coluna) {
    const g = coluna.coluna === "A" ? A : B;
    temas.sort((x, y) => (pct(g.porTema[y.numero], g.total) - pct(g.porTema[x.numero], g.total)) * (coluna.desc ? 1 : -1));
  }
  const linhas = [...temas, { numero: 0, titulo: "Outros" }];
  const ordenarPor = (col: "A" | "B") =>
    setOrdem(coluna?.coluna !== col ? { coluna: col, desc: true } : coluna.desc ? { coluna: col, desc: false } : null);
  const tituloColuna = (col: "A" | "B", texto: string) => (
    <button type="button" onClick={() => ordenarPor(col)} className="font-medium hover:text-slate-900" title="Ordenar">
      {texto} {coluna?.coluna === col ? (coluna.desc ? "↓" : "↑") : <span className="text-slate-300">↕</span>}
    </button>
  );

  const alternar = (id: string) => setGrupoA(grupoA.includes(id) ? grupoA.filter((x) => x !== id) : [...grupoA, id]);

  return (
    <>
      {c.sintese && (
        <section className="mt-8">
          <h2 className="text-lg font-medium text-slate-800">Síntese</h2>
          <p className="mt-2 leading-relaxed text-slate-700">{c.sintese}</p>
          <p className="mt-2 text-xs text-slate-500">
            Gerado em {new Date(c.geradoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
            {c.de || c.ate ? ` · período ${c.de ? formatarData(c.de) : "início"} a ${c.ate ? formatarData(c.ate) : "hoje"}` : " · todo o histórico"}
          </p>
        </section>
      )}

      {c.novos > 0 && (
        <section className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <span className="text-slate-700">
            {c.novos === 1 ? "1 resposta nova" : `${c.novos} ${tipo === "aberta" ? "respostas novas" : "palavras novas"}`} desde o
            consolidado, ainda sem tema.
          </span>
          <button
            type="button"
            disabled={ocupado || !iaConfigurada}
            onClick={() =>
              iniciar(async () => {
                const r = await classificarNovasNoConsolidado(modeloId, perguntaId);
                setMensagem(r.erro ?? "Classificadas nos temas atuais.");
              })
            }
            className={estiloBotaoCompacto}
          >
            {ocupado ? "Classificando…" : "Classificar novas"}
          </button>
          {mensagem && <span className="text-sm text-slate-700">{mensagem}</span>}
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-medium text-slate-800">Comparar</h2>
        <p className="mt-1 text-sm text-slate-600">
          Marque um ou mais eventos (selecionados). Eles são comparados com todos os outros eventos do período. Sem nada
          marcado, a tabela mostra o geral.
        </p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {comResposta.map((e) => (
            <li key={e.id}>
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50">
                <input type="checkbox" checked={grupoA.includes(e.id)} onChange={() => alternar(e.id)} className="mt-0.5" />
                <span>
                  <strong className="text-slate-800">{e.nome_turma}</strong>
                  <span className="block text-slate-500">
                    {e.cooperativa ?? "Sem cooperativa"}
                    {e.uf ? `/${e.uf}` : ""} · {formatarData(e.data_inicio)} · {porEvento.get(e.id)?.total ?? 0}{" "}
                    {porEvento.get(e.id)?.total === 1 ? "pessoa" : "pessoas"}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        {comparando && (
          <button type="button" onClick={() => setGrupoA([])} className={`${estiloBotaoSecundario} mt-3`}>
            Limpar seleção
          </button>
        )}
      </section>

      <section className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-300 text-left text-slate-600">
              <th className="py-2 pr-4 font-medium">Tema</th>
              <th className="py-2 pr-4 text-right font-medium">
                {tituloColuna("A", comparando ? `Selecionados (${A.total})` : `Geral (${A.total})`)}
              </th>
              {comparando && (
                <>
                  <th className="py-2 pr-4 text-right font-medium">{tituloColuna("B", `Outros do período (${B.total})`)}</th>
                  <th className="py-2 text-right font-medium">Diferença</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const pa = pct(A.porTema[l.numero], A.total);
              const pb = pct(B.porTema[l.numero], B.total);
              const dif = pa - pb;
              const destaque = comparando && B.total > 0 && A.total > 0 && Math.abs(dif) >= DESTAQUE_PP;
              return (
                <tr key={l.numero} className={`border-b border-slate-100 align-top ${destaque ? "bg-amber-50" : ""}`}>
                  <td className="py-3 pr-4">
                    <TituloTema
                      modeloId={modeloId}
                      perguntaId={perguntaId}
                      numero={l.numero}
                      titulo={l.titulo}
                    />
                    {c.exemplos[l.numero]?.length > 0 && (
                      <p className="mt-1 text-xs text-slate-500">
                        {tipo === "aberta"
                          ? c.exemplos[l.numero].map((x) => `“${x.length > 140 ? x.slice(0, 140) + "…" : x}”`).join("  ")
                          : c.exemplos[l.numero].join(", ")}
                      </p>
                    )}
                  </td>
                  <Celula p={pa} n={A.porTema[l.numero]} />
                  {comparando && (
                    <>
                      {B.total > 0 ? <Celula p={pb} n={B.porTema[l.numero]} /> : <td className="py-3 pr-4 text-right text-slate-400">—</td>}
                      <td className={`py-3 text-right tabular-nums ${destaque ? "font-semibold text-slate-900" : "text-slate-600"}`}>
                        {B.total > 0 && A.total > 0
                          ? `${dif > 0 ? "▲ +" : dif < 0 ? "▼ −" : ""}${Math.abs(dif).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} p.p.`
                          : "—"}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
            {(A.semTema > 0 || (comparando && B.semTema > 0)) && (
              <tr className="text-slate-500">
                <td className="py-3 pr-4 italic">Ainda sem tema (respostas novas)</td>
                <Celula p={pct(A.semTema, A.total)} n={A.semTema} />
                {comparando && (
                  <>
                    <Celula p={pct(B.semTema, B.total)} n={B.semTema} />
                    <td />
                  </>
                )}
              </tr>
            )}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-slate-500">
          % das pessoas que responderam em cada grupo. Uma pessoa pode cair em mais de um tema, então a soma passa de 100%.
          {comparando && ` Linhas destacadas: diferença de ${DESTAQUE_PP} p.p. ou mais.`}
        </p>
      </section>
    </>
  );
}

function Celula({ p, n }: { p: number; n: number }) {
  return (
    <td className="py-3 pr-4 text-right tabular-nums text-slate-800">
      {p.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}% <span className="text-slate-500">({n})</span>
    </td>
  );
}

function TituloTema({ modeloId, perguntaId, numero, titulo }: { modeloId: string; perguntaId: string; numero: number; titulo: string }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(titulo);
  const [ocupado, iniciar] = useTransition();
  const [erro, setErro] = useState<string>();

  if (numero === 0) return <span className="font-medium text-slate-800">{titulo}</span>;
  if (!editando) {
    return (
      <span className="font-medium text-slate-800">
        {titulo}{" "}
        <button type="button" onClick={() => setEditando(true)} className="ml-1 text-xs font-normal text-slate-500 hover:underline">
          renomear
        </button>
      </span>
    );
  }
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        iniciar(async () => {
          const r = await renomearTemaConsolidado(modeloId, perguntaId, numero, valor);
          if (r.erro) setErro(r.erro);
          else setEditando(false);
        });
      }}
    >
      <input value={valor} onChange={(e) => setValor(e.target.value)} maxLength={60} className={`${estiloCampo} py-1`} autoFocus />
      <button type="submit" disabled={ocupado} className={estiloBotaoCompacto}>
        {ocupado ? "Salvando…" : "Salvar"}
      </button>
      <button type="button" onClick={() => { setValor(titulo); setEditando(false); }} className="text-sm text-slate-500 hover:underline">
        Cancelar
      </button>
      {erro && <span className="text-sm text-red-700">{erro}</span>}
    </form>
  );
}
