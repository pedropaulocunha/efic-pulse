import { json } from "@/utils/json";
import { participanteAtual } from "@/utils/participante";
import { estadoSala } from "@/utils/sala";

// Estado da sala para o celular do participante (consultado a cada aviso e a cada 15 s).
export async function GET() {
  const { participante, erro } = await participanteAtual();
  if (erro) return json({ erro: "Sem conexão com o Pulse agora." }, 503);
  if (!participante) return json({ erro: "sem_sessao" }, 401);

  try {
    return json(await estadoSala(participante));
  } catch (e) {
    console.error("GET /api/sala/estado:", e);
    return json({ erro: "Sem conexão com o Pulse agora." }, 503);
  }
}
