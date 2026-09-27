"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { EstadoFormularioPergunta } from "@/components/formulario-pergunta";
import { TIPOS, validarConfig, type TipoAtividade } from "@/lib/atividades";
import { textoLimpo, uuidValido } from "@/lib/formatos";
import { usuarioAtual } from "@/utils/auth";
import { criarClienteServidor } from "@/utils/supabase/server";

// Biblioteca de modelos (0026). Só o admin escreve: as políticas do banco recusam
// qualquer outro login, mesmo que alguém chame estas ações diretamente.

const SEM_CONEXAO = "Sem conexão com o Pulse agora. Tente de novo em instantes.";

async function exigirLogin() {
  const { user, erro } = await usuarioAtual();
  if (erro) return { erro: SEM_CONEXAO } as const;
  if (!user) redirect("/login");
  return { supabase: await criarClienteServidor() } as const;
}

function atualizar(modeloId?: string) {
  revalidatePath("/painel/biblioteca");
  if (modeloId) revalidatePath(`/painel/biblioteca/${modeloId}`);
}

export async function criarModelo(tituloBruto: string): Promise<{ erro?: string }> {
  const titulo = textoLimpo(tituloBruto, 120);
  if (!titulo) return { erro: "Dê um nome ao modelo." };
  const sessao = await exigirLogin();
  if ("erro" in sessao) return { erro: sessao.erro };

  const criado = await sessao.supabase.from("modelos").insert({ titulo }).select("id").single();
  if (criado.error) return { erro: "Não foi possível criar o modelo. Só o admin cria modelos." };
  atualizar();
  redirect(`/painel/biblioteca/${criado.data.id}`);
}

export async function renomearModelo(modeloId: string, tituloBruto: string): Promise<{ erro?: string }> {
  const titulo = textoLimpo(tituloBruto, 120);
  if (!titulo) return { erro: "Dê um nome ao modelo." };
  const sessao = await exigirLogin();
  if ("erro" in sessao) return { erro: sessao.erro };

  const r = await sessao.supabase.from("modelos").update({ titulo }).eq("id", modeloId).select("id");
  if (r.error || r.data.length === 0) return { erro: "Não foi possível renomear. Tente de novo." };
  atualizar(modeloId);
  return {};
}

// Arquivado: some da lista de "Bloco da biblioteca" nos eventos; o comparativo continua.
export async function arquivarModelo(modeloId: string, arquivar: boolean): Promise<{ erro?: string }> {
  const sessao = await exigirLogin();
  if ("erro" in sessao) return { erro: sessao.erro };

  const r = await sessao.supabase.from("modelos").update({ arquivado: arquivar }).eq("id", modeloId).select("id");
  if (r.error || r.data.length === 0) return { erro: "Não foi possível mudar. Tente de novo." };
  atualizar(modeloId);
  return {};
}

export async function duplicarModelo(modeloId: string): Promise<{ erro?: string }> {
  const sessao = await exigirLogin();
  if ("erro" in sessao) return { erro: sessao.erro };

  const { data, error } = await sessao.supabase.rpc("duplicar_modelo", { modelo: modeloId });
  if (error || !data) return { erro: "Não foi possível duplicar o modelo. Tente de novo." };
  atualizar();
  redirect(`/painel/biblioteca/${data}`);
}

export async function salvarPerguntaModelo(
  modeloId: string,
  perguntaId: string | null,
  _anterior: EstadoFormularioPergunta,
  formData: FormData,
): Promise<EstadoFormularioPergunta> {
  if (!uuidValido(modeloId) || (perguntaId && !uuidValido(perguntaId))) return { erro: "Pergunta inválida." };
  const sessao = await exigirLogin();
  if ("erro" in sessao) return { erro: sessao.erro };
  const { supabase } = sessao;

  const tipo = String(formData.get("tipo") ?? "") as TipoAtividade;
  if (!TIPOS.includes(tipo)) return { erro: "Escolha o tipo da pergunta." };
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

  if (perguntaId) {
    const r = await supabase
      .from("modelo_perguntas")
      .update({ tipo, enunciado, config: validacao.config })
      .eq("id", perguntaId)
      .eq("modelo_id", modeloId)
      .select("id");
    // 23514: pergunta já usada em evento não muda tipo nem opções (0026).
    if (r.error?.code === "23514") {
      return { erro: "Esta pergunta já foi usada em eventos: só o texto pode mudar. Para mudar as opções, duplique o modelo." };
    }
    if (r.error || r.data.length === 0) return { erro: "Não foi possível salvar a pergunta. Tente de novo." };
  } else {
    const ultima = await supabase
      .from("modelo_perguntas")
      .select("ordem")
      .eq("modelo_id", modeloId)
      .order("ordem", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ultima.error) return { erro: SEM_CONEXAO };
    const criada = await supabase.from("modelo_perguntas").insert({
      modelo_id: modeloId,
      ordem: (ultima.data?.ordem ?? 0) + 1,
      tipo,
      enunciado,
      config: validacao.config,
    });
    if (criada.error) return { erro: "Não foi possível criar a pergunta. Só o admin mexe na biblioteca." };
  }

  atualizar(modeloId);
  redirect(`/painel/biblioteca/${modeloId}`);
}

export async function excluirPerguntaModelo(modeloId: string, perguntaId: string): Promise<{ erro?: string }> {
  const sessao = await exigirLogin();
  if ("erro" in sessao) return { erro: sessao.erro };

  const r = await sessao.supabase
    .from("modelo_perguntas")
    .delete()
    .eq("id", perguntaId)
    .eq("modelo_id", modeloId)
    .select("id");
  // 23503: já usada em evento; o comparativo depende dela.
  if (r.error?.code === "23503") return { erro: "Já usada em eventos: não pode ser excluída." };
  if (r.error || r.data.length === 0) return { erro: "Não foi possível excluir. Tente de novo." };
  atualizar(modeloId);
  return {};
}

export async function moverPerguntaModelo(modeloId: string, perguntaId: string, direcao: -1 | 1) {
  const sessao = await exigirLogin();
  if ("erro" in sessao) return;
  await sessao.supabase.rpc("mover_pergunta_modelo", { pergunta: perguntaId, direcao });
  atualizar(modeloId);
}
