"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { textoLimpo, UFS, uuidValido } from "@/lib/formatos";
import { interpretarPlanilha, type LinhaPlanilha } from "@/lib/planilha";
import { usuarioAtual } from "@/utils/auth";
import { criarClienteServidor } from "@/utils/supabase/server";

// Todas as ações usam o login do instrutor: as políticas do banco (RLS)
// garantem que ele só mexe nos próprios eventos.

const SEM_CONEXAO = "Sem conexão com o Pulse agora. Tente de novo em instantes.";

async function exigirLogin() {
  const { user, erro } = await usuarioAtual();
  if (erro) return { erro: SEM_CONEXAO } as const;
  if (!user) redirect("/login");
  return { user, supabase: await criarClienteServidor() } as const;
}

// ---------------------------------------------------------------
// Criar e editar evento
// ---------------------------------------------------------------

export type EstadoFormularioEvento = { erro?: string };

const DATA = /^\d{4}-\d{2}-\d{2}$/;

export async function salvarEvento(
  eventoId: string | null,
  _anterior: EstadoFormularioEvento,
  formData: FormData,
): Promise<EstadoFormularioEvento> {
  const sessao = await exigirLogin();
  if ("erro" in sessao) return { erro: sessao.erro };
  const { user, supabase } = sessao;

  const cooperativaEscolhida = String(formData.get("cooperativa_id") ?? "");
  const nomeTurma = textoLimpo(formData.get("nome_turma"), 200);
  const dataInicio = String(formData.get("data_inicio") ?? "");
  const dataFim = String(formData.get("data_fim") ?? "");
  const local = textoLimpo(formData.get("local"), 200) || null;
  const tema = textoLimpo(formData.get("tema"), 300) || null;
  const duracaoTexto = String(formData.get("duracao_min") ?? "").trim();

  if (cooperativaEscolhida !== "nova" && !uuidValido(cooperativaEscolhida)) {
    return { erro: "Escolha a cooperativa." };
  }
  if (!nomeTurma) return { erro: "Informe o nome da turma." };
  if (!DATA.test(dataInicio) || !DATA.test(dataFim)) return { erro: "Informe as datas de início e fim." };
  if (dataFim < dataInicio) return { erro: "A data de fim não pode ser antes da data de início." };

  let duracaoMin: number | null = null;
  if (duracaoTexto) {
    duracaoMin = Number(duracaoTexto);
    if (!Number.isInteger(duracaoMin) || duracaoMin <= 0 || duracaoMin > 100000) {
      return { erro: "A duração precisa ser um número inteiro de minutos." };
    }
  }

  let cooperativaId = cooperativaEscolhida;
  if (cooperativaEscolhida === "nova") {
    const nome = textoLimpo(formData.get("cooperativa_nome"), 200);
    const uf = String(formData.get("cooperativa_uf") ?? "");
    const central = textoLimpo(formData.get("cooperativa_central"), 200) || null;
    if (!nome) return { erro: "Informe o nome da nova cooperativa." };
    if (!UFS.includes(uf)) return { erro: "Escolha a UF da nova cooperativa." };

    const nova = await supabase.from("cooperativas").insert({ nome, uf, central }).select("id").single();
    if (nova.error) return { erro: "Não foi possível criar a cooperativa. Tente de novo." };
    cooperativaId = nova.data.id;
  }

  const campos = {
    cooperativa_id: cooperativaId,
    nome_turma: nomeTurma,
    data_inicio: dataInicio,
    data_fim: dataFim,
    local,
    tema,
    duracao_min: duracaoMin,
  };

  let destino: string;
  if (eventoId) {
    const alterado = await supabase.from("eventos").update(campos).eq("id", eventoId).select("id");
    if (alterado.error) return { erro: "Não foi possível salvar o evento. Tente de novo." };
    if (alterado.data.length === 0) return { erro: "Evento não encontrado." };
    destino = eventoId;
  } else {
    const criado = await supabase
      .from("eventos")
      .insert({ ...campos, instrutor_id: user.id })
      .select("id")
      .single();
    if (criado.error) return { erro: "Não foi possível criar o evento. Tente de novo." };
    destino = criado.data.id;
  }

  revalidatePath("/painel");
  redirect(`/painel/evento/${destino}`);
}

// ---------------------------------------------------------------
// Código de acesso e inscrições
// ---------------------------------------------------------------

export async function gerarOutroCodigo(eventoId: string): Promise<{ erro?: string }> {
  const sessao = await exigirLogin();
  if ("erro" in sessao) return { erro: sessao.erro };

  const { data, error } = await sessao.supabase.rpc("regenerar_codigo_acesso", { evento: eventoId });
  if (error || !data) return { erro: "Não foi possível gerar outro código. Tente de novo." };

  revalidatePath(`/painel/evento/${eventoId}`);
  return {};
}

export async function confirmarInscricao(eventoId: string, inscricaoId: string) {
  const sessao = await exigirLogin();
  if ("erro" in sessao) return;

  await sessao.supabase
    .from("inscricoes")
    .update({ confirmada: true })
    .eq("id", inscricaoId)
    .eq("evento_id", eventoId);

  revalidatePath(`/painel/evento/${eventoId}`);
}

// ---------------------------------------------------------------
// Importar inscritos
// ---------------------------------------------------------------

