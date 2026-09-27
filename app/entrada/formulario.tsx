"use client";

import { useActionState, useState } from "react";
import { entrar, type EstadoEntrada } from "@/app/acoes-entrada";
import { Aviso, estiloBotao, estiloCampo } from "@/components/ui";
import { normalizarCodigo } from "@/lib/formatos";

const inicial: EstadoEntrada = {};

export default function FormularioEntrada({ codigoInicial }: { codigoInicial: string }) {
  const [estado, acao, entrando] = useActionState(entrar, inicial);

  // Campo controlado: o React limpa formulários depois de cada envio.
  const [codigo, setCodigo] = useState(codigoInicial);

  return (
    <form action={acao} className="space-y-5">
      {estado.erro && <Aviso tipo="erro">{estado.erro}</Aviso>}

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Código do evento</span>
        <input
          name="codigo"
          required
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={4}
          autoFocus={!codigoInicial}
          value={codigo}
          onChange={(e) => setCodigo(normalizarCodigo(e.target.value).slice(0, 4))}
          className={`${estiloCampo} text-center font-mono text-2xl tracking-[0.4em] uppercase`}
        />
      </label>

      <button type="submit" disabled={entrando || codigo.length < 4} className={estiloBotao}>
        {entrando ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
