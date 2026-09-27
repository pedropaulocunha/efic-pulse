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
  | ({ tipo: "escala" } & Numerico)
  | ({ tipo: "numero" } & Numerico)
  | { tipo: "ordenar"; total: number; rodada: number; pontos: number[] }
  | { tipo: "nuvem"; total: number; rodada: number; palavras: { palavra: string; chave: string; n: number }[] }
  | { tipo: "aberta"; total: number; rodada: number; aprovadas: string[]; pendentes: number };

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
    resultado: ResultadoAgregado | null; // só quando o instrutor mostra
    // A partir da rodada 2: o resultado da rodada 1, para comparar.
    resultadoRodada1: ResultadoAgregado | null;
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
    .select("id, tipo, enunciado, config, estado, resultado_visivel, referencia_revelada, rodada_atual")
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

  return {
    ...base,
    atividade: {
      id: a.id,
      tipo: a.tipo,
      enunciado: a.enunciado,
      config,
      estado: a.estado,
      rodada: a.rodada_atual,
      resultado,
      resultadoRodada1,
    },
  };
}
