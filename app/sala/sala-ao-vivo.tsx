"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useEstadoAoVivo } from "@/components/use-estado-ao-vivo";
import {
  formatarNumero,
  TAMANHO_PALAVRA,
  valoresDaEscala,
  type ConfigAberta,
  type ConfigEscala,
  type ConfigMultipla,
  type ConfigNumero,
  type ConfigNuvem,
  type ConfigOrdenar,
  type ValorResposta,
} from "@/lib/atividades";
import type { EstadoSala } from "@/utils/sala";

type Atividade = NonNullable<EstadoSala["atividade"]>;

// Telas do celular: espera, atividade aberta, resposta enviada, votação encerrada.
// O celular NUNCA mostra resultado nem a referência (escala e número).
export default function SalaAoVivo({
  eventoId,
  nomeTurma,
  cooperativa,
  inicial,
}: {
  eventoId: string;
  nomeTurma: string;
  cooperativa: string | null;
  inicial: EstadoSala;
}) {
  const router = useRouter();
  const { dados, semConexao, recarregar } = useEstadoAoVivo<EstadoSala>("/api/sala/estado", eventoId, inicial, {
    aoPerderSessao: () => router.replace("/"),
  });
  const { atividade, eventoEncerrado } = dados;

  let conteudo: React.ReactNode;
  if (eventoEncerrado) {
    conteudo = <Mensagem titulo={nomeTurma} texto="Este evento já terminou." cooperativa={cooperativa} />;
  } else if (!atividade) {
    conteudo = (
      <Mensagem titulo={nomeTurma} texto="A próxima atividade aparece aqui sozinha." cooperativa={cooperativa} />
    );
  } else if (atividade.estado === "encerrada") {
    conteudo = <Mensagem titulo={atividade.enunciado} texto="Votação encerrada. Acompanhe no telão." />;
  } else {
    // A chave faz a tela recomeçar do zero quando muda a atividade ou a rodada.
    conteudo = (
      <Responder
        key={`${atividade.id}-${atividade.rodada}`}
        atividade={atividade}
        respostaEnviada={dados.resposta}
        aoEnviar={recarregar}
        aoPerderSessao={() => router.replace("/")}
      />
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-5 py-8">
      {semConexao && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-2 text-center text-sm text-amber-800">
          Reconectando…
        </p>
      )}
      {conteudo}
    </main>
  );
}

function Mensagem({ titulo, texto, cooperativa }: { titulo: string; texto: string; cooperativa?: string | null }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      {cooperativa && <p className="text-sm uppercase tracking-wide text-slate-500">{cooperativa}</p>}
      <h1 className="mt-2 text-2xl font-semibold">{titulo}</h1>
      <p className="mt-10 text-xl text-slate-600">{texto}</p>
    </div>
  );
}

// ---------------------------------------------------------------
// Atividade aberta
// ---------------------------------------------------------------

