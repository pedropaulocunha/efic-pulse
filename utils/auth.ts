import type { User } from "@supabase/supabase-js";
import { criarClienteServidor } from "@/utils/supabase/server";

export type ResultadoUsuario =
  // Sessão válida.
  | { user: User; erro: null }
  // Sem sessão ou sessão inválida (400, 401, 403): mandar para o login.
  | { user: null; erro: null }
  // Erro passageiro (rede, 408, 429, 5xx): NÃO é logout. Mostrar aviso.
  | { user: null; erro: string };

function erroPassageiro(status: number | undefined) {
  if (status === undefined || status === 0) return true;
  return status === 408 || status === 429 || status >= 500;
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function tentar(): Promise<ResultadoUsuario> {
  try {
    const supabase = await criarClienteServidor();
    const { data, error } = await supabase.auth.getUser();
    if (!error && data.user) return { user: data.user, erro: null };
    if (error && erroPassageiro(error.status)) {
      return { user: null, erro: error.message || "Falha de conexão" };
    }
    return { user: null, erro: null };
  } catch (e) {
    return { user: null, erro: e instanceof Error ? e.message : "Falha de conexão" };
  }
}

/**
 * Descobre o usuário da sessão distinguindo erro passageiro de logout.
 * Em erro passageiro, tenta de novo uma vez após 400 ms.
 *
 * Uso:
 *   const { user, erro } = await usuarioAtual();
 *   if (erro) return <AvisoErroConexao />;
 *   if (!user) redirect("/login");
 */
export async function usuarioAtual(): Promise<ResultadoUsuario> {
  const primeira = await tentar();
  if (!primeira.erro) return primeira;
  await esperar(400);
  return tentar();
}
