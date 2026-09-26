import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConfigAtividade, EstadoAtividade, TipoAtividade } from "@/lib/atividades";

// O que o controle do instrutor mostra. Usa o login do instrutor: as políticas
// garantem que ele só vê os próprios eventos. Das respostas, só o total (agregado).

export type AtividadeControle = {
  id: string;
  ordem: number;
  tipo: TipoAtividade;
  enunciado: string;
  config: ConfigAtividade;
  estado: EstadoAtividade;
  resultado_visivel: boolean;
  referencia_revelada: boolean;
  respostas: number;
};

export type EstadoControle = {
  evento: { id: string; nomeTurma: string; codigoAcesso: string; projecaoToken: string; atividadeAtualId: string | null };
  inscritos: number;
  atividades: AtividadeControle[];
};

export async function estadoControle(supabase: SupabaseClient, eventoId: string): Promise<EstadoControle | null> {
  const [evento, atividades, inscritos] = await Promise.all([
    supabase
      .from("eventos")
      .select("id, nome_turma, codigo_acesso, projecao_token, atividade_atual_id")
      .eq("id", eventoId)
      .maybeSingle(),
    supabase
      .from("atividades")
      .select("id, ordem, tipo, enunciado, config, estado, resultado_visivel, referencia_revelada")
      .eq("evento_id", eventoId)
      .order("ordem")
      .order("id"),
    supabase.from("inscricoes").select("id", { count: "exact", head: true }).eq("evento_id", eventoId),
  ]);
  if (evento.error) throw evento.error;
  if (atividades.error) throw atividades.error;
  if (inscritos.error) throw inscritos.error;
  if (!evento.data) return null;

  // Total de respostas das que já foram abertas, pela função agregada.
  const totais = await Promise.all(
    atividades.data.map(async (a) => {
      if (a.estado === "fechada") return 0;
      const r = await supabase.rpc("resultado_atividade", { atividade: a.id });
      if (r.error) throw r.error;
      return (r.data?.total as number) ?? 0;
    }),
  );

  return {
    evento: {
      id: evento.data.id,
      nomeTurma: evento.data.nome_turma,
      codigoAcesso: evento.data.codigo_acesso,
      projecaoToken: evento.data.projecao_token,
      atividadeAtualId: evento.data.atividade_atual_id,
    },
    inscritos: inscritos.count ?? 0,
    atividades: atividades.data.map((a, i) => ({ ...a, respostas: totais[i] })),
  };
}
