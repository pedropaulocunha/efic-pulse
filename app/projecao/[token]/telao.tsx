"use client";

import { useState } from "react";
import { Marca } from "@/components/marca";
import { TelaProjecao } from "@/components/tela-projecao";
import { useEstadoAoVivo } from "@/components/use-estado-ao-vivo";
import type { EstadoProjecao } from "@/utils/projecao";

// Página da projeção: o desenho do telão (components/tela-projecao.tsx) em tela cheia.
export default function Telao({
  token,
  inicial,
  endereco,
}: {
  token: string;
  inicial: EstadoProjecao;
  endereco: string;
}) {
  const [removida, setRemovida] = useState(false);
  const { dados, semConexao } = useEstadoAoVivo<EstadoProjecao>(
    `/api/projecao/${token}`,
    inicial.evento.id,
    inicial,
    { ouvirRespostas: true, aoNaoEncontrar: () => setRemovida(true) },
  );

  if (removida) {
    return (
      <main className="flex h-screen w-screen flex-col items-center justify-center gap-[4vh] bg-white text-center">
        <p className="text-[2.6vw] text-slate-600">Esta projeção não existe mais.</p>
        <Marca className="text-[2.4vw]" />
      </main>
    );
  }

  return (
    <main className="h-screen w-screen">
      <TelaProjecao evento={dados.evento} atividade={dados.atividade} endereco={endereco} semConexao={semConexao} />
    </main>
  );
}
