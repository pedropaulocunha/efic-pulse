import "server-only";
import type { ConfigAtividade, ConfigEscala, EstadoAtividade, TipoAtividade } from "@/lib/atividades";
import { criarClienteServico } from "@/utils/supabase/servico";

// O que o telão mostra. Sem login: quem tem o link da projeção só vê, não comanda.

export type ResultadoAgregado =
  | { tipo: "multipla"; total: number; contagem: number[] }
  | {
      tipo: "escala";
      total: number;
      media: number | null;
      mediana: number | null;
      histograma: { valor: number; n: number }[];
    }
  | { tipo: "nuvem"; total: number; palavras: { palavra: string; n: number }[] };

export type EstadoProjecao = {
  evento: { id: string; nomeTurma: string; cooperativa: string | null; codigoAcesso: string };
  // null = tela de espera (nome do evento e código, grandes)
  atividade: {
    id: string;
    tipo: TipoAtividade;
    enunciado: string;
    config: ConfigAtividade; // na escala, a referência só vem depois de revelada
    estado: EstadoAtividade;
    resultado: ResultadoAgregado | null; // só quando o instrutor mostra
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
    .select("id, tipo, enunciado, config, estado, resultado_visivel, referencia_revelada")
    .eq("id", e.atividade_atual_id)
    .single();
  if (atividade.error) throw atividade.error;
  const a = atividade.data;

  // Sem atividade aberta e sem resultado para mostrar: tela de espera.
  if (a.estado !== "aberta" && !a.resultado_visivel) return base;

  let config = a.config as ConfigAtividade;
  if (a.tipo === "escala" && !a.referencia_revelada) {
    const semReferencia: ConfigEscala = { ...(config as ConfigEscala) };
    delete semReferencia.referencia;
    config = semReferencia;
  }

  let resultado: ResultadoAgregado | null = null;
  if (a.resultado_visivel) {
    const r = await db.rpc("resultado_atividade", { atividade: a.id });
    if (r.error) throw r.error;
    resultado = r.data as ResultadoAgregado;
  }

  return {
    ...base,
    atividade: { id: a.id, tipo: a.tipo, enunciado: a.enunciado, config, estado: a.estado, resultado },
  };
}
