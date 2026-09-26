import "server-only";
import {
  configParaParticipante,
  validarValor,
  type ConfigAtividade,
  type EstadoAtividade,
  type TipoAtividade,
  type ValorResposta,
} from "@/lib/atividades";
import type { Participante } from "@/utils/participante";
import { criarClienteServico } from "@/utils/supabase/servico";

// O que o celular do participante vê. NUNCA inclui resultado nem a referência da escala.
export type EstadoSala = {
  eventoEncerrado: boolean;
  atividade: {
    id: string;
    tipo: TipoAtividade;
    enunciado: string;
    config: ConfigAtividade;
    estado: Exclude<EstadoAtividade, "fechada">;
  } | null;
  resposta: ValorResposta | null; // a resposta que ele já enviou, se houver
};

export async function estadoSala(participante: Participante): Promise<EstadoSala> {
  const db = criarClienteServico();

  const evento = await db
    .from("eventos")
    .select("estado, atividade_atual_id")
    .eq("id", participante.evento.id)
    .single();
  if (evento.error) throw evento.error;

  const base = { eventoEncerrado: evento.data.estado === "encerrado", atividade: null, resposta: null };
  if (!evento.data.atividade_atual_id) return base;

  const atividade = await db
    .from("atividades")
    .select("id, tipo, enunciado, config, estado")
    .eq("id", evento.data.atividade_atual_id)
    .single();
  if (atividade.error) throw atividade.error;
  const a = atividade.data;
  if (a.estado === "fechada") return base;

  let resposta: ValorResposta | null = null;
  if (a.estado === "aberta") {
    const r = await db
      .from("respostas")
      .select("valor")
      .eq("atividade_id", a.id)
      .eq("inscricao_id", participante.inscricaoId)
      .eq("rodada", 1)
      .maybeSingle();
    if (r.error) throw r.error;
    resposta = (r.data?.valor as ValorResposta) ?? null;
  }

  return {
    eventoEncerrado: base.eventoEncerrado,
    atividade: {
      id: a.id,
      tipo: a.tipo,
      enunciado: a.enunciado,
      config: configParaParticipante(a.tipo, a.config),
      estado: a.estado,
    },
    resposta,
  };
}

export type ResultadoResposta =
  | { ok: true }
  | { ok: false; status: 400 | 409; erro: string };

// Grava (ou substitui) a resposta. Só aceita atividade aberta do próprio evento.
export async function responder(
  participante: Participante,
  atividadeId: unknown,
  valorBruto: unknown,
): Promise<ResultadoResposta> {
  if (typeof atividadeId !== "string") return { ok: false, status: 400, erro: "Atividade inválida." };

  const db = criarClienteServico();
  const atividade = await db
    .from("atividades")
    .select("id, evento_id, tipo, config, estado")
    .eq("id", atividadeId)
    .maybeSingle();
  if (atividade.error) throw atividade.error;

  const a = atividade.data;
  if (!a || a.evento_id !== participante.evento.id) {
    return { ok: false, status: 400, erro: "Atividade inválida." };
  }
  if (a.estado !== "aberta") return { ok: false, status: 409, erro: "A votação já foi encerrada." };

  const conferido = validarValor(a.tipo, a.config, valorBruto);
  if ("erro" in conferido) return { ok: false, status: 400, erro: conferido.erro };

  const gravacao = await db
    .from("respostas")
    .upsert(
      { atividade_id: a.id, inscricao_id: participante.inscricaoId, rodada: 1, valor: conferido.valor },
      { onConflict: "atividade_id,inscricao_id,rodada" },
    );
  if (gravacao.error) {
    // O banco recusa se a votação fechou entre a conferência e a gravação.
    if (gravacao.error.code === "23514") return { ok: false, status: 409, erro: "A votação já foi encerrada." };
    throw gravacao.error;
  }
  return { ok: true };
}