export type SituacaoLinha = "nova" | "existente" | "inscrita" | "erro";
export type LinhaPrevia = LinhaPlanilha & { situacao: SituacaoLinha };
export type Previa = { erro?: string; linhas: LinhaPrevia[] };

const LOTE = 100;

function emLotes<T>(lista: T[]) {
  const lotes: T[][] = [];
  for (let i = 0; i < lista.length; i += LOTE) lotes.push(lista.slice(i, i + LOTE));
  return lotes;
}

// Pessoas já cadastradas (por e-mail) e quais delas já estão inscritas no evento.
async function consultarExistentes(supabase: SupabaseClient, eventoId: string, emails: string[]) {
  const pessoaPorEmail = new Map<string, string>();
  for (const lote of emLotes(emails)) {
    const { data, error } = await supabase.from("pessoas").select("id, email").in("email", lote);
    if (error) throw error;
    for (const p of data) pessoaPorEmail.set(p.email, p.id);
  }

  const inscritas = new Set<string>();
  for (const lote of emLotes([...pessoaPorEmail.values()])) {
    const { data, error } = await supabase
      .from("inscricoes")
      .select("pessoa_id")
      .eq("evento_id", eventoId)
      .in("pessoa_id", lote);
    if (error) throw error;
    for (const i of data) inscritas.add(i.pessoa_id);
  }

  return { pessoaPorEmail, inscritas };
}

async function montarPrevia(supabase: SupabaseClient, eventoId: string, texto: string): Promise<Previa> {
  const { erro, linhas } = interpretarPlanilha(texto);
  if (erro) return { erro, linhas: [] };

  const validas = linhas.filter((l) => !l.erro);
  const { pessoaPorEmail, inscritas } = await consultarExistentes(
    supabase,
    eventoId,
    validas.map((l) => l.email),
  );

  return {
    linhas: linhas.map((l) => {
      if (l.erro) return { ...l, situacao: "erro" };
      const pessoaId = pessoaPorEmail.get(l.email);
      if (!pessoaId) return { ...l, situacao: "nova" };
      return { ...l, situacao: inscritas.has(pessoaId) ? "inscrita" : "existente" };
    }),
  };
}

async function conferirEvento(supabase: SupabaseClient, eventoId: string) {
  if (!uuidValido(eventoId)) return false;
  const { data } = await supabase.from("eventos").select("id").eq("id", eventoId).maybeSingle();
  return Boolean(data);
}

export async function previaImportacao(eventoId: string, texto: string): Promise<Previa> {
  const sessao = await exigirLogin();
  if ("erro" in sessao) return { erro: sessao.erro, linhas: [] };
  if (!(await conferirEvento(sessao.supabase, eventoId))) {
    return { erro: "Evento não encontrado.", linhas: [] };
  }

  try {
    return await montarPrevia(sessao.supabase, eventoId, texto);
  } catch (e) {
    console.error("previaImportacao:", e);
    return { erro: SEM_CONEXAO, linhas: [] };
  }
}

// Grava a partir do mesmo texto da prévia, conferindo tudo de novo no servidor.
export async function gravarImportacao(
  eventoId: string,
  texto: string,
): Promise<{ erro?: string; gravadas?: number }> {
  const sessao = await exigirLogin();
  if ("erro" in sessao) return { erro: sessao.erro };
  const { supabase } = sessao;
  if (!(await conferirEvento(supabase, eventoId))) return { erro: "Evento não encontrado." };

  try {
    const previa = await montarPrevia(supabase, eventoId, texto);
    if (previa.erro) return { erro: previa.erro };

    const aGravar = previa.linhas.filter((l) => l.situacao === "nova" || l.situacao === "existente");
    if (aGravar.length === 0) return { gravadas: 0 };

    // Pessoas novas. Se alguém cadastrou o mesmo e-mail nesse meio-tempo, é reaproveitado.
    const novas = aGravar.filter((l) => l.situacao === "nova");
    for (const lote of emLotes(novas)) {
      const { error } = await supabase.from("pessoas").upsert(
        lote.map((l) => ({ nome: l.nome, email: l.email, cargo: l.cargo || null })),
        { onConflict: "email", ignoreDuplicates: true },
      );
      if (error) throw error;
    }

    const { pessoaPorEmail } = await consultarExistentes(
      supabase,
      eventoId,
      aGravar.map((l) => l.email),
    );

    // Inscrições vindas da lista já nascem confirmadas.
    const inscricoes = aGravar
      .filter((l) => pessoaPorEmail.has(l.email))
      .map((l) => ({
        pessoa_id: pessoaPorEmail.get(l.email)!,
        evento_id: eventoId,
        agencia: l.agencia || null,
        origem: "lista",
        confirmada: true,
      }));
    for (const lote of emLotes(inscricoes)) {
      const { error } = await supabase
        .from("inscricoes")
        .upsert(lote, { onConflict: "pessoa_id,evento_id", ignoreDuplicates: true });
      if (error) throw error;
    }

    revalidatePath(`/painel/evento/${eventoId}`);
    return { gravadas: inscricoes.length };
  } catch (e) {
    console.error("gravarImportacao:", e);
    return {
      erro: "A importação não terminou. Pode enviar de novo: quem já foi gravado não se repete.",
    };
  }
}
