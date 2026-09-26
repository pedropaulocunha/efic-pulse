"use client";

import { useActionState, useState } from "react";
import { cadastrarNaSala, entrar, type EstadoEntrada } from "@/app/acoes-entrada";
import { Aviso, estiloBotao, estiloCampo, estiloLink } from "@/components/ui";
import { normalizarCodigo } from "@/lib/formatos";

const inicial: EstadoEntrada = {};

export default function FormularioEntrada({ codigoInicial }: { codigoInicial: string }) {
  const [estadoEntrar, acaoEntrar, entrando] = useActionState(entrar, inicial);
  const [estadoCadastro, acaoCadastro, cadastrando] = useActionState(cadastrarNaSala, inicial);

  // Campos controlados: o React limpa formulários depois de cada envio.
  const [codigo, setCodigo] = useState(codigoInicial);
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [cargo, setCargo] = useState("");
  const [agencia, setAgencia] = useState("");
  const [cadastroAberto, setCadastroAberto] = useState(false);

  const enviando = entrando || cadastrando;
  const erro = cadastroAberto ? estadoCadastro.erro ?? estadoEntrar.erro : estadoEntrar.erro;
  const oferecerCadastro = estadoEntrar.oferecerCadastro || estadoCadastro.oferecerCadastro;

  return (
    <form action={cadastroAberto ? acaoCadastro : acaoEntrar} className="space-y-5">
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Código do evento</span>
        <input
          name="codigo"
          required
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={4}
          value={codigo}
          onChange={(e) => setCodigo(normalizarCodigo(e.target.value).slice(0, 4))}
          className={`${estiloCampo} text-center font-mono text-2xl tracking-[0.4em] uppercase`}
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Seu e-mail</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={estiloCampo}
        />
      </label>

      {cadastroAberto && (
        <div className="space-y-5 rounded-xl bg-slate-50 p-4">
          <p className="text-sm text-slate-600">
            Preencha seus dados para entrar. O instrutor confirma sua inscrição depois.
          </p>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Nome</span>
            <input
              name="nome"
              required
              autoComplete="name"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className={estiloCampo}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Cargo</span>
            <input
              name="cargo"
              autoComplete="organization-title"
              value={cargo}
              onChange={(e) => setCargo(e.target.value)}
              className={estiloCampo}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Agência</span>
            <input
              name="agencia"
              value={agencia}
              onChange={(e) => setAgencia(e.target.value)}
              className={estiloCampo}
            />
          </label>
        </div>
      )}

      <button type="submit" disabled={enviando} className={estiloBotao}>
        {enviando ? "Entrando…" : "Entrar"}
      </button>

      {oferecerCadastro && !cadastroAberto && (
        <button type="button" onClick={() => setCadastroAberto(true)} className={`${estiloLink} block`}>
          Não estou na lista
        </button>
      )}
      {cadastroAberto && (
        <button type="button" onClick={() => setCadastroAberto(false)} className={`${estiloLink} block`}>
          Já estou na lista
        </button>
      )}
    </form>
  );
}
