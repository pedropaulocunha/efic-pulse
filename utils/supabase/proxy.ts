import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Renova o cookie da sessão. Não redireciona ninguém: quem decide
// o acesso é cada página, via usuarioAtual().
export async function atualizarSessao(request: NextRequest) {
  let resposta = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesParaGravar, cabecalhos) {
          cookiesParaGravar.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          resposta = NextResponse.next({ request });
          cookiesParaGravar.forEach(({ name, value, options }) =>
            resposta.cookies.set(name, value, options),
          );
          Object.entries(cabecalhos ?? {}).forEach(([nome, valor]) =>
            resposta.headers.set(nome, valor),
          );
        },
      },
    },
  );

  // Não coloque código entre a criação do cliente e esta chamada.
  // Falha aqui não derruba a requisição: a página trata o erro.
  try {
    await supabase.auth.getClaims();
  } catch {
    // erro passageiro de rede; a página decide o que mostrar
  }

  return resposta;
}
