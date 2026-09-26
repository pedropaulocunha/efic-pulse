// Gráficos do telão: barras (múltipla escolha), histograma (escala) e nuvem de palavras.
// Tela para projetar, sem interação: os números importantes vão escritos ao lado do gráfico.
// Cores em lib/paleta.ts: cada opção com sua cor fixa; a escala (uma medida só) em
// petróleo, com a referência em coral e rótulo próprio.

import {
  formatarNumero,
  valoresDaEscala,
  type ConfigEscala,
  type ConfigMultipla,
} from "@/lib/atividades";
import {
  COR_ESCALA,
  COR_REFERENCIA,
  COR_REFERENCIA_TEXTO,
  CORES_OPCOES,
  corDaPalavra,
} from "@/lib/paleta";
import type { ResultadoAgregado } from "@/utils/projecao";

function percentual(n: number, total: number) {
  return total === 0 ? 0 : Math.round((n / total) * 100);
}

// ---------------------------------------------------------------
// Múltipla escolha: barras horizontais, com número e percentual escritos
// ---------------------------------------------------------------

export function BarrasMultipla({
  config,
  resultado,
}: {
  config: ConfigMultipla;
  resultado: Extract<ResultadoAgregado, { tipo: "multipla" }>;
}) {
  const maior = Math.max(1, ...resultado.contagem);
  return (
    <div className="flex w-full flex-col gap-[2vh]">
      {config.opcoes.map((opcao, i) => {
        const n = resultado.contagem[i] ?? 0;
        return (
          <div key={i} className="grid grid-cols-[minmax(0,32%)_1fr_auto] items-center gap-[2vw]">
            <span className="truncate text-[2.6vw] leading-tight text-slate-800">{opcao}</span>
            <div className="h-[5.5vh] rounded-r-[4px] bg-slate-100">
              <div
                className="h-full rounded-r-[4px] transition-[width] duration-700 ease-out"
                style={{ width: `${(n / maior) * 100}%`, backgroundColor: CORES_OPCOES[i % CORES_OPCOES.length] }}
              />
            </div>
            <span className="w-[12vw] text-right text-[2.6vw] tabular-nums text-slate-900">
              {percentual(n, resultado.total)}%
              <span className="ml-[0.6vw] text-[1.6vw] text-slate-500">({n})</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------
// Escala: histograma com média, mediana e (quando revelada) a referência
// ---------------------------------------------------------------

const MAX_BARRAS = 40;

export function HistogramaEscala({
  config,
  resultado,
}: {
  config: ConfigEscala;
  resultado: Extract<ResultadoAgregado, { tipo: "escala" }>;
}) {
  const valores = valoresDaEscala(config);
  const porValor = new Map(resultado.histograma.map((h) => [Number(h.valor), h.n]));

  // Escala com muitas posições: junta vizinhas em até 40 barras.
  const juntar = Math.max(1, Math.ceil(valores.length / MAX_BARRAS));
  const barras: { inicio: number; fim: number; n: number }[] = [];
  for (let i = 0; i < valores.length; i += juntar) {
    const grupo = valores.slice(i, i + juntar);
    barras.push({
      inicio: grupo[0],
      fim: grupo[grupo.length - 1],
      n: grupo.reduce((soma, v) => soma + (porValor.get(v) ?? 0), 0),
    });
  }
  const maior = Math.max(1, ...barras.map((b) => b.n));

  // Coordenadas do desenho (viewBox 1000 x 420).
  const L = 1000;
  const A = 418; // linha de base, quase no pé do desenho
  const largura = L / barras.length;
  const x = (v: number) => ((v - config.min) / (config.max - config.min)) * (L - largura) + largura / 2;
  const referencia = typeof config.referencia === "number" ? config.referencia : null;

  const linhas = [
    resultado.media !== null && { valor: resultado.media, rotulo: "média", cor: "#0f172a", tracejado: false },
    resultado.mediana !== null && { valor: resultado.mediana, rotulo: "mediana", cor: "#0f172a", tracejado: true },
    referencia !== null && { valor: referencia, rotulo: "referência", cor: COR_REFERENCIA, tracejado: false },
  ].filter(Boolean) as { valor: number; rotulo: string; cor: string; tracejado: boolean }[];

  return (
    <div className="flex w-full flex-col">
      <div className="mb-[2vh] flex flex-wrap gap-x-[3vw] gap-y-[1vh] text-[2.2vw] text-slate-700">
        {resultado.media !== null && (
          <span>
            Média <strong className="tabular-nums text-slate-900">{formatarNumero(resultado.media, config.unidade)}</strong>
          </span>
        )}
        {resultado.mediana !== null && (
          <span>
            Mediana{" "}
            <strong className="tabular-nums text-slate-900">{formatarNumero(resultado.mediana, config.unidade)}</strong>
          </span>
        )}
        {referencia !== null && (
          <span style={{ color: COR_REFERENCIA_TEXTO }}>
            Referência <strong className="tabular-nums">{formatarNumero(referencia, config.unidade)}</strong>
          </span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${L} 420`}
        preserveAspectRatio="none"
        className="h-[38vh] w-full"
        role="img"
        aria-label="Histograma das respostas"
      >
        <line x1={0} x2={L} y1={A} y2={A} stroke="#cbd5e1" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        {barras.map((b, i) => {
          const h = (b.n / maior) * (A - 20);
          return (
            <rect
              key={i}
              x={i * largura + 1}
              width={Math.max(1, largura - 2)}
              y={A - h}
              height={h}
              rx={4}
              fill={COR_ESCALA}
            />
          );
        })}
        {linhas.map((l) => (
          <g key={l.rotulo}>
            <line
              x1={x(l.valor)}
              x2={x(l.valor)}
              y1={8}
              y2={A}
              stroke={l.cor}
              strokeWidth={l.rotulo === "referência" ? 5 : 3}
              strokeDasharray={l.tracejado ? "10 8" : undefined}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        ))}
      </svg>
      <div className="mt-[0.5vh] flex justify-between text-[1.5vw] text-slate-500">
        <span>{formatarNumero(config.min, config.unidade)}</span>
        <span>{formatarNumero(config.max, config.unidade)}</span>
      </div>

      <div className="mt-[1.5vh] flex gap-[3vw] text-[1.5vw] text-slate-500">
        <span>— linha cheia: média</span>
        <span>- - tracejada: mediana</span>
        {referencia !== null && <span style={{ color: COR_REFERENCIA_TEXTO }}>— coral: referência</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// Nuvem de palavras: tamanho proporcional à frequência
// ---------------------------------------------------------------

export function NuvemPalavras({ resultado }: { resultado: Extract<ResultadoAgregado, { tipo: "nuvem" }> }) {
  const palavras = resultado.palavras.slice(0, 60);
  if (palavras.length === 0) return null;
  const maior = palavras[0].n;

  // Maiores no meio: alterna as palavras à direita e à esquerda da mais citada.
  const arrumadas: typeof palavras = [];
  palavras.forEach((p, i) => (i % 2 === 0 ? arrumadas.push(p) : arrumadas.unshift(p)));

  return (
    <div className="flex w-full flex-wrap items-center justify-center gap-x-[2.2vw] gap-y-[1vh]">
      {arrumadas.map((p) => {
        const peso = Math.sqrt(p.n / maior); // área proporcional à frequência
        return (
          <span
            key={p.palavra}
            title={`${p.palavra}: ${p.n}`}
            className="leading-none"
            style={{
              fontSize: `${1.6 + peso * 5.4}vw`,
              fontWeight: peso > 0.6 ? 700 : peso > 0.3 ? 600 : 500,
              color: corDaPalavra(p.palavra),
            }}
          >
            {p.palavra}
          </span>
        );
      })}
    </div>
  );
}
