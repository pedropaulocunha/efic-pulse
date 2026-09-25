import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { criarClienteServidor } from "@/utils/supabase/server";

// Tipos de link aceitos. Convite e recuperação levam a /definir-senha.
const tiposAceitos: EmailOtpType[] = ["invite", "recovery", "email", "email_change"];

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const tipo = searchParams.get("type") as EmailOtpType | null;

  const destino = request.nextUrl.clone();
  destino.search = "";

  if (tokenHash && tipo && tiposAceitos.includes(tipo)) {
    const supabase = await criarClienteServidor();
    const { error } = await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash });
    if (!error) {
      destino.pathname = tipo === "invite" || tipo === "recovery" ? "/definir-senha" : "/painel";
      return NextResponse.redirect(destino);
    }
  }

  destino.pathname = "/login";
  destino.searchParams.set("erro", "link-invalido");
  return NextResponse.redirect(destino);
}
