"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { EstadoFormularioPergunta } from "@/components/formulario-pergunta";
import { lerTempoResposta, TIPOS, validarConfig, type TipoAtividade } from "@/lib/atividades";
import { textoLimpo, uuidValido } from "@/lib/formatos";
import { itensDoConsolidado, type DadosConsolidado } from "@/lib/consolidado";
import { classificarEmTemas, consolidarComIA } from "@/utils/ia";
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
    min_escolhas: campo("min_escolhas"),
    max_escolhas: campo("max_escolhas"),
  });
  if ("erro" in validacao) return { erro: validacao.erro };
  // Observação opcional: aparece no celular abaixo da pergunta. Vazia = null.
  const observacao = textoLimpo(formData.get("observacao"), 500) || null;
  // Timer opcional (0032): minutos + segundos, de 10 s a 30 min. Vazio = sem timer.
  const leituraTempo = lerTempoResposta(campo("tempo_min"), campo("tempo_seg"));
  if ("erro" in leituraTempo) return { erro: leituraTempo.erro };
  const tempoResposta = leituraTempo.tempo;

  if (perguntaId) {
    const r = await supabase
      .from("modelo_perguntas")
      .update({ tipo, enunciado, observacao, tempo_resposta_seg: tempoResposta, config: validacao.config })
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
      observacao,
      tempo_resposta_seg: tempoResposta,
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

// Liga ao modelo as perguntas idênticas que já existiam em eventos (0035), para
// esses eventos entrarem no comparativo. Só admin (o banco confere).
export async function ligarPerguntasAoModelo(modeloId: string): Promise<{ erro?: string; ligadas?: number }> {
  const sessao = await exigirLogin();
  if ("erro" in sessao) return { erro: sessao.erro };
  const { data, error } = await sessao.supabase.rpc("ligar_perguntas_ao_modelo", { modelo: modeloId });
  if (error || data === null) return { erro: "Não foi possível ligar as perguntas. Só o admin pode fazer isso." };
  atualizar(modeloId);
  return { ligadas: data as number };
}

// ---------------------------------------------------------------
// Consolidado por IA de uma pergunta do modelo com todas as turmas (0036,
// docs/consolidado.md). Só admin (o banco confere).
// ---------------------------------------------------------------

const DATA_CONSOLIDADO = /^\d{4}-\d{2}-\d{2}$/;

function caminhoConsolidado(modeloId: string, perguntaId: string) {
  return `/painel/biblioteca/${modeloId}/pergunta/${perguntaId}/consolidado`;
}

export async function gerarConsolidado(
  modeloId: string,
  perguntaId: string,
  deBruto: string,
  ateBruto: string,
): Promise<{ erro?: string }> {
  const sessao = await exigirLogin();
  if ("erro" in sessao) return { erro: sessao.erro };
  const { supabase } = sessao;
  const de = DATA_CONSOLIDADO.test(deBruto) ? deBruto : null;
  const ate = DATA_CONSOLIDADO.test(ateBruto) ? ateBruto : null;

  const pergunta = await supabase
    .from("modelo_perguntas")
    .select("enunciado, tipo")
    .eq("id", perguntaId)
    .eq("modelo_id", modeloId)
    .maybeSingle();
  if (pergunta.error) return { erro: SEM_CONEXAO };
  if (!pergunta.data || !["aberta", "nuvem"].includes(pergunta.data.tipo)) {
    return { erro: "O consolidado por IA vale para perguntas de texto livre e de nuvem." };
  }

  const dados = await supabase.rpc("consolidado_respostas", { pergunta: perguntaId, de, ate });
  if (dados.error || dados.data === null) return { erro: "Não foi possível ler as respostas. Só o admin usa o consolidado." };
  const itens = itensDoConsolidado(dados.data as DadosConsolidado);
  if (itens.length < 5) return { erro: "Poucas respostas nesse período para consolidar (mínimo 5)." };

  const r = await consolidarComIA(pergunta.data.enunciado, itens);
  if ("erro" in r) return { erro: r.erro };

  const gravado = await supabase.from("consolidados").upsert(
    {
      modelo_pergunta_id: perguntaId,
      de,
      ate,
      sintese: r.sintese,
      temas: r.temas,
      mapa: r.mapa,
      modelo: r.modelo,
      gerado_em: new Date().toISOString(),
    },
    { onConflict: "modelo_pergunta_id" },
  );
  if (gravado.error) return { erro: "Não foi possível guardar o consolidado. Tente de novo." };
  revalidatePath(caminhoConsolidado(modeloId, perguntaId));
  return {};
}

// Respostas que chegaram depois do consolidado: classifica só elas, nos temas que já existem.
export async function classificarNovasNoConsolidado(modeloId: string, perguntaId: string): Promise<{ erro?: string }> {
  const sessao = await exigirLogin();
  if ("erro" in sessao) return { erro: sessao.erro };
  const { supabase } = sessao;

  const [pergunta, atual] = await Promise.all([
    supabase.from("modelo_perguntas").select("enunciado").eq("id", perguntaId).maybeSingle(),
    supabase.from("consolidados").select("de, ate, temas, mapa").eq("modelo_pergunta_id", perguntaId).maybeSingle(),
  ]);
  if (pergunta.error || atual.error) return { erro: SEM_CONEXAO };
  if (!pergunta.data || !atual.data) return { erro: "Gere o consolidado primeiro." };

  const dados = await supabase.rpc("consolidado_respostas", { pergunta: perguntaId, de: atual.data.de, ate: atual.data.ate });
  if (dados.error || dados.data === null) return { erro: SEM_CONEXAO };
  const mapa = atual.data.mapa as Record<string, number>;
  const novos = itensDoConsolidado(dados.data as DadosConsolidado).filter((x) => !(x.chave in mapa));
  if (novos.length === 0) return {};

  const temas = atual.data.temas as string[];
  const r = await classificarEmTemas(pergunta.data.enunciado, temas, novos);
  if ("erro" in r) return { erro: r.erro };
  const gravado = await supabase
    .from("consolidados")
    .update({ mapa: { ...mapa, ...r.mapa } })
    .eq("modelo_pergunta_id", perguntaId)
    .select("modelo_pergunta_id");
  if (gravado.error || gravado.data.length === 0) return { erro: "Não foi possível guardar. Tente de novo." };
  revalidatePath(caminhoConsolidado(modeloId, perguntaId));
  return {};
}

export async function renomearTemaConsolidado(
  modeloId: string,
  perguntaId: string,
  numero: number,
  tituloBruto: string,
): Promise<{ erro?: string }> {
  const titulo = textoLimpo(tituloBruto, 60);
  if (!titulo) return { erro: "Dê um nome ao tema." };
  const sessao = await exigirLogin();
  if ("erro" in sessao) return { erro: sessao.erro };
  const atual = await sessao.supabase.from("consolidados").select("temas").eq("modelo_pergunta_id", perguntaId).maybeSingle();
  if (atual.error) return { erro: SEM_CONEXAO };
  const temas = (atual.data?.temas ?? []) as string[];
  if (!temas[numero - 1]) return { erro: "Tema não encontrado." };
  const r = await sessao.supabase
    .from("consolidados")
    .update({ temas: temas.map((t, i) => (i === numero - 1 ? titulo : t)) })
    .eq("modelo_pergunta_id", perguntaId)
    .select("modelo_pergunta_id");
  if (r.error || r.data.length === 0) return { erro: "Não foi possível renomear." };
  revalidatePath(caminhoConsolidado(modeloId, perguntaId));
  return {};
}
