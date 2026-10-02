"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { TIPOS, validarConfig, type TipoAtividade } from "@/lib/atividades";
import { textoLimpo, uuidValido } from "@/lib/formatos";
import { usuarioAtual } from "@/utils/auth";
import { criarClienteServidor } from "@/utils/supabase/server";
import { sugerirTemas } from "@/utils/ia";
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

type Cliente = Awaited<ReturnType<typeof criarClienteServidor>>;

// Posição no fim do bloco (a ordem vale dentro de cada bloco). undefined = sem conexão.
async function proximaOrdem(supabase: Cliente, eventoId: string, blocoId: string) {
  const ultima = await supabase
    .from("atividades")
    .select("ordem")
    .eq("evento_id", eventoId)
    .eq("bloco_id", blocoId)
    .order("ordem", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (ultima.error) return undefined;
  return (ultima.data?.ordem ?? 0) + 1;
}

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
    min_escolhas: campo("min_escolhas"),
    max_escolhas: campo("max_escolhas"),
  });
  if ("erro" in validacao) return { erro: validacao.erro };
  // Observação opcional: aparece no celular abaixo da pergunta. Vazia = null.
  const observacao = textoLimpo(formData.get("observacao"), 500) || null;
  // Timer opcional (0032): minutos + segundos, de 10 s a 30 min. Vazio = sem timer.
  const tempoMinBruto = campo("tempo_min").trim();
  const tempoSegBruto = campo("tempo_seg").trim();
  let tempoResposta: number | null = null;
  if (tempoMinBruto || tempoSegBruto) {
    tempoResposta = Number(tempoMinBruto || 0) * 60 + Number(tempoSegBruto || 0);
    if (!Number.isInteger(tempoResposta) || tempoResposta < 10 || tempoResposta > 1800) {
      return { erro: "O tempo para responder vai de 10 segundos a 30 minutos (ou deixe em branco)." };
    }
  }

  // Toda atividade pertence a um bloco (0024). O banco confere que é do mesmo evento.
  const blocoId = campo("bloco");
  if (!uuidValido(blocoId)) return { erro: "Escolha o bloco da atividade." };

  if (atividadeId) {
    // Só dá para editar antes de abrir: depois disso já há respostas ligadas às opções.
    const atual = await supabase
      .from("atividades")
      .select("estado, bloco_id")
      .eq("id", atividadeId)
      .maybeSingle();
    if (atual.error) return { erro: SEM_CONEXAO };
    if (!atual.data) return { erro: "Atividade não encontrada." };
    if (atual.data.estado !== "fechada") return { erro: "Esta atividade já foi aberta e não pode mais ser editada." };

    // Mudou de bloco: vai para o fim do bloco novo.
    const mudouDeBloco = atual.data.bloco_id !== blocoId;
    const ordem = mudouDeBloco ? await proximaOrdem(supabase, eventoId, blocoId) : null;
    if (ordem === undefined) return { erro: SEM_CONEXAO };

    const alterada = await supabase
      .from("atividades")
      .update({ tipo, enunciado, observacao, tempo_resposta_seg: tempoResposta, config: validacao.config, ...(ordem ? { bloco_id: blocoId, ordem } : {}) })
      .eq("id", atividadeId)
      .eq("estado", "fechada")
      .select("id");
    if (alterada.error) return { erro: "Não foi possível salvar a atividade. Tente de novo." };
    if (alterada.data.length === 0) return { erro: "Esta atividade já foi aberta e não pode mais ser editada." };
  } else {
    const ordem = await proximaOrdem(supabase, eventoId, blocoId);
    if (ordem === undefined) return { erro: SEM_CONEXAO };

    const criada = await supabase.from("atividades").insert({
      evento_id: eventoId,
      bloco_id: blocoId,
      ordem,
      tipo,
      enunciado,
      observacao,
      tempo_resposta_seg: tempoResposta,
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
// Blocos (grupos de atividades)
// ---------------------------------------------------------------

export async function criarBloco(eventoId: string, tituloBruto: string): Promise<{ erro?: string }> {
  if (!uuidValido(eventoId)) return { erro: "Evento inválido." };
  const titulo = textoLimpo(tituloBruto, 120);
  if (!titulo) return { erro: "Dê um nome ao bloco." };
  const sessao = await exigirLogin();
  if ("erro" in sessao) return { erro: sessao.erro };

  const ultimo = await sessao.supabase
    .from("blocos")
    .select("ordem")
    .eq("evento_id", eventoId)
    .order("ordem", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (ultimo.error) return { erro: SEM_CONEXAO };

  const criado = await sessao.supabase
    .from("blocos")
    .insert({ evento_id: eventoId, titulo, ordem: (ultimo.data?.ordem ?? 0) + 1 });
  if (criado.error) return { erro: "Não foi possível criar o bloco. Tente de novo." };

  revalidatePath(`/painel/evento/${eventoId}`);
  return {};
}

export async function renomearBloco(eventoId: string, blocoId: string, tituloBruto: string): Promise<{ erro?: string }> {
  const titulo = textoLimpo(tituloBruto, 120);
  if (!titulo) return { erro: "Dê um nome ao bloco." };
  const sessao = await exigirLogin();
  if ("erro" in sessao) return { erro: sessao.erro };

  const alterado = await sessao.supabase
    .from("blocos")
    .update({ titulo })
    .eq("id", blocoId)
    .eq("evento_id", eventoId)
    .select("id");
  if (alterado.error || alterado.data.length === 0) return { erro: "Não foi possível renomear. Tente de novo." };

  revalidatePath(`/painel/evento/${eventoId}`);
  return {};
}

// As atividades do bloco não são apagadas: ficam sem bloco (0023).
export async function excluirBloco(eventoId: string, blocoId: string): Promise<{ erro?: string }> {
  const sessao = await exigirLogin();
  if ("erro" in sessao) return { erro: sessao.erro };

  const apagado = await sessao.supabase
    .from("blocos")
    .delete()
    .eq("id", blocoId)
    .eq("evento_id", eventoId)
    .select("id");
  // 23503: o bloco ainda tem atividades (o banco não deixa excluir, 0024).
  if (apagado.error?.code === "23503") return { erro: "Mova ou exclua as atividades deste bloco antes." };
  if (apagado.error || apagado.data.length === 0) return { erro: "Não foi possível excluir. Tente de novo." };

  revalidatePath(`/painel/evento/${eventoId}`);
  return {};
}

// Copia um modelo da biblioteca para o evento: bloco novo no fim, perguntas ligadas ao modelo.
export async function usarModelo(eventoId: string, modeloId: string): Promise<{ erro?: string }> {
  if (!uuidValido(eventoId) || !uuidValido(modeloId)) return { erro: "Escolha um modelo." };
  const sessao = await exigirLogin();
  if ("erro" in sessao) return { erro: sessao.erro };
  const { error } = await sessao.supabase.rpc("usar_modelo", { evento: eventoId, modelo: modeloId });
  if (error) return { erro: "Não foi possível adicionar o bloco da biblioteca. Tente de novo." };
  revalidatePath(`/painel/evento/${eventoId}`);
  return {};
}

export async function duplicarBloco(eventoId: string, blocoId: string): Promise<{ erro?: string }> {
  const sessao = await exigirLogin();
  if ("erro" in sessao) return { erro: sessao.erro };
  const { error } = await sessao.supabase.rpc("duplicar_bloco", { bloco: blocoId });
  if (error) return { erro: "Não foi possível duplicar o bloco. Tente de novo." };
  revalidatePath(`/painel/evento/${eventoId}`);
  return {};
}

export async function duplicarAtividade(eventoId: string, atividadeId: string): Promise<{ erro?: string }> {
  const sessao = await exigirLogin();
  if ("erro" in sessao) return { erro: sessao.erro };
  const { error } = await sessao.supabase.rpc("duplicar_atividade", { atividade: atividadeId });
  if (error) return { erro: "Não foi possível duplicar. Tente de novo." };
  revalidatePath(`/painel/evento/${eventoId}`);
  return {};
}

// Leva a atividade para o fim de outro bloco. Vale em qualquer estado (aberta,
// encerrada...): mudar de bloco não mexe em respostas nem no que está no telão.
export async function moverParaBloco(
  eventoId: string,
  atividadeId: string,
  blocoId: string,
): Promise<{ erro?: string }> {
  if (!uuidValido(blocoId)) return { erro: "Bloco inválido." };
  const sessao = await exigirLogin();
  if ("erro" in sessao) return { erro: sessao.erro };

  const ordem = await proximaOrdem(sessao.supabase, eventoId, blocoId);
  if (ordem === undefined) return { erro: SEM_CONEXAO };
  const movida = await sessao.supabase
    .from("atividades")
    .update({ bloco_id: blocoId, ordem })
    .eq("id", atividadeId)
    .eq("evento_id", eventoId)
    .select("id");
  if (movida.error || movida.data.length === 0) return { erro: "Não foi possível mover. Tente de novo." };

  revalidatePath(`/painel/evento/${eventoId}`);
  return {};
}

export async function moverBloco(eventoId: string, blocoId: string, direcao: -1 | 1) {
  const sessao = await exigirLogin();
  if ("erro" in sessao) return;
  await sessao.supabase.rpc("mover_bloco", { bloco: blocoId, direcao });
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
  | "esconder_referencia"
  | "mais_tempo";

const COMANDOS: Comando[] = [
  "abrir",
  "nova_rodada",
  "encerrar",
  "mostrar_resultado",
  "esconder_resultado",
  "revelar_referencia",
  "esconder_referencia",
  "mais_tempo",
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

// ---------------------------------------------------------------
// Temas da nuvem por IA (docs/ia-temas-nuvem.md, migração 0031).
// A IA sugere os temas; o instrutor ajusta e decide se vão ao telão.
// ---------------------------------------------------------------

type TemasGuardados = { titulo: string; chaves: string[] }[];

async function lerTemas(supabase: Cliente, atividadeId: string, rodada: number) {
  const r = await supabase
    .from("temas_nuvem")
    .select("temas")
    .eq("atividade_id", atividadeId)
    .eq("rodada", rodada)
    .maybeSingle();
  if (r.error) return { erro: SEM_CONEXAO } as const;
  if (!r.data) return { erro: "Gere os temas primeiro." } as const;
  return { temas: r.data.temas as TemasGuardados } as const;
}

async function gravarTemas(supabase: Cliente, atividadeId: string, rodada: number, temas: TemasGuardados) {
  const r = await supabase
    .from("temas_nuvem")
    .update({ temas })
    .eq("atividade_id", atividadeId)
    .eq("rodada", rodada)
    .select("atividade_id");
  return !r.error && r.data.length > 0;
}

export async function gerarTemas(eventoId: string, atividadeId: string): Promise<{ erro?: string }> {
  const sessao = await exigirLogin();
  if ("erro" in sessao) return { erro: sessao.erro };
  const { supabase } = sessao;

  const atividade = await supabase
    .from("atividades")
    .select("tipo, enunciado, rodada_atual")
    .eq("id", atividadeId)
    .eq("evento_id", eventoId)
    .maybeSingle();
  if (atividade.error) return { erro: SEM_CONEXAO };
  if (!atividade.data || atividade.data.tipo !== "nuvem") return { erro: "Só a nuvem de palavras tem temas." };

  // As palavras como a nuvem mostra: juntadas por acento/plural, sem as ocultas.
  const nuvem = await supabase.rpc("resultado_atividade", { atividade: atividadeId });
  if (nuvem.error) return { erro: SEM_CONEXAO };
  const palavras = (nuvem.data?.palavras ?? []) as { palavra: string; chave: string; n: number }[];
  if (palavras.length < 3) return { erro: "Poucas palavras para resumir: espere mais respostas." };

  const sugestao = await sugerirTemas(atividade.data.enunciado, palavras);
  if ("erro" in sugestao) return { erro: sugestao.erro };

  // Tema novo nunca vai direto ao telão: o instrutor revisa antes.
  const gravado = await supabase.from("temas_nuvem").upsert(
    {
      atividade_id: atividadeId,
      rodada: atividade.data.rodada_atual,
      temas: sugestao.temas,
      no_telao: false,
      modelo: sugestao.modelo,
      gerado_em: new Date().toISOString(),
    },
    { onConflict: "atividade_id,rodada" },
  );
  if (gravado.error) return { erro: "Não foi possível guardar os temas. Tente de novo." };

  await avisarEvento(eventoId, "estado");
  return {};
}

export async function renomearTema(
  eventoId: string,
  atividadeId: string,
  rodada: number,
  indice: number,
  tituloBruto: string,
): Promise<{ erro?: string }> {
  const titulo = textoLimpo(tituloBruto, 60);
  if (!titulo) return { erro: "Dê um nome ao tema." };
  const sessao = await exigirLogin();
  if ("erro" in sessao) return { erro: sessao.erro };

  const atual = await lerTemas(sessao.supabase, atividadeId, rodada);
  if ("erro" in atual) return { erro: atual.erro };
  if (!atual.temas[indice]) return { erro: "Tema não encontrado." };
  const temas = atual.temas.map((t, i) => (i === indice ? { ...t, titulo } : t));
  if (!(await gravarTemas(sessao.supabase, atividadeId, rodada, temas))) return { erro: "Não foi possível renomear." };

  await avisarEvento(eventoId, "estado");
  return {};
}

// destino: posição do tema (0, 1, ...) ou -1 para Outros.
export async function moverPalavraTema(
  eventoId: string,
  atividadeId: string,
  rodada: number,
  chave: string,
  destino: number,
): Promise<{ erro?: string }> {
  const sessao = await exigirLogin();
  if ("erro" in sessao) return { erro: sessao.erro };

  const atual = await lerTemas(sessao.supabase, atividadeId, rodada);
  if ("erro" in atual) return { erro: atual.erro };
  if (destino !== -1 && !atual.temas[destino]) return { erro: "Tema não encontrado." };
  const temas = atual.temas.map((t, i) => ({
    ...t,
    chaves: i === destino ? [...t.chaves.filter((c) => c !== chave), chave] : t.chaves.filter((c) => c !== chave),
  }));
  if (!(await gravarTemas(sessao.supabase, atividadeId, rodada, temas))) return { erro: "Não foi possível mover." };

  await avisarEvento(eventoId, "estado");
  return {};
}

export async function mostrarTemasNoTelao(
  eventoId: string,
  atividadeId: string,
  rodada: number,
  mostrar: boolean,
): Promise<{ erro?: string }> {
  const sessao = await exigirLogin();
  if ("erro" in sessao) return { erro: sessao.erro };

  const r = await sessao.supabase
    .from("temas_nuvem")
    .update({ no_telao: mostrar })
    .eq("atividade_id", atividadeId)
    .eq("rodada", rodada)
    .select("atividade_id");
  if (r.error || r.data.length === 0) return { erro: "Não foi possível mudar o telão." };

  await avisarEvento(eventoId, "estado");
  return {};
}
