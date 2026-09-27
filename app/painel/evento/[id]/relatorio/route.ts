import { uuidValido } from "@/lib/formatos";
import { usuarioAtual } from "@/utils/auth";
import { gerarRelatorio } from "@/utils/relatorio";
import { criarClienteServidor } from "@/utils/supabase/server";

// Baixa o relatório do evento em Excel (uso interno da Efic). Só com login;
// o banco só entrega os eventos do próprio instrutor (ou todos, para o admin).
export async function GET(request: Request, { params }: RouteContext<"/painel/evento/[id]/relatorio">) {
  const { id } = await params;
  if (!uuidValido(id)) return new Response("Evento não encontrado.", { status: 404 });

  const { user, erro } = await usuarioAtual();
  if (erro) return new Response("Sem conexão com o Pulse agora. Tente de novo em instantes.", { status: 503 });
  if (!user) return Response.redirect(new URL("/login", request.url), 303);

  try {
    const relatorio = await gerarRelatorio(await criarClienteServidor(), id);
    if (!relatorio) return new Response("Evento não encontrado.", { status: 404 });

    const nomeSeguro = relatorio.nome.replace(/[^\p{L}\p{N} ._-]/gu, "").slice(0, 150);
    return new Response(new Uint8Array(relatorio.buffer as ArrayBuffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="relatorio-pulse.xlsx"; filename*=UTF-8''${encodeURIComponent(nomeSeguro)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("GET /painel/evento/relatorio:", e);
    return new Response("Não foi possível gerar o relatório agora. Tente de novo em instantes.", { status: 503 });
  }
}
