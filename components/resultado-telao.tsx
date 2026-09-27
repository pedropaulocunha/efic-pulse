// Gráficos do telão: barras (múltipla escolha), pontos (ordenar), histograma
// (escala e número), nuvem de palavras e mural (respostas abertas).
// Tela para projetar, sem interação: os números importantes vão escritos ao lado do gráfico.
// Cores em lib/paleta.ts: cada opção/item com sua cor fixa; escala e número (uma
// medida só) em petróleo, com a referência em coral e rótulo próprio.
// Rodadas: a partir da rodada 2, a rodada 1 aparece junto, em tom claro, para comparar.

import {
  formatarNumero,
  valoresDaEscala,
  type ConfigEscala,
  type ConfigMultipla,
  type ConfigNumero,
  type ConfigOrdenar,
} from "@/lib/atividades";
import {
  COR_ESCALA,
  COR_MEDIA,
  COR_MEDIANA,
  COR_REFERENCIA,
  COR_REFERENCIA_TEXTO,
  CORES_OPCOES,
  CORES_TEXTO,
  corDaPalavra,
} from "@/lib/paleta";
import type { ResultadoAgregado } from "@/utils/projecao";

type Resultado<T extends ResultadoAgregado["tipo"]> = Extract<ResultadoAgregado, { tipo: T }>;

const corDaOpcao = (i: number) => CORES_OPCOES[i % CORES_OPCOES.length];

function percentual(n: number, total: number) {
  return total === 0 ? 0 : Math.round((n / total) * 100);
}

// Legenda da comparação de rodadas.
export function LegendaRodadas({ rodada }: { rodada: number }) {
  return (
    <span className="inline-flex items-center gap-[1.5cqw] text-[1.5cqw] text-slate-500">
      <span className="inline-flex items-center gap-[0.5cqw]">
        <span className="inline-block h-[1.2cqh] w-[2.4cqw] rounded-r-[4px] bg-slate-400 opacity-35" /> rodada 1
      </span>
      <span className="inline-flex items-center gap-[0.5cqw]">
        <span className="inline-block h-[1.2cqh] w-[2.4cqw] rounded-r-[4px] bg-slate-500" /> rodada {rodada}
      </span>
    </span>
  );
}

