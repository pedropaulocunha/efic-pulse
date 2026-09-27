import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import type { EstadoSala } from "@/utils/sala";
import { criarClienteServico } from "@/utils/supabase/servico";

// Sessão do participante: própria do Pulse, sem Supabase Auth.
// O cookie guarda um token aleatório; o banco guarda só o hash SHA-256 dele.

export const COOKIE_PARTICIPANTE = "pulse_participante";

export type Participante = {
  sessaoId: string;
  inscricaoId: string;
  nome: string | null; // participante anônimo não tem nome
  evento: {
    id: string;
    nome_turma: string;
    codigo_acesso: string;
    estado: "planejamento" | "ao_vivo" | "encerrado";
    cooperativa: string | null;
    atividade_atual_id: string | null;
  };
};

export type ResultadoParticipante =
  | { participante: Participante; erro: null }
  // Sem sessão, sessão vencida ou desconhecida: voltar para a entrada.
  | { participante: null; erro: null }
  // Falha passageira ao consultar o banco: NÃO é saída. Mostrar aviso.
  | { participante: null; erro: string };

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

// Token aleatório de 32 bytes: vai para o cookie; o banco recebe só o hash.
export function novoToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

export async function gravarCookieSessao(token: string, expira: Date) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_PARTICIPANTE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expira,
  });
}

// Hash do token do cookie deste aparelho (null se não há sessão).
export async function hashTokenAtual() {
  const token = (await cookies()).get(COOKIE_PARTICIPANTE)?.value;
  return token ? hashToken(token) : null;
}

export type ResultadoSessao =
  | { participante: Participante; sala: EstadoSala; erro: null }
  | { participante: null; sala: null; erro: string | null };

// Uma chamada só ao banco (função sala_estado, 0013): quem é o participante,
// o evento, a atividade atual e a resposta dele. Nunca inclui resultado.
export async function lerSessao(): Promise<ResultadoSessao> {
  const tokenHash = await hashTokenAtual();
  if (!tokenHash) return { participante: null, sala: null, erro: null };

  try {
    const { data, error } = await criarClienteServico().rpc("sala_estado", { token_hash: tokenHash });
    if (error) return { participante: null, sala: null, erro: error.message };
    if (!data) return { participante: null, sala: null, erro: null }; // sessão inexistente ou vencida
    return { participante: data.participante as Participante, sala: data.sala as EstadoSala, erro: null };
  } catch (e) {
    return { participante: null, sala: null, erro: e instanceof Error ? e.message : "Falha de conexão" };
  }
}

export async function participanteAtual(): Promise<ResultadoParticipante> {
  const { participante, erro } = await lerSessao();
  if (participante) return { participante, erro: null };
  return { participante: null, erro };
}

export async function encerrarSessao() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_PARTICIPANTE)?.value;
  if (token) {
    const db = criarClienteServico();
    await db.from("sessoes_participante").delete().eq("token_hash", hashToken(token));
  }
  cookieStore.delete(COOKIE_PARTICIPANTE);
}

// ---------------------------------------------------------------
// Hash do IP para o limite de tentativas de entrada (a regra fica em sala_entrar_codigo, 0022)
// ---------------------------------------------------------------

// Hash do IP com a chave secreta como tempero: o banco nunca vê o IP,
// e o hash não pode ser revertido testando todos os IPs possíveis.
export async function hashIpAtual() {
  const h = await headers();
  const ip =
    h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "desconhecido";
  return createHmac("sha256", process.env.SUPABASE_SECRET_KEY!).update(ip).digest("hex");
}
