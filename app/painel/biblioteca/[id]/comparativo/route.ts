import type { NextRequest } from "next/server";
import { uuidValido } from "@/lib/formatos";
import { usuarioAtual } from "@/utils/auth";
import { gerarComparativo } from "@/utils/comparativo";
import { criarClienteServidor } from "@/utils/supabase/server";

const DATA = /^\d{4}-\d{2}-\d{2}$/;

// Baixa o comparativo do modelo em Excel. Só admin (o banco confere, 0026).
// Filtros: ?coop=<id>&coop=<id>&de=AAAA-MM-DD&ate=AAAA-MM-DD
export async function GET(request: NextRequest, { params }: RouteContext<"/painel/biblioteca/[id]/comparativo">) {
  const { id } = await params;
  if (!uuidValido(id)) return new Response("Modelo não encontrado.", { status: 404 });

  const { user, erro } = await usuarioAtual();
  if (erro) return new Response("Sem conexão com o Pulse agora. Tente de novo em instantes.", { status: 503 });
  if (!user) return Response.redirect(new URL("/login", request.url), 303);

  const busca = request.nextUrl.searchParams;
  const de = busca.get("de") ?? "";
  const ate = busca.get("ate") ?? "";
  const filtros = {
    cooperativas: busca.getAll("coop").filter(uuidValido),
    de: DATA.test(de) ? de : null,
    ate: DATA.test(ate) ? ate : null,
  };

  try {
    const comparativo = await gerarComparativo(await criarClienteServidor(), id, filtros);
    if (!comparativo) return new Response("Comparativo disponível só para o admin.", { status: 403 });

    const nomeSeguro = comparativo.nome.replace(/[^\p{L}\p{N} ._-]/gu, "").slice(0, 150);
    return new Response(new Uint8Array(comparativo.buffer as ArrayBuffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="comparativo-pulse.xlsx"; filename*=UTF-8''${encodeURIComponent(nomeSeguro)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("GET /painel/biblioteca/comparativo:", e);
    return new Response("Não foi possível gerar o comparativo agora. Tente de novo em instantes.", { status: 503 });
  }
}
