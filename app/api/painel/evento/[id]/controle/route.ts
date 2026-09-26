import { uuidValido } from "@/lib/formatos";
import { usuarioAtual } from "@/utils/auth";
import { estadoControle } from "@/utils/controle";
import { json } from "@/utils/json";
import { criarClienteServidor } from "@/utils/supabase/server";

// Estado do controle do instrutor (consultado a cada aviso e a cada 15 s).
export async function GET(_request: Request, { params }: RouteContext<"/api/painel/evento/[id]/controle">) {
  const { id } = await params;
  if (!uuidValido(id)) return json({ erro: "Evento não encontrado." }, 404);

  const { user, erro } = await usuarioAtual();
  if (erro) return json({ erro: "Sem conexão com o Pulse agora." }, 503);
  if (!user) return json({ erro: "sem_sessao" }, 401);

  try {
    const estado = await estadoControle(await criarClienteServidor(), id);
    if (!estado) return json({ erro: "Evento não encontrado." }, 404);
    return json(estado);
  } catch (e) {
    console.error("GET /api/painel/evento/controle:", e);
    return json({ erro: "Sem conexão com o Pulse agora." }, 503);
  }
}
