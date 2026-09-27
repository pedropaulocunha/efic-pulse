"use server";

import { redirect } from "next/navigation";
import { tentarEntrada } from "@/utils/entrada";
import { encerrarSessao } from "@/utils/participante";

export type EstadoEntrada = { erro?: string };

export async function entrar(_anterior: EstadoEntrada, formData: FormData): Promise<EstadoEntrada> {
  const resultado = await tentarEntrada(formData.get("codigo"));
  if (!resultado.ok) return { erro: resultado.erro };
  redirect("/sala");
}

export async function sairDoAparelho() {
  await encerrarSessao();
  redirect("/");
}
