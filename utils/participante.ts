import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EstadoSala } from "@/utils/sala";
import { criarClienteServico } from "@/utils/supabase/servico";

// Sessão do participante: própria do Pulse, sem Supabase Auth.
// O cookie guarda um token aleatório; o banco guarda só o hash SHA-256 dele.

export const COOKIE_PARTICIPANTE = "pulse_participante";

const LIMITE_FALHAS = 10;
const JANELA_MS = 15 * 60 * 1000;

export type Participante = {
  sessaoId: string;
  inscricaoId: string;
  nome: string;
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

// Validade da sessão: fim do evento + 1 dia (horário de Brasília).
// Se o evento já passou da data, vale ao menos 12 horas a partir de agora.
function calcularExpiracao(dataFim: string) {
  const fim = new Date(`${dataFim}T23:59:59-03:00`);
  fim.setUTCDate(fim.getUTCDate() + 1);
  const minimo = new Date(Date.now() + 12 * 60 * 60 * 1000);
  return fim > minimo ? fim : minimo;
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

// Usada no cadastro "Não estou na lista". A entrada normal cria a sessão
// dentro da função sala_entrar (0013), com a mesma regra de validade.
export async function criarSessao(db: SupabaseClient, inscricaoId: string, dataFim: string) {
  const { token, tokenHash } = novoToken();
  const expira = calcularExpiracao(dataFim);

  const { error } = await db.from("sessoes_participante").insert({
    inscricao_id: inscricaoId,
    token_hash: tokenHash,
    expira_em: expira.toISOString(),
  });
  if (error) throw error;

  await gravarCookieSessao(token, expira);
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
// Limite de tentativas de entrada por IP
// ---------------------------------------------------------------

// Hash do IP com a chave secreta como tempero: o banco nunca vê o IP,
// e o hash não pode ser revertido testando todos os IPs possíveis.
export async function hashIpAtual() {
  const h = await headers();
  const ip =
    h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "desconhecido";
  return createHmac("sha256", process.env.SUPABASE_SECRET_KEY!).update(ip).digest("hex");
}

// Bloqueia depois de 10 tentativas erradas SEGUIDAS em 15 minutos pelo mesmo IP.
// Uma entrada certa zera a contagem: numa sala, dezenas de celulares saem pelo
// mesmo IP do Wi-Fi, e os erros de digitação de uns não podem travar a turma toda.
// Uma consulta só: as últimas tentativas, da mais nova para a mais velha.
export async function entradaBloqueada(db: SupabaseClient, ipHash: string) {
  const { data, error } = await db
    .from("tentativas_entrada")
    .select("sucesso")
    .eq("ip_hash", ipHash)
    .gte("criado_em", new Date(Date.now() - JANELA_MS).toISOString())
    .order("criado_em", { ascending: false })
    .limit(LIMITE_FALHAS);
  if (error) throw error;

  const ultimoSucesso = data.findIndex((t) => t.sucesso);
  const falhasSeguidas = ultimoSucesso === -1 ? data.length : ultimoSucesso;
  return falhasSeguidas >= LIMITE_FALHAS;
}

export async function registrarTentativa(db: SupabaseClient, ipHash: string, sucesso: boolean) {
  const { error } = await db.from("tentativas_entrada").insert({ ip_hash: ipHash, sucesso });
  if (error) throw error;

  // Faxina de vez em quando (1 em cada 20 tentativas), fora do caminho da resposta:
  // tentativas com mais de um dia não servem para nada.
  if (Math.random() < 0.05) {
    after(async () => {
      await db
        .from("tentativas_entrada")
        .delete()
        .lt("criado_em", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    });
  }
}
