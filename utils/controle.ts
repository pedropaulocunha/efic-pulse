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
import { iaConfigurada } from "@/utils/ia";
import type { EstadoProjecao, ResultadoAgregado, ResultadoTemas } from "@/utils/projecao";

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
  observacao: string | null;
  config: ConfigAtividade;
  estado: EstadoAtividade;
  resultado_visivel: boolean;
  referencia_revelada: boolean;
  rodada_atual: number;
  tempo_resposta_seg: number | null;
  timer_fim: string | null;
  restante_ms: number | null; // timer: quanto falta, calculado no servidor
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

// Temas da nuvem por IA da atividade selecionada (rodada atual).
export type TemasControle = {
  atividadeId: string;
  rodada: number;
  noTelao: boolean;
  geradoEm: string;
  lista: { titulo: string; chaves: string[] }[]; // como guardado (para mover e renomear)
  resultado: ResultadoTemas | null; // pessoas por tema, contadas pelo banco
  novas: number; // palavras que chegaram depois do resumo (estão em Outros)
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
  temas: TemasControle | null;
  iaConfigurada: boolean;
};

async function temasDa(
  supabase: SupabaseClient,
  atividade: AtividadeControle | undefined,
  resultado: ResultadoAgregado | null,
): Promise<TemasControle | null> {
  if (!atividade || atividade.tipo !== "nuvem" || atividade.estado === "fechada") return null;
  const guardados = await supabase
    .from("temas_nuvem")
    .select("temas, no_telao, gerado_em")
    .eq("atividade_id", atividade.id)
    .eq("rodada", atividade.rodada_atual)
    .maybeSingle();
  if (guardados.error) throw guardados.error;
  if (!guardados.data) return null;

  const r = await supabase.rpc("resultado_temas", { atividade: atividade.id });
  if (r.error) throw r.error;
  const lista = guardados.data.temas as TemasControle["lista"];
  const comTema = new Set(lista.flatMap((t) => t.chaves));
  const palavras = resultado?.tipo === "nuvem" ? resultado.palavras : [];
  return {
    atividadeId: atividade.id,
    rodada: atividade.rodada_atual,
    noTelao: guardados.data.no_telao,
    geradoEm: guardados.data.gerado_em,
    lista,
    resultado: (r.data as ResultadoTemas) ?? null,
    novas: palavras.filter((p) => !comTema.has(p.chave)).length,
  };
}

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
    restanteMs: atividade.restante_ms,
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
      .select("id, ordem, bloco_id, tipo, enunciado, observacao, config, estado, resultado_visivel, referencia_revelada, rodada_atual, tempo_resposta_seg, timer_fim")
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
  const lista: AtividadeControle[] = naOrdem.map((a, i) => ({
    ...a,
    respostas: resultados[i]?.total ?? 0,
    restante_ms: a.estado === "aberta" && a.timer_fim ? Date.parse(a.timer_fim) - Date.now() : null,
  }));

  // Sem seleção: a primeira da lista (na ordem dos blocos).
  const indice = selecionadaId ? lista.findIndex((a) => a.id === selecionadaId) : lista.length > 0 ? 0 : -1;
  const selecionada = indice >= 0 ? lista[indice] : undefined;
  const resultado = indice >= 0 ? resultados[indice] : null;
  const [moderacao, previa, temas] = await Promise.all([
    moderacaoDa(supabase, selecionada, resultado),
    previaDa(supabase, selecionada, resultado),
    temasDa(supabase, selecionada, resultado),
  ]);
  // A prévia mostra os temas quando é isso que o telão mostra.
  if (previa && temas?.noTelao) previa.temas = temas.resultado;
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
    temas,
    iaConfigurada: iaConfigurada(),
  };
}
