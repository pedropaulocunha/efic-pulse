import "server-only";
import type {
  ConfigAtividade,
  EstadoAtividade,
  TipoAtividade,
  ValorResposta,
} from "@/lib/atividades";
import { criarClienteServico } from "@/utils/supabase/servico";

// O que o celular do participante vê. NUNCA inclui resultado nem a referência da escala.
// Vem pronto da função sala_estado (0013), junto com a sessão: ver lerSessao().
export type EstadoSala = {
  eventoEncerrado: boolean;
  atividade: {
    id: string;
    tipo: TipoAtividade;
    enunciado: string;
    observacao?: string | null; // explicação opcional, abaixo da pergunta
    restante_ms?: number | null; // timer: quanto falta, pelo relógio do banco
    config: ConfigAtividade;
    estado: Exclude<EstadoAtividade, "fechada">;
    rodada: number;
  } | null;
  resposta: ValorResposta | null; // a resposta que ele já enviou, se a votação estiver aberta
};

export type ResultadoResposta =
  | { ok: true; eventoId: string }
  | { ok: false; status: 400 | 401 | 409; erro: string };

// Grava (ou substitui) a resposta numa chamada só ao banco (função sala_responder, 0013),
// que confere a sessão, se a atividade é do evento dele e está aberta, e o valor.
export async function responder(
  tokenHash: string,
  atividadeId: unknown,
  valor: unknown,
): Promise<ResultadoResposta> {
  if (typeof atividadeId !== "string" || !/^[0-9a-f-]{36}$/i.test(atividadeId)) {
    return { ok: false, status: 400, erro: "Atividade inválida." };
  }

  const { data, error } = await criarClienteServico().rpc("sala_responder", {
    token_hash: tokenHash,
    atividade: atividadeId,
    valor: valor ?? null,
  });
  if (error) throw error;

  switch (data.resultado) {
    case "ok":
      return { ok: true, eventoId: data.evento_id };
    case "sem_sessao":
      return { ok: false, status: 401, erro: "sem_sessao" };
    case "encerrada":
      return { ok: false, status: 409, erro: "A votação já foi encerrada." };
    case "valor_invalido":
      return { ok: false, status: 400, erro: "Resposta inválida. Confira e envie de novo." };
    default:
      return { ok: false, status: 400, erro: "Atividade inválida." };
  }
}
