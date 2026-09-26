"use client";

import { useState, useTransition } from "react";
import { estiloBotaoSecundario } from "@/components/ui";
import { gerarOutroCodigo } from "../acoes";

export default function BotaoNovoCodigo({ eventoId }: { eventoId: string }) {
  const [gerando, iniciar] = useTransition();
  const [erro, setErro] = useState<string>();

  function gerar() {
    const ok = window.confirm(
      "Gerar outro código de acesso?\n\nO código atual e o QR code já projetado deixam de funcionar para quem ainda não entrou. Quem já entrou continua na sala.",
    );
    if (!ok) return;
    setErro(undefined);
    iniciar(async () => {
      const resultado = await gerarOutroCodigo(eventoId);
      if (resultado.erro) setErro(resultado.erro);
    });
  }

  return (
    <div>
      <button type="button" onClick={gerar} disabled={gerando} className={estiloBotaoSecundario}>
        {gerando ? "Gerando…" : "Gerar outro código de acesso"}
      </button>
      {erro && <p className="mt-2 text-sm text-red-700">{erro}</p>}
    </div>
  );
}
