"use server";

import { redirect } from "next/navigation";
import { tentarCadastroNaSala, tentarEntrada } from "@/utils/entrada";
import { encerrarSessao } from "@/utils/participante";

export type EstadoEntrada = {
  erro?: string;
  // Depois de "não conferem", a tela oferece o cadastro "Não estou na lista".
  oferecerCadastro?: boolean;
};

export async function entrar(_anterior: EstadoEntrada, formData: FormData): Promise<EstadoEntrada> {
  const resultado = await tentarEntrada(formData.get("codigo"), formData.get("email"));
  if (!resultado.ok) return { erro: resultado.erro, oferecerCadastro: resultado.oferecerCadastro };
  redirect("/sala");
}

export async function cadastrarNaSala(
  _anterior: EstadoEntrada,
  formData: FormData,
): Promise<EstadoEntrada> {
  const resultado = await tentarCadastroNaSala({
    codigo: formData.get("codigo"),
    email: formData.get("email"),
    nome: formData.get("nome"),
    cargo: formData.get("cargo"),
    agencia: formData.get("agencia"),
  });
  if (!resultado.ok) return { erro: resultado.erro, oferecerCadastro: resultado.oferecerCadastro };
  redirect("/sala");
}

export async function sairDoAparelho() {
  await encerrarSessao();
  redirect("/");
}
