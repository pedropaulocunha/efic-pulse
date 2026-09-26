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

// O participante já vem com o estado do evento e a atividade atual (participanteAtual),
// então aqui bastam duas consultas, feitas juntas: a atividade e a resposta dele.
export async function estadoSala(participante: Participante): Promise<EstadoSala> {
  const db = criarClienteServico();
  const atualId = participante.evento.atividade_atual_id;

  const base = { eventoEncerrado: participante.evento.estado === "encerrado", atividade: null, resposta: null };
  if (!atualId) return base;

  const [atividade, minhaResposta] = await Promise.all([
    db.from("atividades").select("id, tipo, enunciado, config, estado").eq("id", atualId).single(),
    db
      .from("respostas")
      .select("valor")
      .eq("atividade_id", atualId)
      .eq("inscricao_id", participante.inscricaoId)
      .eq("rodada", 1)
      .maybeSingle(),
  ]);
  if (atividade.error) throw atividade.error;
  if (minhaResposta.error) throw minhaResposta.error;

  const a = atividade.data;
  if (a.estado === "fechada") return base;
  // A resposta enviada só importa com a votação aberta (para "Mudar minha resposta").
  const resposta = a.estado === "aberta" ? ((minhaResposta.data?.valor as ValorResposta) ?? null) : null;

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
