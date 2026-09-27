"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { TIPOS, validarConfig, type TipoAtividade } from "@/lib/atividades";
import { textoLimpo, uuidValido } from "@/lib/formatos";
import { usuarioAtual } from "@/utils/auth";
import { criarClienteServidor } from "@/utils/supabase/server";
import { avisarEvento } from "@/utils/tempo-real";

// Todas as ações usam o login do instrutor: as políticas do banco (RLS)
// garantem que ele só mexe nas atividades dos próprios eventos.

const SEM_CONEXAO = "Sem conexão com o Pulse agora. Tente de novo em instantes.";

async function exigirLogin() {
  const { user, erro } = await usuarioAtual();
  if (erro) return { erro: SEM_CONEXAO } as const;
  if (!user) redirect("/login");
  return { supabase: await criarClienteServidor() } as const;
}

// ---------------------------------------------------------------
// Montar atividades
// ---------------------------------------------------------------

export type EstadoFormularioAtividade = { erro?: string };

export async function salvarAtividade(
  eventoId: string,
  atividadeId: string | null,
  _anterior: EstadoFormularioAtividade,
  formData: FormData,
): Promise<EstadoFormularioAtividade> {
  if (!uuidValido(eventoId) || (atividadeId && !uuidValido(atividadeId))) return { erro: "Atividade inválida." };
  const sessao = await exigirLogin();
  if ("erro" in sessao) return { erro: sessao.erro };
  const { supabase } = sessao;

  const tipo = String(formData.get("tipo") ?? "") as TipoAtividade;
  if (!TIPOS.includes(tipo)) return { erro: "Escolha o tipo da atividade." };
  const enunciado = textoLimpo(formData.get("enunciado"), 300);
  if (!enunciado) return { erro: "Escreva a pergunta." };

  const campo = (nome: string) => String(formData.get(nome) ?? "");
  const validacao = validarConfig(tipo, {
    opcoes: formData.getAll("opcao").map(String),
    itens: formData.getAll("item").map(String),
    min: campo("min"),
    max: campo("max"),
    passo: campo("passo"),
    unidade: campo("unidade"),
    referencia: campo("referencia"),
    casas: campo("casas"),
    max_palavras: campo("max_palavras"),
    max_caracteres: campo("max_caracteres"),
  });
  if ("erro" in validacao) return { erro: validacao.erro };

  if (atividadeId) {
    // Só dá para editar antes de abrir: depois disso já há respostas ligadas às opções.
    const atual = await supabase.from("atividades").select("estado").eq("id", atividadeId).maybeSingle();
    if (atual.error) return { erro: SEM_CONEXAO };
    if (!atual.data) return { erro: "Atividade não encontrada." };
    if (atual.data.estado !== "fechada") return { erro: "Esta atividade já foi aberta e não pode mais ser editada." };

    const alterada = await supabase
      .from("atividades")
      .update({ tipo, enunciado, config: validacao.config })
      .eq("id", atividadeId)
      .eq("estado", "fechada")
      .select("id");
    if (alterada.error) return { erro: "Não foi possível salvar a atividade. Tente de novo." };
    if (alterada.data.length === 0) return { erro: "Esta atividade já foi aberta e não pode mais ser editada." };
  } else {
    const ultima = await supabase
      .from("atividades")
      .select("ordem")
      .eq("evento_id", eventoId)
      .order("ordem", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ultima.error) return { erro: SEM_CONEXAO };

    const criada = await supabase.from("atividades").insert({
      evento_id: eventoId,
      ordem: (ultima.data?.ordem ?? 0) + 1,
      tipo,
      enunciado,
      config: validacao.config,
    });
    if (criada.error) return { erro: "Não foi possível criar a atividade. Tente de novo." };
  }

  revalidatePath(`/painel/evento/${eventoId}`);
  redirect(`/painel/evento/${eventoId}#atividades`);
}

export async function excluirAtividade(eventoId: string, atividadeId: string): Promise<{ erro?: string }> {
  const sessao = await exigirLogin();
  if ("erro" in sessao) return { erro: sessao.erro };

  const apagada = await sessao.supabase
    .from("atividades")
    .delete()
    .eq("id", atividadeId)
    .eq("evento_id", eventoId)
    .neq("estado", "aberta")
    .select("id");
  if (apagada.error) return { erro: "Não foi possível excluir. Tente de novo." };
  if (apagada.data.length === 0) return { erro: "Encerre a atividade antes de excluir." };

  revalidatePath(`/painel/evento/${eventoId}`);
  await avisarEvento(eventoId, "estado"); // se era a atual, o telão volta para a espera
  return {};
}

