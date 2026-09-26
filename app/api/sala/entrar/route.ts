import type { NextRequest } from "next/server";
import { tentarEntrada } from "@/utils/entrada";
import { json } from "@/utils/json";

// Entrada por código e e-mail em JSON. Mesma regra do formulário da página inicial
// (inclusive o limite de tentativas); existe para o teste de carga (scripts/carga).
export async function POST(request: NextRequest) {
  let corpo: { codigo?: unknown; email?: unknown };
  try {
    corpo = await request.json();
  } catch {
    return json({ erro: "Pedido inválido." }, 400);
  }

  const resultado = await tentarEntrada(corpo.codigo, corpo.email);
  if (!resultado.ok) return json({ erro: resultado.erro }, 400);
  return json({ ok: true });
}
