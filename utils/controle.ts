import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConfigAtividade, EstadoAtividade, TipoAtividade } from "@/lib/atividades";

// O que o controle do instrutor mostra. Usa o login do instrutor: as políticas
// garantem que ele só vê os próprios eventos. Das respostas, só o total (agregado)
// e, para moderar, as palavras da nuvem e os textos das abertas — nunca quem escreveu.

export type AtividadeControle = {
  id: string;
  ordem: number;
  tipo: TipoAtividade;
  enunciado: string;
  config: ConfigAtividade;
  estado: EstadoAtividade;
  resultado_visivel: boolean;
  referencia_revelada: boolean;
  rodada_atual: number;
  respostas: number; // da rodada atual
};

export type Moderacao =
  | {
      tipo: "nuvem";
      atividadeId: string;
      palavras: { palavra: string; chave: string; n: number }[]; // as que aparecem no telão
      ocultas: string[]; // chaves ocultadas pelo instrutor
    }
  | {
      tipo: "aberta";
      atividadeId: string;
      // aprovada: null = esperando; true = no mural; false = recusada
      respostas: { id: string; texto: string; aprovada: boolean | null }[];
    };

export type EstadoControle = {
  evento: { id: string; nomeTurma: string; codigoAcesso: string; projecaoToken: string; atividadeAtualId: string | null };
  inscritos: number;
  atividades: AtividadeControle[];
  moderacao: Moderacao | null;
};

async function moderacaoDa(
  supabase: SupabaseClient,
  atividade: AtividadeControle | undefined,
): Promise<Moderacao | null> {
  if (!atividade || atividade.estado === "fechada") return null;

  if (atividade.tipo === "nuvem") {
    const [resultado, ocultas] = await Promise.all([
      supabase.rpc("resultado_atividade", { atividade: atividade.id }),
      supabase.from("palavras_ocultas").select("chave").eq("atividade_id", atividade.id).order("chave"),
    ]);
    if (resultado.error) throw resultado.error;
    if (ocultas.error) throw ocultas.error;
    return {
      tipo: "nuvem",
      atividadeId: atividade.id,
      palavras: resultado.data?.palavras ?? [],
      ocultas: ocultas.data.map((o) => o.chave),
    };
  }

  if (atividade.tipo === "aberta") {
    const { data, error } = await supabase.rpc("respostas_abertas", { atividade: atividade.id });
    if (error) throw error;
    return { tipo: "aberta", atividadeId: atividade.id, respostas: data ?? [] };
  }

  return null;
}

export async function estadoControle(
  supabase: SupabaseClient,
  eventoId: string,
  moderarId?: string | null,
): Promise<EstadoControle | null> {
  const [evento, atividades, inscritos] = await Promise.all([
    supabase
      .from("eventos")
      .select("id, nome_turma, codigo_acesso, projecao_token, atividade_atual_id")
      .eq("id", eventoId)
      .maybeSingle(),
    supabase
      .from("atividades")
      .select("id, ordem, tipo, enunciado, config, estado, resultado_visivel, referencia_revelada, rodada_atual")
      .eq("evento_id", eventoId)
      .order("ordem")
      .order("id"),
    supabase.from("inscricoes").select("id", { count: "exact", head: true }).eq("evento_id", eventoId),
  ]);
  if (evento.error) throw evento.error;
  if (atividades.error) throw atividades.error;
  if (inscritos.error) throw inscritos.error;
  if (!evento.data) return null;

  // Total de respostas (rodada atual) das que já foram abertas, pela função agregada.
  const totais = await Promise.all(
    atividades.data.map(async (a) => {
      if (a.estado === "fechada") return 0;
      const r = await supabase.rpc("resultado_atividade", { atividade: a.id });
      if (r.error) throw r.error;
      return (r.data?.total as number) ?? 0;
    }),
  );
  const lista: AtividadeControle[] = atividades.data.map((a, i) => ({ ...a, respostas: totais[i] }));

  return {
    evento: {
      id: evento.data.id,
      nomeTurma: evento.data.nome_turma,
      codigoAcesso: evento.data.codigo_acesso,
      projecaoToken: evento.data.projecao_token,
      atividadeAtualId: evento.data.atividade_atual_id,
    },
    inscritos: inscritos.count ?? 0,
    atividades: lista,
    moderacao: await moderacaoDa(supabase, lista.find((a) => a.id === moderarId)),
  };
}
