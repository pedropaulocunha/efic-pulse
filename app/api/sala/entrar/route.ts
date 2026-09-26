import type { NextRequest } from "next/server";
import { iniciarCronometro } from "@/utils/cronometro";
import { tentarEntrada } from "@/utils/entrada";
import { json } from "@/utils/json";

// Entrada por código e e-mail em JSON. Mesma regra do formulário da página inicial
// (inclusive o limite de tentativas); existe para o teste de carga (scripts/carga).
export async function POST(request: NextRequest) {
  const cronometro = iniciarCronometro();
  let corpo: { codigo?: unknown; email?: unknown };
  try {
    corpo = await request.json();
  } catch {
    return json({ erro: "Pedido inválido." }, 400);
  }

  const resultado = await tentarEntrada(corpo.codigo, corpo.email, cronometro);
  if (!resultado.ok) return json({ erro: resultado.erro }, 400, cronometro.cabecalho());
  return json({ ok: true }, 200, cronometro.cabecalho());
}