export async function moverAtividade(eventoId: string, atividadeId: string, direcao: -1 | 1) {
  const sessao = await exigirLogin();
  if ("erro" in sessao) return;
  await sessao.supabase.rpc("mover_atividade", { atividade: atividadeId, direcao });
  revalidatePath(`/painel/evento/${eventoId}`);
}

// ---------------------------------------------------------------
// Controle da sala
// ---------------------------------------------------------------

export type Comando =
  | "abrir"
  | "nova_rodada"
  | "encerrar"
  | "mostrar_resultado"
  | "esconder_resultado"
  | "revelar_referencia"
  | "esconder_referencia";

const COMANDOS: Comando[] = [
  "abrir",
  "nova_rodada",
  "encerrar",
  "mostrar_resultado",
  "esconder_resultado",
  "revelar_referencia",
  "esconder_referencia",
];

export async function comandarAtividade(
  eventoId: string,
  atividadeId: string,
  comando: Comando,
): Promise<{ erro?: string }> {
  if (!COMANDOS.includes(comando)) return { erro: "Comando inválido." };
  const sessao = await exigirLogin();
  if ("erro" in sessao) return { erro: sessao.erro };

  const { error } = await sessao.supabase.rpc("comandar_atividade", { atividade: atividadeId, comando });
  if (error) return { erro: mensagemDoBanco(error) };

  await avisarEvento(eventoId, "estado");
  return {};
}

// Erros previstos pelas funções do banco já vêm em português,
// ex.: "Encerre a atividade aberta antes". Os demais viram uma mensagem genérica.
function mensagemDoBanco(error: { code: string; message: string }) {
  const previstos = ["23514", "P0002", "22023", "42501"];
  return previstos.includes(error.code) ? error.message : "Não foi possível fazer isso agora. Tente de novo.";
}

// ---------------------------------------------------------------
// Moderação: nuvem e respostas abertas
// ---------------------------------------------------------------

// Oculta (ou mostra de novo) uma palavra da nuvem no telão. "chave" é a forma
// sem acento e no singular que vem do resultado (resultado_atividade, 0018).
export async function ocultarPalavra(
  eventoId: string,
  atividadeId: string,
  chave: string,
  ocultar: boolean,
): Promise<{ erro?: string }> {
  const sessao = await exigirLogin();
  if ("erro" in sessao) return { erro: sessao.erro };

  const tabela = sessao.supabase.from("palavras_ocultas");
  const { error } = ocultar
    ? await tabela.upsert({ atividade_id: atividadeId, chave }, { onConflict: "atividade_id,chave", ignoreDuplicates: true })
    : await tabela.delete().eq("atividade_id", atividadeId).eq("chave", chave);
  if (error) return { erro: "Não foi possível mudar a palavra. Tente de novo." };

  await avisarEvento(eventoId, "estado");
  return {};
}

// Aprova ou recusa uma resposta aberta (moderar_resposta, 0017).
export async function moderarResposta(
  eventoId: string,
  respostaId: string,
  aprovar: boolean,
): Promise<{ erro?: string }> {
  const sessao = await exigirLogin();
  if ("erro" in sessao) return { erro: sessao.erro };

  const { data, error } = await sessao.supabase.rpc("moderar_resposta", { resposta: respostaId, aprovar });
  if (error || !data) return { erro: "Não foi possível moderar esta resposta." };

  await avisarEvento(eventoId, "estado");
  return {};
}

// ---------------------------------------------------------------
// Encerrar e reabrir evento
// ---------------------------------------------------------------

export async function encerrarEvento(eventoId: string): Promise<{ erro?: string }> {
  const sessao = await exigirLogin();
  if ("erro" in sessao) return { erro: sessao.erro };

  const { error } = await sessao.supabase.rpc("encerrar_evento", { evento: eventoId });
  if (error) return { erro: mensagemDoBanco(error) };

  revalidatePath(`/painel/evento/${eventoId}`);
  revalidatePath("/painel");
  await avisarEvento(eventoId, "estado"); // os celulares passam a mostrar "Este evento já terminou."
  return {};
}

// Só o admin (a função confere no banco).
export async function reabrirEvento(eventoId: string): Promise<{ erro?: string }> {
  const sessao = await exigirLogin();
  if ("erro" in sessao) return { erro: sessao.erro };

  const { error } = await sessao.supabase.rpc("reabrir_evento", { evento: eventoId });
  if (error) return { erro: mensagemDoBanco(error) };

  revalidatePath(`/painel/evento/${eventoId}`);
  revalidatePath("/painel");
  await avisarEvento(eventoId, "estado");
  return {};
}
