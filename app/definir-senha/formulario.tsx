"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Aviso, estiloBotao, estiloCampo } from "@/components/ui";
import { criarClienteNavegador } from "@/utils/supabase/client";

const TAMANHO_MINIMO = 8;

export default function FormularioSenha() {
  const router = useRouter();
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string>();

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(undefined);
    if (senha.length < TAMANHO_MINIMO) {
      setErro(`A senha precisa ter pelo menos ${TAMANHO_MINIMO} caracteres.`);
      return;
    }
    if (senha !== confirmacao) {
      setErro("As duas senhas não são iguais.");
      return;
    }
    setEnviando(true);
    const supabase = criarClienteNavegador();
    const { error } = await supabase.auth.updateUser({ password: senha });
    if (error) {
      setEnviando(false);
      if (error.code === "same_password") {
        setErro("A nova senha precisa ser diferente da anterior.");
      } else if (error.code === "weak_password") {
        setErro("Senha fraca. Use uma senha mais longa, misturando letras e números.");
      } else if (error.status === 401 || error.status === 403) {
        setErro("Seu link expirou. Peça um novo em \"Esqueci minha senha\" na tela de login.");
      } else {
        setErro("Não foi possível salvar agora. Tente de novo em instantes.");
      }
      return;
    }
    router.replace("/painel");
    router.refresh();
  }

  return (
    <form onSubmit={salvar} className="space-y-5">
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Nova senha</span>
        <input
          type="password"
          required
          autoComplete="new-password"
          minLength={TAMANHO_MINIMO}
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className={estiloCampo}
        />
        <span className="mt-1 block text-sm text-slate-500">
          Pelo menos {TAMANHO_MINIMO} caracteres.
        </span>
      </label>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Repita a senha</span>
        <input
          type="password"
          required
          autoComplete="new-password"
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
          className={estiloCampo}
        />
      </label>
      <button type="submit" disabled={enviando} className={estiloBotao}>
        {enviando ? "Salvando…" : "Salvar e entrar"}
      </button>
    </form>
  );
}
