import { json } from "@/utils/json";
import { estadoProjecao } from "@/utils/projecao";

// Estado do telão. Sem login: o link da projeção só mostra, não comanda.
export async function GET(_request: Request, { params }: RouteContext<"/api/projecao/[token]">) {
  const { token } = await params;
  try {
    const estado = await estadoProjecao(token);
    if (!estado) return json({ erro: "Projeção não encontrada." }, 404);
    return json(estado);
  } catch (e) {
    console.error("GET /api/projecao:", e);
    return json({ erro: "Sem conexão com o Pulse agora." }, 503);
  }
}
