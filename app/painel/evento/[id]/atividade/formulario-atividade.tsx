"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Aviso, estiloBotaoCompacto, estiloBotaoSecundario, estiloCampo, estiloLink } from "@/components/ui";
import {
  degrausDaEscala,
  LIMITE_DEGRAUS,
  LIMITE_OPCOES,
  rotuloTipo,
  TIPOS,
  type ConfigAtividade,
  type ConfigEscala,
  type ConfigMultipla,
  type ConfigNuvem,
  type TipoAtividade,
} from "@/lib/atividades";
import { salvarAtividade, type EstadoFormularioAtividade } from "../../acoes-atividades";

const inicial: EstadoFormularioAtividade = {};

const exemplos: Record<TipoAtividade, string> = {
  multipla: "Ex.: Qual a principal causa de atraso na sua agência?",
  escala: "Ex.: Quanto da carteira em atraso vocês recuperam em 90 dias?",
  nuvem: "Ex.: Em uma palavra, o que trava a cobrança?",
};

function Campo({ rotulo, dica, children }: { rotulo: string; dica?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{rotulo}</span>
      {children}
      {dica && <span className="mt-1 block text-sm text-slate-500">{dica}</span>}
    </label>
  );
}

function texto(n: number | null | undefined) {
  return n === null || n === undefined ? "" : String(n);
}