function Responder({
  atividade,
  respostaEnviada,
  aoEnviar,
  aoPerderSessao,
}: {
  atividade: Atividade;
  respostaEnviada: ValorResposta | null;
  aoEnviar: () => void;
  aoPerderSessao: () => void;
}) {
  // Última resposta confirmada por este aparelho (antes de o servidor devolver).
  const [enviadaAgora, setEnviadaAgora] = useState<ValorResposta | null>(null);
  const [mudando, setMudando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string>();

  const ultima = enviadaAgora ?? respostaEnviada;

  async function enviar(valor: ValorResposta) {
    setEnviando(true);
    setErro(undefined);
    try {
      const resposta = await fetch("/api/sala/responder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ atividade_id: atividade.id, valor }),
      });
      if (resposta.status === 401) return aoPerderSessao();
      const corpo = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErro(corpo.erro ?? "Não foi possível enviar. Tente de novo.");
        if (resposta.status === 409) aoEnviar(); // votação encerrada: atualiza a tela
        return;
      }
      setEnviadaAgora(valor);
      setMudando(false);
      navigator.vibrate?.(40); // vibração curta, onde o aparelho permite
      aoEnviar();
    } catch {
      setErro("Sem conexão. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  if (ultima && !mudando) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <p className="text-lg text-slate-500">{atividade.enunciado}</p>
        <p className="mt-8 text-3xl font-semibold text-emerald-700">Resposta enviada.</p>
        {atividade.tipo === "aberta" && (
          <p className="mt-3 text-slate-500">Ela aparece no telão, sem o seu nome, se o instrutor aprovar.</p>
        )}
        <button
          type="button"
          onClick={() => setMudando(true)}
          className="mt-10 h-12 rounded-lg px-6 text-base font-medium text-marca underline-offset-4 hover:underline"
        >
          Mudar minha resposta
        </button>
      </div>
    );
  }

  const props = { enviando, erro, aoEnviar: enviar, anterior: ultima };
  return (
    <div className="flex flex-1 flex-col">
      {atividade.rodada > 1 && (
        <p className="mb-3 self-start rounded-full bg-violet-100 px-3 py-1 text-sm font-medium text-violet-800">
          Rodada {atividade.rodada}: responda de novo
        </p>
      )}
      <h1 className="text-2xl font-semibold leading-snug">{atividade.enunciado}</h1>
      {atividade.observacao && <p className="mt-2 leading-relaxed text-slate-600">{atividade.observacao}</p>}
      <div className="mt-8 flex flex-1 flex-col">
        {atividade.tipo === "multipla" && <Multipla config={atividade.config as ConfigMultipla} {...props} />}
        {atividade.tipo === "escala" && <Escala config={atividade.config as ConfigEscala} {...props} />}
        {atividade.tipo === "nuvem" && <Nuvem config={atividade.config as ConfigNuvem} {...props} />}
        {atividade.tipo === "ordenar" && <Ordenar config={atividade.config as ConfigOrdenar} {...props} />}
        {atividade.tipo === "numero" && <Numero config={atividade.config as ConfigNumero} {...props} />}
        {atividade.tipo === "aberta" && <Aberta config={atividade.config as ConfigAberta} {...props} />}
      </div>
    </div>
  );
}

type PropsControle<C> = {
  config: C;
  anterior: ValorResposta | null;
  enviando: boolean;
  erro?: string;
  aoEnviar: (valor: ValorResposta) => void;
};

function BotaoEnviar({ desabilitado, enviando, erro }: { desabilitado: boolean; enviando: boolean; erro?: string }) {
  return (
    <div className="mt-auto pt-8">
      {erro && <p className="mb-3 rounded-lg bg-red-50 px-4 py-3 text-center text-red-800">{erro}</p>}
      <button
        type="submit"
        disabled={desabilitado || enviando}
        className="h-14 w-full rounded-xl bg-marca text-lg font-semibold text-white hover:bg-marca-escura disabled:opacity-40"
      >
        {enviando ? "Enviando…" : "Enviar"}
      </button>
    </div>
  );
}

function Multipla({ config, anterior, enviando, erro, aoEnviar }: PropsControle<ConfigMultipla>) {
  const [escolhida, setEscolhida] = useState<number | null>(
    anterior && "opcao" in anterior ? anterior.opcao : null,
  );
  return (
    <form
      className="flex flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        if (escolhida !== null) aoEnviar({ opcao: escolhida });
      }}
    >
      <div className="space-y-3">
        {config.opcoes.map((opcao, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setEscolhida(i)}
            aria-pressed={escolhida === i}
            className={`min-h-16 w-full rounded-xl border-2 px-5 py-4 text-left text-lg font-medium transition ${
              escolhida === i
                ? "border-marca bg-marca text-white"
                : "border-slate-200 bg-white text-slate-800 hover:border-slate-300"
            }`}
          >
            {opcao}
          </button>
        ))}
      </div>
      <BotaoEnviar desabilitado={escolhida === null} enviando={enviando} erro={erro} />
    </form>
  );
}

