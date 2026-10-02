import "server-only";
import {
  TIPOS_COM_REFERENCIA,
  TIPOS_COM_RODADAS,
  type ConfigAtividade,
  type EstadoAtividade,
  type TipoAtividade,
} from "@/lib/atividades";
import { criarClienteServico } from "@/utils/supabase/servico";

// O que o telão mostra. Sem login: quem tem o link da projeção só vê, não comanda.

type Numerico = {
  total: number;
  rodada: number;
  media: number | null;
  mediana: number | null;
  histograma: { valor: number; n: number }[];
};

export type ResultadoAgregado =
  | { tipo: "multipla"; total: number; rodada: number; contagem: number[] }
  // Seleção múltipla: pessoas que marcaram cada opção; total = pessoas que responderam.
  | { tipo: "selecao"; total: number; rodada: number; contagem: number[] }
  | ({ tipo: "escala" } & Numerico)
  | ({ tipo: "numero" } & Numerico)
  | { tipo: "ordenar"; total: number; rodada: number; pontos: number[] }
  | { tipo: "nuvem"; total: number; rodada: number; palavras: { palavra: string; chave: string; n: number }[] }
  | { tipo: "aberta"; total: number; rodada: number; aprovadas: string[]; pendentes: number };

// Temas da nuvem agrupados por IA (resultado_temas, 0031): pessoas por tema, contadas pelo banco.
export type ResultadoTemas = {
  rodada: number;
  total: number; // pessoas com alguma palavra válida
  temas: {
    indice: number; // 1, 2, ... na lista guardada; 0 = Outros
    titulo: string;
    pessoas: number;
    palavras: { palavra: string; chave: string; n: number }[];
  }[];
};

export type EstadoProjecao = {
  evento: { id: string; nomeTurma: string; cooperativa: string | null; codigoAcesso: string };
  // null = tela de espera (nome do evento e código, grandes)
  atividade: {
    id: string;
    tipo: TipoAtividade;
    enunciado: string;
    config: ConfigAtividade; // a referência só vem depois de revelada
    estado: EstadoAtividade;
    rodada: number;
    // Timer: quanto falta (ms) enquanto a votação está aberta; null = sem timer.
    restanteMs?: number | null;
    resultado: ResultadoAgregado | null; // só quando o instrutor mostra
    // A partir da rodada 2: o resultado da rodada 1, para comparar.
    resultadoRodada1: ResultadoAgregado | null;
    // Nuvem: temas por IA no lugar das palavras, quando o instrutor escolheu mostrá-los.
    temas?: ResultadoTemas | null;
  } | null;
};

export const TOKEN_PROJECAO_REGEX = /^[0-9a-f]{64}$/;

export async function estadoProjecao(token: string): Promise<EstadoProjecao | null> {
  if (!TOKEN_PROJECAO_REGEX.test(token)) return null;
  const db = criarClienteServico();

  const evento = await db
    .from("eventos")
    .select("id, nome_turma, codigo_acesso, atividade_atual_id, cooperativa:cooperativas(nome)")
    .eq("projecao_token", token)
    .maybeSingle();
  if (evento.error) throw evento.error;
  if (!evento.data) return null;

  const e = evento.data;
  const cooperativa = e.cooperativa as unknown as { nome: string } | null;
  const base: EstadoProjecao = {
    evento: { id: e.id, nomeTurma: e.nome_turma, cooperativa: cooperativa?.nome ?? null, codigoAcesso: e.codigo_acesso },
    atividade: null,
  };
  if (!e.atividade_atual_id) return base;

  const atividade = await db
    .from("atividades")
    .select("id, tipo, enunciado, config, estado, resultado_visivel, referencia_revelada, rodada_atual, timer_fim")
    .eq("id", e.atividade_atual_id)
    .single();
  if (atividade.error) throw atividade.error;
  const a = atividade.data;

  // Sem atividade aberta e sem resultado para mostrar: tela de espera.
  if (a.estado !== "aberta" && !a.resultado_visivel) return base;

  let config = a.config as ConfigAtividade;
  if (TIPOS_COM_REFERENCIA.includes(a.tipo) && !a.referencia_revelada) {
    const semReferencia = { ...(config as { referencia?: number | null }) };
    delete semReferencia.referencia;
    config = semReferencia as ConfigAtividade;
  }

  let resultado: ResultadoAgregado | null = null;
  let resultadoRodada1: ResultadoAgregado | null = null;
  if (a.resultado_visivel) {
    const comparar = a.rodada_atual > 1 && TIPOS_COM_RODADAS.includes(a.tipo);
    const [atual, primeira] = await Promise.all([
      db.rpc("resultado_atividade", { atividade: a.id }),
      comparar ? db.rpc("resultado_atividade", { atividade: a.id, rodada: 1 }) : Promise.resolve(null),
    ]);
    if (atual.error) throw atual.error;
    if (primeira?.error) throw primeira.error;
    resultado = atual.data as ResultadoAgregado;
    resultadoRodada1 = (primeira?.data as ResultadoAgregado) ?? null;
  }

  // Nuvem com temas por IA escolhidos para o telão (só com o resultado à mostra).
  let temas: ResultadoTemas | null = null;
  if (a.resultado_visivel && a.tipo === "nuvem") {
    const escolha = await db
      .from("temas_nuvem")
      .select("no_telao")
      .eq("atividade_id", a.id)
      .eq("rodada", a.rodada_atual)
      .maybeSingle();
    if (escolha.error) throw escolha.error;
    if (escolha.data?.no_telao) {
      const r = await db.rpc("resultado_temas", { atividade: a.id });
      if (r.error) throw r.error;
      temas = (r.data as ResultadoTemas) ?? null;
    }
  }

  return {
    ...base,
    atividade: {
      id: a.id,
      tipo: a.tipo,
      enunciado: a.enunciado,
      config,
      estado: a.estado,
      rodada: a.rodada_atual,
      restanteMs: a.estado === "aberta" && a.timer_fim ? Date.parse(a.timer_fim) - Date.now() : null,
      resultado,
      resultadoRodada1,
      temas,
    },
  };
}