// Barra horizontal: a da rodada 1 (se houver) em cima, fina e clara; a atual embaixo.
function BarraComparada({ fracao, fracaoAntes, cor }: { fracao: number; fracaoAntes?: number; cor: string }) {
  return (
    <div className="flex flex-col gap-[0.5cqh]">
      {fracaoAntes !== undefined && (
        <div className="h-[1.6cqh] rounded-r-[4px] bg-slate-100">
          <div
            className="h-full rounded-r-[4px] opacity-35 transition-[width] duration-700 ease-out"
            style={{ width: `${fracaoAntes * 100}%`, backgroundColor: cor }}
          />
        </div>
      )}
      <div className={`${fracaoAntes !== undefined ? "h-[4cqh]" : "h-[5.5cqh]"} rounded-r-[4px] bg-slate-100`}>
        <div
          className="h-full rounded-r-[4px] transition-[width] duration-700 ease-out"
          style={{ width: `${fracao * 100}%`, backgroundColor: cor }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// Múltipla escolha: uma barra por opção, com percentual e número escritos
// ---------------------------------------------------------------

export function BarrasMultipla({
  config,
  resultado,
  anterior,
}: {
  config: ConfigMultipla;
  resultado: Resultado<"multipla">;
  anterior?: Resultado<"multipla"> | null;
}) {
  const maior = Math.max(1, ...resultado.contagem, ...(anterior?.contagem ?? []));
  return (
    // Uma grade só para todas as linhas: as trilhas das barras ficam alinhadas.
    <div className="grid w-full grid-cols-[minmax(0,32%)_1fr_auto] items-center gap-x-[2cqw] gap-y-[2cqh]">
      {config.opcoes.map((opcao, i) => {
        const n = resultado.contagem[i] ?? 0;
        const antes = anterior?.contagem[i];
        return (
          <div key={i} className="contents">
            <span className="truncate text-[2cqw] leading-tight text-slate-800">{opcao}</span>
            <BarraComparada
              fracao={n / maior}
              fracaoAntes={antes === undefined ? undefined : antes / maior}
              cor={corDaOpcao(i)}
            />
            <span className="min-w-[10cqw] whitespace-nowrap text-right text-[2cqw] tabular-nums text-slate-900">
              {percentual(n, resultado.total)}%
              <span className="ml-[0.6cqw] text-[1.3cqw] text-slate-500">
                {anterior ? `(antes ${percentual(antes ?? 0, anterior.total)}%)` : `(${n})`}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------
// Ordenar: itens em ordem (1º lugar vale mais na conta, mas o telão não mostra os pontos)
// ---------------------------------------------------------------

export function PontosOrdenar({
  config,
  resultado,
  anterior,
}: {
  config: ConfigOrdenar;
  resultado: Resultado<"ordenar">;
  anterior?: Resultado<"ordenar"> | null;
}) {
  const maior = Math.max(1, ...resultado.pontos, ...(anterior?.pontos ?? []));
  // A cor segue o item (ordem cadastrada), não a posição no ranking.
  const ordem = config.itens.map((_, i) => i).sort((a, b) => (resultado.pontos[b] ?? 0) - (resultado.pontos[a] ?? 0));
  const posicaoAntes = anterior
    ? new Map(
        config.itens
          .map((_, i) => i)
          .sort((a, b) => (anterior.pontos[b] ?? 0) - (anterior.pontos[a] ?? 0))
          .map((item, pos) => [item, pos + 1]),
      )
    : null;

  // Sem número de pontos: a posição já diz a ordem. A barra mostra a distância entre
  // as posições (folga ou quase empate). Na comparação, a posição da rodada 1 ao lado.
  return (
    // Uma grade só para todas as linhas: as trilhas das barras ficam alinhadas.
    <div
      className={`grid w-full items-center gap-x-[1.5cqw] gap-y-[2cqh] ${
        posicaoAntes ? "grid-cols-[4vw_minmax(0,30%)_1fr_auto]" : "grid-cols-[4vw_minmax(0,30%)_1fr]"
      }`}
    >
      {ordem.map((i, pos) => {
        const pts = resultado.pontos[i] ?? 0;
        const antes = anterior?.pontos[i];
        return (
          <div key={i} className="contents">
            <span className="text-[2cqw] font-semibold tabular-nums text-slate-400">{pos + 1}º</span>
            <span className="truncate text-[2cqw] leading-tight text-slate-800">{config.itens[i]}</span>
            <BarraComparada
              fracao={pts / maior}
              fracaoAntes={antes === undefined ? undefined : antes / maior}
              cor={corDaOpcao(i)}
            />
            {posicaoAntes && (
              <span className="whitespace-nowrap text-right text-[1.3cqw] text-slate-500">
                (antes {posicaoAntes.get(i)}º)
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------
// Escala e número: histograma com média, mediana e (quando revelada) a referência
// ---------------------------------------------------------------

const MAX_BARRAS = 40;
const FAIXAS_NUMERO = 12;

type Faixa = { inicio: number; fim: number };

// Faixas do eixo: na escala, as posições dela (juntando vizinhas se forem muitas);
// no número, faixas iguais entre o menor e o maior valor (ou os limites cadastrados).
function faixasDoEixo(
  tipo: "escala" | "numero",
  config: ConfigEscala | ConfigNumero,
  valores: number[],
): { faixas: Faixa[]; lo: number; hi: number; indice: (v: number) => number } {
  if (tipo === "escala") {
    const c = config as ConfigEscala;
    const posicoes = valoresDaEscala(c);
    const juntar = Math.max(1, Math.ceil(posicoes.length / MAX_BARRAS));
    const faixas: Faixa[] = [];
    for (let i = 0; i < posicoes.length; i += juntar) {
      const grupo = posicoes.slice(i, i + juntar);
      faixas.push({ inicio: grupo[0], fim: grupo[grupo.length - 1] });
    }
    const indice = (v: number) => Math.min(faixas.length - 1, Math.floor(Math.round((v - c.min) / c.passo) / juntar));
    return { faixas, lo: c.min, hi: c.max, indice };
  }

  const c = config as ConfigNumero;
  const lo = c.min ?? (valores.length ? Math.min(...valores) : 0);
  let hi = c.max ?? (valores.length ? Math.max(...valores) : 1);
  if (hi <= lo) hi = lo + 1;
  const distintos = [...new Set(valores)].sort((a, b) => a - b);
  // Poucos valores inteiros próximos: uma barra por valor fica mais fácil de ler.
  if (distintos.length > 0 && Number.isInteger(lo) && Number.isInteger(hi) && hi - lo + 1 <= FAIXAS_NUMERO) {
    const faixas = Array.from({ length: hi - lo + 1 }, (_, i) => ({ inicio: lo + i, fim: lo + i }));
    return { faixas, lo, hi, indice: (v) => Math.min(faixas.length - 1, Math.max(0, Math.round(v) - lo)) };
  }
  const largura = (hi - lo) / FAIXAS_NUMERO;
  const faixas = Array.from({ length: FAIXAS_NUMERO }, (_, i) => ({ inicio: lo + i * largura, fim: lo + (i + 1) * largura }));
  return { faixas, lo, hi, indice: (v) => Math.min(FAIXAS_NUMERO - 1, Math.max(0, Math.floor((v - lo) / largura))) };
}

// Pedacinho da linha do gráfico, ao lado do número que ela representa.
function AmostraLinha({ cor, tracejada = false, grossa = false }: { cor: string; tracejada?: boolean; grossa?: boolean }) {
  return (
    <svg viewBox="0 0 40 10" className="h-[1.2cqw] w-[3cqw] shrink-0" aria-hidden>
      <line
        x1={0}
        x2={40}
        y1={5}
        y2={5}
        stroke={cor}
        strokeWidth={grossa ? 5 : 3.5}
        strokeDasharray={tracejada ? "7 5" : undefined}
      />
    </svg>
  );
}

export function HistogramaNumerico({
  tipo,
  config,
  resultado,
  anterior,
}: {
  tipo: "escala" | "numero";
  config: ConfigEscala | ConfigNumero;
  resultado: Resultado<"escala"> | Resultado<"numero">;
  anterior?: Resultado<"escala"> | Resultado<"numero"> | null;
}) {
  const unidade = config.unidade;
  const todos = [...resultado.histograma, ...(anterior?.histograma ?? [])].map((h) => Number(h.valor));
  const { faixas, lo, hi, indice } = faixasDoEixo(tipo, config, todos);

  const contar = (r: typeof resultado | null | undefined) => {
    const n = faixas.map(() => 0);
    for (const h of r?.histograma ?? []) n[indice(Number(h.valor))] += h.n;
    return n;
  };
  const atual = contar(resultado);
  const antes = anterior ? contar(anterior) : null;
  const maior = Math.max(1, ...atual, ...(antes ?? []));

  // Coordenadas do desenho (viewBox 1000 x 420).
  const L = 1000;
  const A = 418;
  const largura = L / faixas.length;
  // Barras de valor exato (escala, número inteiro): a linha passa pelo centro da barra do valor.
  // Barras de faixa (número com faixas iguais): o eixo é contínuo, da borda esquerda à direita.
  const discreto = faixas.every((f) => f.inicio === f.fim) || tipo === "escala";
  const x = (v: number) =>
    discreto
      ? ((v - lo) / (hi - lo || 1)) * (L - largura) + largura / 2
      : ((v - lo) / (hi - lo || 1)) * L;
  const referencia = typeof config.referencia === "number" ? config.referencia : null;

  const linhas = [
    resultado.media !== null && { valor: Number(resultado.media), rotulo: "média", cor: COR_MEDIA, tracejado: false },
    resultado.mediana !== null && { valor: Number(resultado.mediana), rotulo: "mediana", cor: COR_MEDIANA, tracejado: true },
    referencia !== null && { valor: referencia, rotulo: "referência", cor: COR_REFERENCIA, tracejado: false },
  ].filter(Boolean) as { valor: number; rotulo: string; cor: string; tracejado: boolean }[];

  const numero = (v: number | null | undefined) => (v === null || v === undefined ? "—" : formatarNumero(Number(v), unidade));

  // Cada número vem com a amostra da própria linha: é a legenda (sem repetir embaixo).
  return (
    <div className="flex w-full flex-col">
      <div className="mb-[2cqh] flex flex-wrap items-center gap-x-[3cqw] gap-y-[1cqh] text-[1.7cqw] text-slate-700">
        <span className="inline-flex items-center gap-[0.7cqw]">
          <AmostraLinha cor={COR_MEDIA} />
          Média <strong className="tabular-nums text-slate-900">{numero(resultado.media)}</strong>
          {anterior && <span className="text-[1.4cqw] text-slate-500">(antes {numero(anterior.media)})</span>}
        </span>
        <span className="inline-flex items-center gap-[0.7cqw]">
          <AmostraLinha cor={COR_MEDIANA} tracejada />
          Mediana <strong className="tabular-nums text-slate-900">{numero(resultado.mediana)}</strong>
          {anterior && <span className="text-[1.4cqw] text-slate-500">(antes {numero(anterior.mediana)})</span>}
        </span>
        {referencia !== null && (
          <span className="inline-flex items-center gap-[0.7cqw]" style={{ color: COR_REFERENCIA_TEXTO }}>
            <AmostraLinha cor={COR_REFERENCIA} grossa />
            Referência <strong className="tabular-nums">{numero(referencia)}</strong>
          </span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${L} 420`}
        preserveAspectRatio="none"
        className="h-[32cqh] w-full"
        role="img"
        aria-label="Histograma das respostas"
      >
        <line x1={0} x2={L} y1={A} y2={A} stroke="#cbd5e1" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        {faixas.map((_, i) => {
          const h = (atual[i] / maior) * (A - 20);
          const hAntes = antes ? (antes[i] / maior) * (A - 20) : 0;
          const meia = antes ? largura / 2 : largura;
          return (
            <g key={i}>
              {antes && (
                <rect x={i * largura + 1} width={Math.max(1, meia - 2)} y={A - hAntes} height={hAntes} rx={4} fill={COR_ESCALA} opacity={0.35} />
              )}
              <rect
                x={i * largura + (antes ? meia : 0) + 1}
                width={Math.max(1, meia - 2)}
                y={A - h}
                height={h}
                rx={4}
                fill={COR_ESCALA}
              />
            </g>
          );
        })}
        {linhas.map((l) => (
          <g key={l.rotulo}>
            {/* Contorno branco: a linha continua visível por cima das barras. */}
            <line
              x1={x(l.valor)}
              x2={x(l.valor)}
              y1={8}
              y2={A}
              stroke="#ffffff"
              strokeWidth={l.rotulo === "referência" ? 9 : 7}
              vectorEffect="non-scaling-stroke"
            />
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
      <div className="mt-[0.5cqh] flex justify-between text-[1.4cqw] text-slate-500">
        <span>{formatarNumero(lo, unidade)}</span>
        <span>{formatarNumero(hi, unidade)}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// Nuvem de palavras: tamanho proporcional à frequência
// ---------------------------------------------------------------

export function NuvemPalavras({ resultado }: { resultado: Resultado<"nuvem"> }) {
  const palavras = resultado.palavras.slice(0, 60);
  if (palavras.length === 0) return null;
  const maior = palavras[0].n;

  // Cores distribuídas pela ordem de frequência (antes de embaralhar a posição).
  const cores = new Map(palavras.map((p) => [p.chave, corDaPalavra(p.chave)]));

  // Maiores no meio: alterna as palavras à direita e à esquerda da mais citada.
  const arrumadas: typeof palavras = [];
  palavras.forEach((p, i) => (i % 2 === 0 ? arrumadas.push(p) : arrumadas.unshift(p)));

  return (
    <div className="flex w-full flex-wrap items-center justify-center gap-x-[2.2cqw] gap-y-[1cqh]">
      {arrumadas.map((p) => {
        const peso = Math.sqrt(p.n / maior); // área proporcional à frequência
        return (
          <span
            key={p.chave}
            title={`${p.palavra}: ${p.n}`}
            className="leading-none"
            style={{
              fontSize: `${1.6 + peso * 5.4}cqw`,
              fontWeight: peso > 0.6 ? 700 : peso > 0.3 ? 600 : 500,
              color: cores.get(p.chave),
            }}
          >
            {p.palavra}
          </span>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------
// Respostas abertas: mural só com as aprovadas, sem autor
// ---------------------------------------------------------------

export function MuralAbertas({ resultado }: { resultado: Resultado<"aberta"> }) {
  const textos = resultado.aprovadas.slice(0, 12);
  if (textos.length === 0) {
    return <p className="w-full text-center text-[2.4cqw] text-slate-400">As respostas aparecem aqui quando aprovadas.</p>;
  }
  // Menos cartões, letra maior.
  const tamanho = textos.length <= 3 ? "text-[2cqw]" : textos.length <= 6 ? "text-[1.7cqw]" : "text-[1.4cqw]";
  const colunas = textos.length <= 2 ? "grid-cols-2" : textos.length <= 6 ? "grid-cols-3" : "grid-cols-4";
  return (
    <div className={`grid w-full ${colunas} gap-[1.5cqw]`}>
      {textos.map((t, i) => (
        <p
          key={`${i}-${t}`}
          className={`rounded-[0.8cqw] border-t-[0.6cqh] bg-slate-50 px-[1.5cqw] py-[2cqh] leading-snug text-slate-800 ${tamanho}`}
          style={{ borderTopColor: CORES_TEXTO[i % CORES_TEXTO.length] }}
        >
          {t}
        </p>
      ))}
    </div>
  );
}
