"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { textoLimpo, UFS, uuidValido } from "@/lib/formatos";
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
// Código de acesso
// ---------------------------------------------------------------

export async function gerarOutroCodigo(eventoId: string): Promise<{ erro?: string }> {
  const sessao = await exigirLogin();
  if ("erro" in sessao) return { erro: sessao.erro };

  const { data, error } = await sessao.supabase.rpc("regenerar_codigo_acesso", { evento: eventoId });
  if (error || !data) return { erro: "Não foi possível gerar outro código. Tente de novo." };

  revalidatePath(`/painel/evento/${eventoId}`);
  return {};
}