function Escala({ config, anterior, enviando, erro, aoEnviar }: PropsControle<ConfigEscala>) {
  const valores = valoresDaEscala(config);
  const indiceAnterior = anterior && "numero" in anterior ? valores.indexOf(anterior.numero) : -1;
  // O controle anda de posição em posição da escala: só para nos passos.
  const [indice, setIndice] = useState(indiceAnterior >= 0 ? indiceAnterior : Math.floor((valores.length - 1) / 2));
  const [mexeu, setMexeu] = useState(indiceAnterior >= 0);

  return (
    <form
      className="flex flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        aoEnviar({ numero: valores[indice] });
      }}
    >
      <p className="text-center text-6xl font-semibold tabular-nums text-slate-900">
        {formatarNumero(valores[indice], config.unidade)}
      </p>
      <input
        type="range"
        min={0}
        max={valores.length - 1}
        step={1}
        value={indice}
        onChange={(e) => {
          setIndice(Number(e.target.value));
          setMexeu(true);
        }}
        aria-label="Sua resposta"
        className="mt-10 h-12 w-full cursor-pointer accent-[#0f5b78]"
      />
      <div className="mt-1 flex justify-between text-sm text-slate-500">
        <span>{formatarNumero(config.min, config.unidade)}</span>
        <span>{formatarNumero(config.max, config.unidade)}</span>
      </div>
      {!mexeu && <p className="mt-4 text-center text-sm text-slate-500">Arraste para escolher.</p>}
      <BotaoEnviar desabilitado={!mexeu} enviando={enviando} erro={erro} />
    </form>
  );
}

function Nuvem({ config, anterior, enviando, erro, aoEnviar }: PropsControle<ConfigNuvem>) {
  const iniciais = anterior && "palavras" in anterior ? anterior.palavras : [];
  const [palavras, setPalavras] = useState<string[]>(
    Array.from({ length: config.max_palavras }, (_, i) => iniciais[i] ?? ""),
  );
  const preenchidas = palavras.map((p) => p.trim()).filter(Boolean);

  return (
    <form
      className="flex flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        if (preenchidas.length > 0) aoEnviar({ palavras: preenchidas });
      }}
    >
      <p className="text-slate-600">
        {config.max_palavras === 1 ? "Escreva uma palavra." : `Escreva até ${config.max_palavras} palavras.`}
      </p>
      <div className="mt-4 space-y-3">
        {palavras.map((p, i) => (
          <input
            key={i}
            value={p}
            maxLength={TAMANHO_PALAVRA}
            autoCapitalize="none"
            autoComplete="off"
            enterKeyHint={i === palavras.length - 1 ? "send" : "next"}
            onChange={(e) => setPalavras((atual) => atual.map((x, j) => (j === i ? e.target.value : x)))}
            aria-label={`Palavra ${i + 1}`}
            className="block h-14 w-full rounded-xl border-2 border-slate-200 bg-white px-4 text-lg outline-none focus:border-marca"
          />
        ))}
      </div>
      <BotaoEnviar desabilitado={preenchidas.length === 0} enviando={enviando} erro={erro} />
    </form>
  );
}

