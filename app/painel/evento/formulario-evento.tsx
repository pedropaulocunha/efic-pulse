"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Aviso, estiloBotaoCompacto, estiloBotaoSecundario, estiloCampo } from "@/components/ui";
import { UFS } from "@/lib/formatos";
import { salvarEvento, type EstadoFormularioEvento } from "./acoes";

export type Cooperativa = { id: string; nome: string; uf: string };

export type DadosEvento = {
  cooperativa_id: string;
  nome_turma: string;
  data_inicio: string;
  data_fim: string;
  local: string | null;
  tema: string | null;
  duracao_min: number | null;
};

const inicial: EstadoFormularioEvento = {};

function Campo({ rotulo, dica, children }: { rotulo: string; dica?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{rotulo}</span>
      {children}
      {dica && <span className="mt-1 block text-sm text-slate-500">{dica}</span>}
    </label>
  );
}

export default function FormularioEvento({
  eventoId,
  cooperativas,
  evento,
  voltarPara,
}: {
  eventoId: string | null;
  cooperativas: Cooperativa[];
  evento?: DadosEvento;
  voltarPara: string;
}) {
  const [estado, acao, salvando] = useActionState(salvarEvento.bind(null, eventoId), inicial);

  // Campos controlados: o React limpa formulários depois de cada envio.
  const [cooperativaId, setCooperativaId] = useState(
    evento?.cooperativa_id ?? (cooperativas.length === 0 ? "nova" : ""),
  );
  const [novaNome, setNovaNome] = useState("");
  const [novaUf, setNovaUf] = useState("");
  const [novaCentral, setNovaCentral] = useState("");
  const [nomeTurma, setNomeTurma] = useState(evento?.nome_turma ?? "");
  const [dataInicio, setDataInicio] = useState(evento?.data_inicio ?? "");
  const [dataFim, setDataFim] = useState(evento?.data_fim ?? "");
  const [local, setLocal] = useState(evento?.local ?? "");
  const [duracao, setDuracao] = useState(evento?.duracao_min?.toString() ?? "");
  const [tema, setTema] = useState(evento?.tema ?? "");

  return (
    <form action={acao} className="space-y-6">
      {estado.erro && <Aviso tipo="erro">{estado.erro}</Aviso>}

      <Campo rotulo="Cooperativa">
        <select
          name="cooperativa_id"
          required
          value={cooperativaId}
          onChange={(e) => setCooperativaId(e.target.value)}
          className={estiloCampo}
        >
          <option value="" disabled>
            Escolha…
          </option>
          {cooperativas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome} ({c.uf})
            </option>
          ))}
          <option value="nova">+ Nova cooperativa</option>
        </select>
      </Campo>

      {cooperativaId === "nova" && (
        <div className="grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-[1fr_7rem]">
          <Campo rotulo="Nome da nova cooperativa">
            <input
              name="cooperativa_nome"
              required
              value={novaNome}
              onChange={(e) => setNovaNome(e.target.value)}
              className={estiloCampo}
            />
          </Campo>
          <Campo rotulo="UF">
            <select
              name="cooperativa_uf"
              required
              value={novaUf}
              onChange={(e) => setNovaUf(e.target.value)}
              className={estiloCampo}
            >
              <option value="" disabled>
                UF
              </option>
              {UFS.map((uf) => (
                <option key={uf}>{uf}</option>
              ))}
            </select>
          </Campo>
          <div className="sm:col-span-2">
            <Campo rotulo="Central (opcional)">
              <input
                name="cooperativa_central"
                value={novaCentral}
                onChange={(e) => setNovaCentral(e.target.value)}
                className={estiloCampo}
              />
            </Campo>
          </div>
        </div>
      )}

      <Campo rotulo="Nome da turma">
        <input
          name="nome_turma"
          required
          value={nomeTurma}
          onChange={(e) => setNomeTurma(e.target.value)}
          className={estiloCampo}
        />
      </Campo>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Data de início">
          <input
            name="data_inicio"
            type="date"
            required
            value={dataInicio}
            onChange={(e) => {
              setDataInicio(e.target.value);
              if (!dataFim || dataFim < e.target.value) setDataFim(e.target.value);
            }}
            className={estiloCampo}
          />
        </Campo>
        <Campo rotulo="Data de fim">
          <input
            name="data_fim"
            type="date"
            required
            min={dataInicio || undefined}
            value={dataFim}
            onChange={(e) => setDataFim(e.target.value)}
            className={estiloCampo}
          />
        </Campo>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <Campo rotulo="Local">
          <input name="local" value={local} onChange={(e) => setLocal(e.target.value)} className={estiloCampo} />
        </Campo>
        <Campo rotulo="Duração (minutos)">
          <input
            name="duracao_min"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={duracao}
            onChange={(e) => setDuracao(e.target.value)}
            className={estiloCampo}
          />
        </Campo>
      </div>

      <Campo rotulo="Tema">
        <input name="tema" value={tema} onChange={(e) => setTema(e.target.value)} className={estiloCampo} />
      </Campo>

      <div className="flex flex-wrap gap-3 pt-2">
        <button type="submit" disabled={salvando} className={estiloBotaoCompacto}>
          {salvando ? "Salvando…" : eventoId ? "Salvar alterações" : "Criar evento"}
        </button>
        <Link href={voltarPara} className={estiloBotaoSecundario}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
