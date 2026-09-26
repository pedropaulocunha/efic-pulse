import { after, type NextRequest } from "next/server";
import { iniciarCronometro } from "@/utils/cronometro";
import { json } from "@/utils/json";
import { participanteAtual } from "@/utils/participante";
import { responder } from "@/utils/sala";
import { avisarEvento } from "@/utils/tempo-real";

// Resposta do participante. Responder de novo com a votação aberta substitui a anterior.
export async function POST(request: NextRequest) {
  const cronometro = iniciarCronometro();
  const { participante, erro } = await participanteAtual();
  cronometro.marcar("sessao");
  if (erro) return json({ erro: "Sem conexão com o Pulse agora. Tente de novo." }, 503);
  if (!participante) return json({ erro: "sem_sessao" }, 401);

  let corpo: { atividade_id?: unknown; valor?: unknown };
  try {
    corpo = await request.json();
  } catch {
    return json({ erro: "Pedido inválido." }, 400);
  }

  try {
    const resultado = await responder(participante, corpo.atividade_id, corpo.valor);
    cronometro.marcar("gravacao");
    if (!resultado.ok) return json({ erro: resultado.erro }, resultado.status, cronometro.cabecalho());

    // Acorda o controle e o telão depois de responder ao celular, sem atrasá-lo.
    after(() => avisarEvento(participante.evento.id, "resposta"));
    return json({ ok: true }, 200, cronometro.cabecalho());
  } catch (e) {
    console.error("POST /api/sala/responder:", e);
    return json({ erro: "Não foi possível enviar agora. Tente de novo." }, 503);
  }
}