// Ordenar por toque: a pessoa toca os itens na ordem da preferência (arrastar é ruim em tela pequena).
function Ordenar({ config, anterior, enviando, erro, aoEnviar }: PropsControle<ConfigOrdenar>) {
  const [ordem, setOrdem] = useState<number[]>(anterior && "ordem" in anterior ? anterior.ordem : []);
  const completa = ordem.length === config.itens.length;

  function tocar(i: number) {
    // Tocar um item já escolhido tira ele (e os seguintes sobem uma posição).
    setOrdem((atual) => (atual.includes(i) ? atual.filter((x) => x !== i) : [...atual, i]));
  }

  return (
    <form
      className="flex flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        if (completa) aoEnviar({ ordem });
      }}
    >
      <p className="text-slate-600">
        {completa ? "Confira a ordem e envie." : `Toque os itens na ordem que preferir: ${ordem.length + 1}º lugar.`}
      </p>
      <div className="mt-4 space-y-3">
        {config.itens.map((item, i) => {
          const posicao = ordem.indexOf(i);
          return (
            <button
              key={i}
              type="button"
              onClick={() => tocar(i)}
              aria-pressed={posicao >= 0}
              className={`flex min-h-16 w-full items-center gap-4 rounded-xl border-2 px-5 py-4 text-left text-lg font-medium transition ${
                posicao >= 0 ? "border-marca bg-marca/5 text-slate-900" : "border-slate-200 bg-white text-slate-800"
              }`}
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base font-semibold ${
                  posicao >= 0 ? "bg-marca text-white" : "border-2 border-dashed border-slate-300 text-transparent"
                }`}
              >
                {posicao >= 0 ? `${posicao + 1}º` : "·"}
              </span>
              {item}
            </button>
          );
        })}
      </div>
      {ordem.length > 0 && (
        <button
          type="button"
          onClick={() => setOrdem([])}
          className="mt-4 h-11 self-start rounded-lg px-3 text-marca underline-offset-4 hover:underline"
        >
          Recomeçar
        </button>
      )}
      <BotaoEnviar desabilitado={!completa} enviando={enviando} erro={erro} />
    </form>
  );
}

// Número digitado (aceita vírgula). Confere os limites antes de enviar; o banco confere de novo.
function Numero({ config, anterior, enviando, erro, aoEnviar }: PropsControle<ConfigNumero>) {
  const inicial = anterior && "numero" in anterior ? String(anterior.numero).replace(".", ",") : "";
  const [texto, setTexto] = useState(inicial);
  const [aviso, setAviso] = useState<string>();

  const temMin = typeof config.min === "number";
  const temMax = typeof config.max === "number";
  const faixa =
    temMin && temMax
      ? `Entre ${formatarNumero(config.min!, config.unidade)} e ${formatarNumero(config.max!, config.unidade)}.`
      : temMin
        ? `A partir de ${formatarNumero(config.min!, config.unidade)}.`
        : temMax
          ? `Até ${formatarNumero(config.max!, config.unidade)}.`
          : null;

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    // "1.234,5" (com vírgula): ponto é milhar. "12.5" (sem vírgula): ponto é decimal.
    const bruto = texto.trim().replace(/\s/g, "");
    const n = Number(bruto.includes(",") ? bruto.replace(/\./g, "").replace(",", ".") : bruto);
    if (texto.trim() === "" || !Number.isFinite(n)) return setAviso("Digite um número.");
    const fator = 10 ** config.casas;
    const arredondado = Math.round(n * fator) / fator;
    if ((temMin && arredondado < config.min!) || (temMax && arredondado > config.max!)) {
      return setAviso(`Esse número está fora do permitido. ${faixa ?? ""}`.trim());
    }
    setAviso(undefined);
    aoEnviar({ numero: arredondado });
  }

  return (
    <form className="flex flex-1 flex-col" onSubmit={enviar}>
      <div className="flex items-center gap-3">
        <input
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setAviso(undefined);
          }}
          inputMode={config.casas > 0 ? "decimal" : "numeric"}
          autoComplete="off"
          aria-label="Seu número"
          className="block h-20 w-full min-w-0 rounded-xl border-2 border-slate-200 bg-white px-4 text-center text-4xl font-semibold tabular-nums outline-none focus:border-marca"
        />
        {config.unidade && <span className="shrink-0 text-2xl text-slate-500">{config.unidade}</span>}
      </div>
      {faixa && <p className="mt-3 text-center text-sm text-slate-500">{faixa}</p>}
      {aviso && <p className="mt-3 text-center text-red-700">{aviso}</p>}
      <BotaoEnviar desabilitado={texto.trim() === ""} enviando={enviando} erro={erro} />
    </form>
  );
}

// Resposta aberta: texto livre. No telão, só se o instrutor aprovar, e sem o nome.
function Aberta({ config, anterior, enviando, erro, aoEnviar }: PropsControle<ConfigAberta>) {
  const [texto, setTexto] = useState(anterior && "texto" in anterior ? anterior.texto : "");
  const limpo = texto.replace(/\s+/g, " ").trim();
  const restam = config.max_caracteres - limpo.length;

  return (
    <form
      className="flex flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        if (limpo && restam >= 0) aoEnviar({ texto: limpo });
      }}
    >
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        maxLength={config.max_caracteres + 20}
        rows={5}
        aria-label="Sua resposta"
        className="block w-full rounded-xl border-2 border-slate-200 bg-white p-4 text-lg outline-none focus:border-marca"
      />
      <p className={`mt-2 text-right text-sm ${restam < 0 ? "text-red-700" : "text-slate-500"}`}>
        {restam >= 0 ? `${restam} caracteres restantes` : `${-restam} caracteres a mais`}
      </p>
      <p className="mt-1 text-sm text-slate-500">Sua resposta aparece sem o seu nome.</p>
      <BotaoEnviar desabilitado={!limpo || restam < 0} enviando={enviando} erro={erro} />
    </form>
  );
}
