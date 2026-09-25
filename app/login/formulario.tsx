"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Aviso, estiloBotao, estiloCampo, estiloLink } from "@/components/ui";
import { criarClienteNavegador } from "@/utils/supabase/client";

export default function FormularioLogin({ mensagemInicial }: { mensagemInicial?: string }) {
  const router = useRouter();
  const [modo, setModo] = useState<"entrar" | "esqueci">("entrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | undefined>(mensagemInicial);
  const [sucesso, setSucesso] = useState<string>();

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(undefined);
    const supabase = criarClienteNavegador();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password: senha,
    });
    if (error) {
      setEnviando(false);
      setErro(
        error.status === 400
          ? "E-mail ou senha incorretos."
          : "Não foi possível entrar agora. Confira sua conexão e tente de novo.",
      );
      return;
    }
    router.replace("/painel");
    router.refresh();
  }

  async function pedirLink(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(undefined);
    const supabase = criarClienteNavegador();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase());
    setEnviando(false);
    if (error && (error.status === undefined || error.status === 429 || error.status >= 500)) {
      setErro(
        error.status === 429
          ? "Muitos pedidos seguidos. Aguarde alguns minutos e tente de novo."
          : "Não foi possível enviar agora. Tente de novo em instantes.",
      );
      return;
    }
    // Mesma resposta exista ou não o e-mail, para não revelar quem tem conta.
    setSucesso("Se este e-mail estiver cadastrado, você receberá um link para definir uma nova senha.");
  }

  function trocarModo(novo: "entrar" | "esqueci") {
    setModo(novo);
    setErro(undefined);
    setSucesso(undefined);
  }

  const campoEmail = (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">E-mail</span>
      <input
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={estiloCampo}
      />
    </label>
  );

  if (modo === "esqueci") {
    return (
      <form onSubmit={pedirLink} className="space-y-5">
        <p className="text-slate-600">
          Informe seu e-mail e enviaremos um link para você definir uma nova senha.
        </p>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        {sucesso && <Aviso tipo="sucesso">{sucesso}</Aviso>}
        {campoEmail}
        <button type="submit" disabled={enviando} className={estiloBotao}>
          {enviando ? "Enviando…" : "Enviar link"}
        </button>
        <button type="button" onClick={() => trocarModo("entrar")} className={`${estiloLink} block`}>
          Voltar para o login
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={entrar} className="space-y-5">
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {campoEmail}
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Senha</span>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className={estiloCampo}
        />
      </label>
      <button type="submit" disabled={enviando} className={estiloBotao}>
        {enviando ? "Entrando…" : "Entrar"}
      </button>
      <button type="button" onClick={() => trocarModo("esqueci")} className={`${estiloLink} block`}>
        Esqueci minha senha
      </button>
    </form>
  );
}
