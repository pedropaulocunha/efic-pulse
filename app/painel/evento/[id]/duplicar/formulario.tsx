"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Aviso, estiloBotaoCompacto, estiloBotaoSecundario, estiloCampo } from "@/components/ui";
import { duplicarEvento, type EstadoFormularioEvento } from "../../acoes";

const inicial: EstadoFormularioEvento = {};

// Dados do evento novo. O resto (tema, duração, blocos e perguntas) vem do original.
export default function FormularioDuplicar({
  origemId,
  sugestao,
  cooperativas,
}: {
  origemId: string;
  sugestao: { nome_turma: string; local: string | null; cooperativa_id: string };
  cooperativas: { id: string; nome: string; uf: string }[];
}) {
  const [estado, acao, salvando] = useActionState(duplicarEvento.bind(null, origemId), inicial);
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }); // AAAA-MM-DD
  const [nome, setNome] = useState(sugestao.nome_turma);
  const [inicio, setInicio] = useState(hoje);
  const [fim, setFim] = useState(hoje);
  const [local, setLocal] = useState(sugestao.local ?? "");
  const [cooperativa, setCooperativa] = useState(sugestao.cooperativa_id);

  return (
    <form action={acao} className="space-y-6">
      {estado.erro && <Aviso tipo="erro">{estado.erro}</Aviso>}

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Nome da turma do evento novo</span>
        <input
          name="nome_turma"
          required
          maxLength={200}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className={estiloCampo}
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Início</span>
          <input
            name="data_inicio"
            type="date"
            required
            value={inicio}
            onChange={(e) => {
              setInicio(e.target.value);
              if (fim < e.target.value) setFim(e.target.value);
            }}
            className={estiloCampo}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Fim</span>
          <input
            name="data_fim"
            type="date"
            required
            min={inicio}
            value={fim}
            onChange={(e) => setFim(e.target.value)}
            className={estiloCampo}
          />
        </label>
      </div>
      <p className="-mt-3 text-sm text-slate-500">O código de acesso só vale até as 23h59 do último dia.</p>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Cooperativa</span>
        <select
          name="cooperativa_id"
          required
          value={cooperativa}
          onChange={(e) => setCooperativa(e.target.value)}
          className={estiloCampo}
        >
          {cooperativas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome} · {c.uf}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-sm text-slate-500">
          Cooperativa nova? Duplique com qualquer uma e depois troque em &quot;Editar evento&quot;.
        </span>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Local (opcional)</span>
        <input
          name="local"
          maxLength={200}
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          className={estiloCampo}
        />
      </label>

      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={salvando} className={estiloBotaoCompacto}>
          {salvando ? "Duplicando…" : "Duplicar evento"}
        </button>
        <Link href={`/painel/evento/${origemId}`} className={estiloBotaoSecundario}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
