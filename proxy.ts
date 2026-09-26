import type { NextRequest } from "next/server";
import { atualizarSessao } from "@/utils/supabase/proxy";

export async function proxy(request: NextRequest) {
  return atualizarSessao(request);
}

export const config = {
  matcher: [
    // Tudo, menos arquivos estáticos e imagens, e menos as rotas do participante
    // e da projeção: elas não usam o login do Supabase, e com 40 celulares
    // consultando ao mesmo tempo, renovar sessão ali seria trabalho à toa.
    "/((?!_next/static|_next/image|favicon.ico|sala|api/sala|projecao|api/projecao|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|csv)$).*)",
  ],
};
