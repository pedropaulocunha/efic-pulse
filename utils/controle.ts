import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  TIPOS_COM_REFERENCIA,
  TIPOS_COM_RODADAS,
  type ConfigAtividade,
  type EstadoAtividade,
  type TipoAtividade,
} from "@/lib/atividades";
import { ordenarPorBloco, type Bloco } from "@/lib/blocos";
import type { EstadoProjecao, ResultadoAgregado } from "@/utils/projecao";

// O que o controle do instrutor mostra. Usa o login do instrutor: as políticas
// garantem que ele só vê os próprios eventos. Das respostas, só o total (agregado)
// e, para moderar, as palavras da nuvem e os textos das abertas — nunca quem escreveu.
// A atividade selecionada vem também como "prévia": o que o telão mostraria com o
// resultado à vista. Fica só no controle (com login), nunca no link da projeção.

export type AtividadeControle = {
  id: string;
  ordem: number;
  bloco_id: string | null;
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
  evento: {
    id: string;
    nomeTurma: string;
    cooperativa: string | null;
    codigoAcesso: string;
    projecaoToken: string;
    atividadeAtualId: string | null;
  };
  participantes: number; // celulares que entraram no evento
  blocos: Bloco[];
  atividades: AtividadeControle[]; // na ordem da tela (blocos)
  moderacao: Moderacao | null;
  previa: EstadoProjecao["atividade"];
};

async function moderacaoDa(
  supabase: SupabaseClient,
  atividade: AtividadeControle | undefined,
  resultado: ResultadoAgregado | null,
): Promise<Moderacao | null> {
  if (!atividade || atividade.estado === "fechada") return null;

  if (atividade.tipo === "nuvem") {
    const ocultas = await supabase
      .from("palavras_ocultas")
      .select("chave")
      .eq("atividade_id", atividade.id)
      .order("chave");
    if (ocultas.error) throw ocultas.error;
    return {
      tipo: "nuvem",
      atividadeId: atividade.id,
      palavras: resultado?.tipo === "nuvem" ? resultado.palavras : [],
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

// O que o telão mostraria com o resultado à vista (mesmo desenho, mesma regra da
// referência). A partir da rodada 2, compara com a rodada 1.
async function previaDa(
  supabase: SupabaseClient,
  atividade: AtividadeControle | undefined,
  resultado: ResultadoAgregado | null,
): Promise<EstadoProjecao["atividade"]> {
  if (!atividade) return null;

  let config = atividade.config;
  if (TIPOS_COM_REFERENCIA.includes(atividade.tipo) && !atividade.referencia_revelada) {
    const semReferencia = { ...(config as { referencia?: number | null }) };
    delete semReferencia.referencia;
    config = semReferencia as ConfigAtividade;
  }

  let resultadoRodada1: ResultadoAgregado | null = null;
  if (resultado && atividade.rodada_atual > 1 && TIPOS_COM_RODADAS.includes(atividade.tipo)) {
    const r = await supabase.rpc("resultado_atividade", { atividade: atividade.id, rodada: 1 });
    if (r.error) throw r.error;
    resultadoRodada1 = (r.data as ResultadoAgregado) ?? null;
  }

  return {
    id: atividade.id,
    tipo: atividade.tipo,
    enunciado: atividade.enunciado,
    config,
    estado: atividade.estado,
    rodada: atividade.rodada_atual,
    resultado,
    resultadoRodada1,
  };
}

export async function estadoControle(
  supabase: SupabaseClient,
  eventoId: string,
  selecionadaId?: string | null,
): Promise<EstadoControle | null> {
  const [evento, atividades, blocos, participantes] = await Promise.all([
    supabase
      .from("eventos")
      .select("id, nome_turma, codigo_acesso, projecao_token, atividade_atual_id, cooperativa:cooperativas(nome)")
      .eq("id", eventoId)
      .maybeSingle(),
    supabase
      .from("atividades")
      .select("id, ordem, bloco_id, tipo, enunciado, config, estado, resultado_visivel, referencia_revelada, rodada_atual")
      .eq("evento_id", eventoId),
    supabase.from("blocos").select("id, ordem, titulo").eq("evento_id", eventoId),
    supabase.from("inscricoes").select("id", { count: "exact", head: true }).eq("evento_id", eventoId),
  ]);
  if (evento.error) throw evento.error;
  if (atividades.error) throw atividades.error;
  if (blocos.error) throw blocos.error;
  if (participantes.error) throw participantes.error;
  if (!evento.data) return null;

  // Resultado agregado (rodada atual) das que já foram abertas: dá o total de cada uma
  // e, para a selecionada, a moderação e a prévia.
  const naOrdem = ordenarPorBloco(atividades.data as Omit<AtividadeControle, "respostas">[], blocos.data);
  const resultados = await Promise.all(
    naOrdem.map(async (a): Promise<ResultadoAgregado | null> => {
      if (a.estado === "fechada") return null;
      const r = await supabase.rpc("resultado_atividade", { atividade: a.id });
      if (r.error) throw r.error;
      return (r.data as ResultadoAgregado) ?? null;
    }),
  );
  const lista: AtividadeControle[] = naOrdem.map((a, i) => ({ ...a, respostas: resultados[i]?.total ?? 0 }));

  // Sem seleção: a primeira da lista (na ordem dos blocos).
  const indice = selecionadaId ? lista.findIndex((a) => a.id === selecionadaId) : lista.length > 0 ? 0 : -1;
  const selecionada = indice >= 0 ? lista[indice] : undefined;
  const resultado = indice >= 0 ? resultados[indice] : null;
  const [moderacao, previa] = await Promise.all([
    moderacaoDa(supabase, selecionada, resultado),
    previaDa(supabase, selecionada, resultado),
  ]);
  const cooperativa = evento.data.cooperativa as unknown as { nome: string } | null;

  return {
    evento: {
      id: evento.data.id,
      nomeTurma: evento.data.nome_turma,
      cooperativa: cooperativa?.nome ?? null,
      codigoAcesso: evento.data.codigo_acesso,
      projecaoToken: evento.data.projecao_token,
      atividadeAtualId: evento.data.atividade_atual_id,
    },
    participantes: participantes.count ?? 0,
    blocos: [...blocos.data].sort((x, y) => x.ordem - y.ordem),
    atividades: lista,
    moderacao,
    previa,
  };
}
