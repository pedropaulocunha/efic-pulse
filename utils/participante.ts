import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
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

export async function criarSessao(db: SupabaseClient, inscricaoId: string, dataFim: string) {
  const token = randomBytes(32).toString("base64url");
  const expira = calcularExpiracao(dataFim);

  const { error } = await db.from("sessoes_participante").insert({
    inscricao_id: inscricaoId,
    token_hash: hashToken(token),
    expira_em: expira.toISOString(),
  });
  if (error) throw error;

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_PARTICIPANTE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expira,
  });
}

export async function participanteAtual(): Promise<ResultadoParticipante> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_PARTICIPANTE)?.value;
  if (!token) return { participante: null, erro: null };

  try {
    const db = criarClienteServico();
    const { data, error } = await db
      .from("sessoes_participante")
      .select(
        "id, expira_em, ultimo_acesso, inscricao:inscricoes(id, pessoa:pessoas(nome), evento:eventos(id, nome_turma, codigo_acesso, estado, cooperativa:cooperativas(nome)))",
      )
      .eq("token_hash", hashToken(token))
      .maybeSingle();

    if (error) return { participante: null, erro: error.message };
    if (!data) return { participante: null, erro: null };

    if (new Date(data.expira_em) <= new Date()) {
      await db.from("sessoes_participante").delete().eq("id", data.id);
      return { participante: null, erro: null };
    }

    // Registra o acesso, no máximo a cada 5 minutos, para não gravar a cada tela.
    if (Date.now() - new Date(data.ultimo_acesso).getTime() > 5 * 60 * 1000) {
      await db
        .from("sessoes_participante")
        .update({ ultimo_acesso: new Date().toISOString() })
        .eq("id", data.id);
    }

    // Sem os tipos gerados do banco, o formato das relações vem como desconhecido.
    const inscricao = data.inscricao as unknown as {
      id: string;
      pessoa: { nome: string } | null;
      evento: (Omit<Participante["evento"], "cooperativa"> & { cooperativa: { nome: string } | null }) | null;
    } | null;
    if (!inscricao?.evento) return { participante: null, erro: null };

    return {
      participante: {
        sessaoId: data.id,
        inscricaoId: inscricao.id,
        nome: inscricao.pessoa?.nome ?? "",
        evento: { ...inscricao.evento, cooperativa: inscricao.evento.cooperativa?.nome ?? null },
      },
      erro: null,
    };
  } catch (e) {
    return { participante: null, erro: e instanceof Error ? e.message : "Falha de conexão" };
  }
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
export async function entradaBloqueada(db: SupabaseClient, ipHash: string) {
  let desde = new Date(Date.now() - JANELA_MS).toISOString();

  const ultimoSucesso = await db
    .from("tentativas_entrada")
    .select("criado_em")
    .eq("ip_hash", ipHash)
    .eq("sucesso", true)
    .gte("criado_em", desde)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (ultimoSucesso.error) throw ultimoSucesso.error;
  if (ultimoSucesso.data) desde = ultimoSucesso.data.criado_em;

  const falhas = await db
    .from("tentativas_entrada")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .eq("sucesso", false)
    .gt("criado_em", desde);
  if (falhas.error) throw falhas.error;

  return (falhas.count ?? 0) >= LIMITE_FALHAS;
}

export async function registrarTentativa(db: SupabaseClient, ipHash: string, sucesso: boolean) {
  await db.from("tentativas_entrada").insert({ ip_hash: ipHash, sucesso });
  // Faxina: tentativas com mais de um dia não servem para nada.
  await db
    .from("tentativas_entrada")
    .delete()
    .lt("criado_em", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
}
