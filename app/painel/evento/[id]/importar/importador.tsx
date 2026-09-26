"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Aviso, estiloBotaoCompacto, estiloBotaoSecundario } from "@/components/ui";
import { gravarImportacao, previaImportacao, type LinhaPrevia, type SituacaoLinha } from "../../acoes";

const rotulo: Record<SituacaoLinha, string> = {
  nova: "Nova pessoa",
  existente: "Pessoa já existente",
  inscrita: "Já inscrita",
  erro: "Erro",
};

const cor: Record<SituacaoLinha, string> = {
  nova: "bg-emerald-100 text-emerald-800",
  existente: "bg-sky-100 text-sky-800",
  inscrita: "bg-slate-100 text-slate-600",
  erro: "bg-red-100 text-red-800",
};

export default function Importador({ eventoId }: { eventoId: string }) {
  const [texto, setTexto] = useState<string>();
  const [nomeArquivo, setNomeArquivo] = useState<string>();
  const [linhas, setLinhas] = useState<LinhaPrevia[]>();
  const [erro, setErro] = useState<string>();
  const [gravadas, setGravadas] = useState<number>();
  const [ocupado, iniciar] = useTransition();

  function escolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    setLinhas(undefined);
    setErro(undefined);
    setGravadas(undefined);
    if (!arquivo) return;
    setNomeArquivo(arquivo.name);

    iniciar(async () => {
      const conteudo = await arquivo.text(); // lido como UTF-8
      setTexto(conteudo);
      const previa = await previaImportacao(eventoId, conteudo);
      if (previa.erro) setErro(previa.erro);
      else setLinhas(previa.linhas);
    });
  }

  function gravar() {
    if (!texto) return;
    iniciar(async () => {
      const resultado = await gravarImportacao(eventoId, texto);
      if (resultado.erro) {
        setErro(resultado.erro);
      } else {
        setGravadas(resultado.gravadas ?? 0);
        setLinhas(undefined);
      }
    });
  }

  const contagem = (s: SituacaoLinha) => linhas?.filter((l) => l.situacao === s).length ?? 0;
  const aGravar = contagem("nova") + contagem("existente");

  if (gravadas !== undefined) {
    return (
      <div className="space-y-6">
        <Aviso tipo="sucesso">
          {gravadas === 1 ? "1 inscrição gravada." : `${gravadas} inscrições gravadas.`}
        </Aviso>
        <div className="flex flex-wrap gap-3">
          <Link href={`/painel/evento/${eventoId}`} className={estiloBotaoCompacto}>
            Ver inscritos
          </Link>
          <button type="button" onClick={() => setGravadas(undefined)} className={estiloBotaoSecundario}>
            Importar outra planilha
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Planilha (.csv)</span>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={escolherArquivo}
          disabled={ocupado}
          className="mt-2 block w-full text-base file:mr-4 file:h-11 file:rounded-lg file:border-0 file:bg-slate-100 file:px-4 file:font-medium file:text-slate-700 hover:file:bg-slate-200"
        />
      </label>

      {ocupado && <p className="text-slate-500">Lendo {nomeArquivo}…</p>}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {linhas && !ocupado && (
        <>
          <div className="flex flex-wrap gap-2 text-sm">
            {(["nova", "existente", "inscrita", "erro"] as const).map((s) => (
              <span key={s} className={`rounded-full px-3 py-1 ${cor[s]}`}>
                {rotulo[s]}: {contagem(s)}
              </span>
            ))}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Linha</th>
                  <th className="px-4 py-3 font-medium">Nome</th>
                  <th className="px-4 py-3 font-medium">E-mail</th>
                  <th className="px-4 py-3 font-medium">Cargo</th>
                  <th className="px-4 py-3 font-medium">Agência</th>
                  <th className="px-4 py-3 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {linhas.map((l) => (
                  <tr key={l.linha}>
                    <td className="px-4 py-3 text-slate-500">{l.linha}</td>
                    <td className="px-4 py-3">{l.nome}</td>
                    <td className="px-4 py-3">{l.email}</td>
                    <td className="px-4 py-3">{l.cargo}</td>
                    <td className="px-4 py-3">{l.agencia}</td>
                    <td className="px-4 py-3">
                      <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${cor[l.situacao]}`}>
                        {l.erro ?? rotulo[l.situacao]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <button type="button" onClick={gravar} disabled={aGravar === 0} className={estiloBotaoCompacto}>
              {aGravar === 1 ? "Gravar 1 inscrição" : `Gravar ${aGravar} inscrições`}
            </button>
            {contagem("erro") > 0 && (
              <p className="text-sm text-slate-600">
                As linhas com erro ficam de fora. Corrija na planilha e importe de novo depois.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
