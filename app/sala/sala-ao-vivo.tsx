"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useEstadoAoVivo } from "@/components/use-estado-ao-vivo";
import {
  formatarNumero,
  TAMANHO_PALAVRA,
  valoresDaEscala,
  type ConfigEscala,
  type ConfigMultipla,
  type ConfigNuvem,
  type ValorResposta,
} from "@/lib/atividades";
import type { EstadoSala } from "@/utils/sala";

type Atividade = NonNullable<EstadoSala["atividade"]>;

// Telas do celular (fatia 2): espera, atividade aberta, resposta enviada, votação encerrada.
// O celular NUNCA mostra resultado nem a referência da escala.
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
    // A chave faz a tela recomeçar do zero quando muda a atividade.
    conteudo = (
      <Responder
        key={atividade.id}
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
      <h1 className="text-2xl font-semibold leading-snug">{atividade.enunciado}</h1>
      <div className="mt-8 flex flex-1 flex-col">
        {atividade.tipo === "multipla" && <Multipla config={atividade.config as ConfigMultipla} {...props} />}
        {atividade.tipo === "escala" && <Escala config={atividade.config as ConfigEscala} {...props} />}
        {atividade.tipo === "nuvem" && <Nuvem config={atividade.config as ConfigNuvem} {...props} />}
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
