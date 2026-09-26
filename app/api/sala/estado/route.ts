import { iniciarCronometro } from "@/utils/cronometro";
import { json } from "@/utils/json";
import { lerSessao } from "@/utils/participante";

// Estado da sala para o celular do participante (consultado a cada aviso e a cada 15 s).
// Uma chamada só ao banco (sala_estado).
export async function GET() {
  const cronometro = iniciarCronometro();
  const { sala, erro } = await lerSessao();
  cronometro.marcar("banco");
  if (erro) return json({ erro: "Sem conexão com o Pulse agora." }, 503);
  if (!sala) return json({ erro: "sem_sessao" }, 401);
  return json(sala, 200, cronometro.cabecalho());
}