export default function FormularioAtividade({
  eventoId,
  atividadeId,
  atividade,
}: {
  eventoId: string;
  atividadeId: string | null;
  atividade?: { tipo: TipoAtividade; enunciado: string; config: ConfigAtividade };
}) {
  const [estado, acao, salvando] = useActionState(salvarAtividade.bind(null, eventoId, atividadeId), inicial);

  const [tipo, setTipo] = useState<TipoAtividade>(atividade?.tipo ?? "multipla");
  const [enunciado, setEnunciado] = useState(atividade?.enunciado ?? "");

  const cMultipla = atividade?.tipo === "multipla" ? (atividade.config as ConfigMultipla) : null;
  const [opcoes, setOpcoes] = useState<string[]>(cMultipla?.opcoes ?? ["", "", ""]);

  const cEscala = atividade?.tipo === "escala" ? (atividade.config as ConfigEscala) : null;
  const [min, setMin] = useState(cEscala ? texto(cEscala.min) : "0");
  const [max, setMax] = useState(cEscala ? texto(cEscala.max) : "100");
  const [passo, setPasso] = useState(cEscala ? texto(cEscala.passo) : "5");
  const [unidade, setUnidade] = useState(cEscala?.unidade ?? "%");
  const [referencia, setReferencia] = useState(cEscala ? texto(cEscala.referencia) : "");

  const cNuvem = atividade?.tipo === "nuvem" ? (atividade.config as ConfigNuvem) : null;
  const [maxPalavras, setMaxPalavras] = useState(String(cNuvem?.max_palavras ?? 3));

  // Aviso imediato quando o passo não divide o intervalo (o servidor confere de novo).
  const numeros = [min, max, passo].map((v) => Number(v.replace(",", ".")));
  const escalaPreenchida = [min, max, passo].every((v) => v.trim() !== "") && numeros.every(Number.isFinite);
  const degraus = escalaPreenchida ? degrausDaEscala(numeros[0], numeros[1], numeros[2]) : null;
  const avisoEscala = !escalaPreenchida
    ? null
    : numeros[1] <= numeros[0]
      ? "O máximo precisa ser maior que o mínimo."
      : numeros[2] <= 0
        ? "O passo precisa ser maior que zero."
        : degraus === null
          ? `O passo ${passo} não divide o intervalo de ${min} a ${max}.`
          : degraus > LIMITE_DEGRAUS
            ? "Passo pequeno demais: mais de 1000 posições."
            : null;

  return (
    <form action={acao} className="space-y-6">
      {estado.erro && <Aviso tipo="erro">{estado.erro}</Aviso>}

      <input type="hidden" name="tipo" value={tipo} />
      {atividadeId ? (
        <p className="text-slate-600">
          Tipo: <strong className="font-medium text-slate-800">{rotuloTipo[tipo]}</strong>
        </p>
      ) : (
        <fieldset>
          <legend className="text-sm font-medium text-slate-700">Tipo</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {TIPOS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTipo(t)}
                aria-pressed={tipo === t}
                className={`h-12 rounded-lg border-2 px-3 font-medium ${
                  tipo === t ? "border-marca bg-marca text-white" : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                {rotuloTipo[t]}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <Campo rotulo="Pergunta" dica={exemplos[tipo]}>
        <textarea
          name="enunciado"
          required
          rows={2}
          maxLength={300}
          value={enunciado}
          onChange={(e) => setEnunciado(e.target.value)}
          className={`${estiloCampo} h-auto py-3`}
        />
      </Campo>

      {tipo === "multipla" && (
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-slate-700">Opções (de 2 a 6)</legend>
          {opcoes.map((o, i) => (
            <div key={i} className="flex gap-2">
              <input
                name="opcao"
                value={o}
                maxLength={120}
                placeholder={`Opção ${i + 1}`}
                onChange={(e) => setOpcoes((atual) => atual.map((x, j) => (j === i ? e.target.value : x)))}
                className={`${estiloCampo} mt-0`}
              />
              {opcoes.length > LIMITE_OPCOES.min && (
                <button
                  type="button"
                  onClick={() => setOpcoes((atual) => atual.filter((_, j) => j !== i))}
                  aria-label={`Remover opção ${i + 1}`}
                  className="h-12 w-12 shrink-0 rounded-lg border border-slate-300 text-xl text-slate-500 hover:bg-slate-50"
                >
                  ×
                </button>
              )}
            </div>
          ))}
          {opcoes.length < LIMITE_OPCOES.max && (
            <button type="button" onClick={() => setOpcoes((atual) => [...atual, ""])} className={estiloLink}>
              + Adicionar opção
            </button>
          )}
        </fieldset>
      )}

      {tipo === "escala" && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-4">
            <Campo rotulo="Mínimo">
              <input name="min" inputMode="decimal" required value={min} onChange={(e) => setMin(e.target.value)} className={estiloCampo} />
            </Campo>
            <Campo rotulo="Máximo">
              <input name="max" inputMode="decimal" required value={max} onChange={(e) => setMax(e.target.value)} className={estiloCampo} />
            </Campo>
            <Campo rotulo="Passo">
              <input name="passo" inputMode="decimal" required value={passo} onChange={(e) => setPasso(e.target.value)} className={estiloCampo} />
            </Campo>
            <Campo rotulo="Unidade">
              <input name="unidade" maxLength={20} value={unidade} onChange={(e) => setUnidade(e.target.value)} placeholder="%, dias, R$ mil" className={estiloCampo} />
            </Campo>
          </div>
          {avisoEscala ? (
            <p className="text-sm text-red-700">{avisoEscala}</p>
          ) : (
            degraus !== null && <p className="text-sm text-slate-500">O controle do celular terá {degraus + 1} posições.</p>
          )}
          <Campo
            rotulo="Referência (opcional)"
            dica="Um valor de mercado ou meta. Só aparece no telão quando você revelar, nunca no celular."
          >
            <input
              name="referencia"
              inputMode="decimal"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              className={`${estiloCampo} sm:max-w-48`}
            />
          </Campo>
        </div>
      )}

      {tipo === "nuvem" && (
        <Campo rotulo="Quantas palavras cada participante pode mandar">
          <select
            name="max_palavras"
            value={maxPalavras}
            onChange={(e) => setMaxPalavras(e.target.value)}
            className={`${estiloCampo} sm:max-w-48`}
          >
            <option value="1">1 palavra</option>
            <option value="2">Até 2 palavras</option>
            <option value="3">Até 3 palavras</option>
          </select>
        </Campo>
      )}

      <div className="flex flex-wrap gap-3 pt-2">
        <button type="submit" disabled={salvando || (tipo === "escala" && Boolean(avisoEscala))} className={estiloBotaoCompacto}>
          {salvando ? "Salvando…" : atividadeId ? "Salvar alterações" : "Criar atividade"}
        </button>
        <Link href={`/painel/evento/${eventoId}#atividades`} className={estiloBotaoSecundario}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
