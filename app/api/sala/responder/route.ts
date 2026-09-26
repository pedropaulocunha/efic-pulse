import { after, type NextRequest } from "next/server";
import { iniciarCronometro } from "@/utils/cronometro";
import { json } from "@/utils/json";
import { hashTokenAtual } from "@/utils/participante";
import { responder } from "@/utils/sala";
import { avisarEvento } from "@/utils/tempo-real";

// Resposta do participante. Responder de novo com a votação aberta substitui a anterior.
// Uma chamada só ao banco (sala_responder), que também confere a sessão.
export async function POST(request: NextRequest) {
  const cronometro = iniciarCronometro();
  const tokenHash = await hashTokenAtual();
  if (!tokenHash) return json({ erro: "sem_sessao" }, 401);

  let corpo: { atividade_id?: unknown; valor?: unknown };
  try {
    corpo = await request.json();
  } catch {
    return json({ erro: "Pedido inválido." }, 400);
  }

  try {
    const resultado = await responder(tokenHash, corpo.atividade_id, corpo.valor);
    cronometro.marcar("banco");
    if (!resultado.ok) return json({ erro: resultado.erro }, resultado.status, cronometro.cabecalho());

    // Acorda o controle e o telão depois de responder ao celular, sem atrasá-lo.
    after(() => avisarEvento(resultado.eventoId, "resposta"));
    return json({ ok: true }, 200, cronometro.cabecalho());
  } catch (e) {
    console.error("POST /api/sala/responder:", e);
    return json({ erro: "Não foi possível enviar agora. Tente de novo." }, 503);
  }
}
