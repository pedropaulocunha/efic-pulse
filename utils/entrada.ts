import "server-only";
import { normalizarCodigo } from "@/lib/formatos";
import { gravarCookieSessao, hashIpAtual, novoToken } from "@/utils/participante";
import type { Cronometro } from "@/utils/cronometro";
import { criarClienteServico } from "@/utils/supabase/servico";

// Entrada do participante só com o código do evento, sem e-mail e sem nome.
// Usada pelo formulário da página inicial (app/acoes-entrada.ts) e pela API
// /api/sala/entrar (teste de carga). Uma chamada só ao banco (sala_entrar_codigo, 0022):
// limite de tentativas, evento, prazo, teto de participantes e sessão.

export type ResultadoEntrada = { ok: true } | { ok: false; erro: string };

const NAO_CONFERE = "Código não encontrado. Confira o código no telão.";
const MUITAS_TENTATIVAS = "Muitas tentativas. Espere alguns minutos.";
const TERMINOU = "Este evento já terminou.";
const LOTADO = "A sala chegou ao limite de participantes. Fale com o instrutor.";
const FALHA = "Não foi possível entrar agora. Tente de novo em instantes.";

export async function tentarEntrada(codigoBruto: unknown, cronometro?: Cronometro): Promise<ResultadoEntrada> {
  const codigo = normalizarCodigo(codigoBruto);

  try {
    const { token, tokenHash } = novoToken();
    const { data, error } = await criarClienteServico().rpc("sala_entrar_codigo", {
      codigo,
      ip_hash: await hashIpAtual(),
      token_hash: tokenHash,
    });
    cronometro?.marcar("banco");
    if (error) throw error;

    switch (data.resultado) {
      case "ok":
        await gravarCookieSessao(token, new Date(data.expira_em));
        return { ok: true };
      case "bloqueado":
        return { ok: false, erro: MUITAS_TENTATIVAS };
      case "terminou":
        return { ok: false, erro: TERMINOU };
      case "lotado":
        return { ok: false, erro: LOTADO };
      default:
        return { ok: false, erro: NAO_CONFERE };
    }
  } catch (e) {
    console.error("tentarEntrada:", e);
    return { ok: false, erro: FALHA };
  }
}
