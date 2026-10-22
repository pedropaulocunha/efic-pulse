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

// ---------------------------------------------------------------
// Duplicar evento: evento novo (no nome de quem duplica) com os mesmos blocos e
// perguntas, todas fechadas, sem respostas, com código de acesso novo.
// Pergunta da biblioteca continua ligada ao modelo, na versão atual dele.
// ---------------------------------------------------------------

type AtividadeParaCopiar = {
  bloco_id: string;
  ordem: number;
  tipo: string;
  enunciado: string;
  config: unknown;
  observacao: string | null;
  tempo_resposta_seg: number | null;
  modelo_pergunta_id: string | null;
};

export async function duplicarEvento(
  origemId: string,
  _anterior: EstadoFormularioEvento,
  formData: FormData,
): Promise<EstadoFormularioEvento> {
  if (!uuidValido(origemId)) return { erro: "Evento inválido." };
  const sessao = await exigirLogin();
  if ("erro" in sessao) return { erro: sessao.erro };
  const { user, supabase } = sessao;

  const nomeTurma = textoLimpo(formData.get("nome_turma"), 200);
  const dataInicio = String(formData.get("data_inicio") ?? "");
  const dataFim = String(formData.get("data_fim") ?? "");
  const local = textoLimpo(formData.get("local"), 200) || null;
  const cooperativaId = String(formData.get("cooperativa_id") ?? "");
  if (!nomeTurma) return { erro: "Informe o nome da turma." };
  if (!DATA.test(dataInicio) || !DATA.test(dataFim)) return { erro: "Informe as datas de início e fim." };
  if (dataFim < dataInicio) return { erro: "A data de fim não pode ser antes da data de início." };
  if (!uuidValido(cooperativaId)) return { erro: "Escolha a cooperativa." };

  const [origem, blocos, atividades] = await Promise.all([
    supabase.from("eventos").select("tema, duracao_min").eq("id", origemId).maybeSingle(),
    supabase.from("blocos").select("id, ordem, titulo").eq("evento_id", origemId).order("ordem").order("id"),
    supabase
      .from("atividades")
      .select("bloco_id, ordem, tipo, enunciado, config, observacao, tempo_resposta_seg, modelo_pergunta_id")
      .eq("evento_id", origemId)
      .returns<AtividadeParaCopiar[]>(),
  ]);
  if (origem.error || blocos.error || atividades.error) return { erro: SEM_CONEXAO };
  if (!origem.data) return { erro: "Evento não encontrado." };

  // Perguntas da biblioteca: texto, opções e observação da versão atual do modelo
  // (o banco só aceita a ligação se a pergunta for igual à do modelo).
  const idsModelo = [...new Set(atividades.data.map((a) => a.modelo_pergunta_id).filter((id): id is string => !!id))];
  const modelos = new Map<string, { tipo: string; enunciado: string; config: unknown; observacao: string | null }>();
  if (idsModelo.length > 0) {
    const r = await supabase.from("modelo_perguntas").select("id, tipo, enunciado, config, observacao").in("id", idsModelo);
    if (r.error) return { erro: SEM_CONEXAO };
    for (const m of r.data) modelos.set(m.id, m);
  }

  const criado = await supabase
    .from("eventos")
    .insert({
      cooperativa_id: cooperativaId,
      nome_turma: nomeTurma,
      data_inicio: dataInicio,
      data_fim: dataFim,
      local,
      tema: origem.data.tema,
      duracao_min: origem.data.duracao_min,
      instrutor_id: user.id,
    })
    .select("id")
    .single();
  if (criado.error) return { erro: "Não foi possível criar o evento. Tente de novo." };
  const novoId = criado.data.id as string;

  try {
    for (const b of blocos.data) {
      const novoBloco = await supabase
        .from("blocos")
        .insert({ evento_id: novoId, ordem: b.ordem, titulo: b.titulo })
        .select("id")
        .single();
      if (novoBloco.error) throw novoBloco.error;
      const copias = atividades.data
        .filter((a) => a.bloco_id === b.id)
        .map((a) => {
          const m = a.modelo_pergunta_id ? modelos.get(a.modelo_pergunta_id) : undefined;
          return {
            evento_id: novoId,
            bloco_id: novoBloco.data.id,
            ordem: a.ordem,
            tipo: m?.tipo ?? a.tipo,
            enunciado: m?.enunciado ?? a.enunciado,
            config: m?.config ?? a.config,
            observacao: m ? m.observacao : a.observacao,
            tempo_resposta_seg: a.tempo_resposta_seg,
            modelo_pergunta_id: m ? a.modelo_pergunta_id : null,
          };
        });
      if (copias.length > 0) {
        const r = await supabase.from("atividades").insert(copias);
        if (r.error) throw r.error;
      }
    }
  } catch (e) {
    console.error("duplicarEvento:", e);
    // Desfaz: apagar o evento leva junto os blocos e perguntas já copiados.
    // Só o admin pode apagar evento (0006); para instrutor, avisa o que ficou.
    const desfeito = await supabase.from("eventos").delete().eq("id", novoId).select("id");
    if (desfeito.error || desfeito.data.length === 0) {
      return {
        erro: `A cópia parou no meio: o evento "${nomeTurma}" foi criado, mas sem todas as perguntas. Peça ao admin para excluí-lo e tente de novo.`,
      };
    }
    return { erro: "Não foi possível copiar as perguntas. Nada foi criado; tente de novo." };
  }

  revalidatePath("/painel");
  redirect(`/painel/evento/${novoId}`);
}
