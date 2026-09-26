"use server";

import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CODIGO_ACESSO_REGEX,
  emailValido,
  normalizarCodigo,
  normalizarEmail,
  textoLimpo,
} from "@/lib/formatos";
import {
  criarSessao,
  encerrarSessao,
  entradaBloqueada,
  hashIpAtual,
  registrarTentativa,
} from "@/utils/participante";
import { criarClienteServico } from "@/utils/supabase/servico";

export type EstadoEntrada = {
  erro?: string;
  // Depois de "não conferem", a tela oferece o cadastro "Não estou na lista".
  oferecerCadastro?: boolean;
};

const NAO_CONFEREM = "Código ou e-mail não conferem.";
const MUITAS_TENTATIVAS = "Muitas tentativas. Espere alguns minutos.";
const TERMINOU = "Este evento já terminou.";
const FALHA = "Não foi possível entrar agora. Tente de novo em instantes.";

type EventoAberto = { id: string; data_fim: string };

// Confere o limite de tentativas e procura o evento pelo código.
// Devolve o evento aberto ou a mensagem para mostrar.
async function localizarEvento(
  db: SupabaseClient,
  ipHash: string,
  codigo: string,
): Promise<{ evento: EventoAberto } | { mensagem: string; contaComoErro: boolean }> {
  if (await entradaBloqueada(db, ipHash)) {
    return { mensagem: MUITAS_TENTATIVAS, contaComoErro: false };
  }
  if (!CODIGO_ACESSO_REGEX.test(codigo)) {
    return { mensagem: NAO_CONFEREM, contaComoErro: true };
  }

  const aberto = await db
    .from("eventos")
    .select("id, data_fim")
    .eq("codigo_acesso", codigo)
    .neq("estado", "encerrado")
    .maybeSingle();
  if (aberto.error) throw aberto.error;
  if (aberto.data) return { evento: aberto.data };

  const encerrado = await db
    .from("eventos")
    .select("id")
    .eq("codigo_acesso", codigo)
    .eq("estado", "encerrado")
    .limit(1);
  if (encerrado.error) throw encerrado.error;
  if (encerrado.data.length > 0) return { mensagem: TERMINOU, contaComoErro: false };

  return { mensagem: NAO_CONFEREM, contaComoErro: true };
}

async function buscarInscricao(db: SupabaseClient, eventoId: string, email: string) {
  const pessoa = await db.from("pessoas").select("id").eq("email", email).maybeSingle();
  if (pessoa.error) throw pessoa.error;
  if (!pessoa.data) return { pessoaId: null, inscricaoId: null };

  const inscricao = await db
    .from("inscricoes")
    .select("id")
    .eq("evento_id", eventoId)
    .eq("pessoa_id", pessoa.data.id)
    .maybeSingle();
  if (inscricao.error) throw inscricao.error;
  return { pessoaId: pessoa.data.id as string, inscricaoId: (inscricao.data?.id as string) ?? null };
}

export async function entrar(_anterior: EstadoEntrada, formData: FormData): Promise<EstadoEntrada> {
  const codigo = normalizarCodigo(formData.get("codigo"));
  const email = normalizarEmail(formData.get("email"));

  try {
    const db = criarClienteServico();
    const ipHash = await hashIpAtual();

    const busca = await localizarEvento(db, ipHash, codigo);
    if ("mensagem" in busca) {
      if (busca.contaComoErro) await registrarTentativa(db, ipHash, false);
      return { erro: busca.mensagem, oferecerCadastro: busca.mensagem === NAO_CONFEREM };
    }

    const { inscricaoId } = emailValido(email)
      ? await buscarInscricao(db, busca.evento.id, email)
      : { inscricaoId: null };

    if (!inscricaoId) {
      await registrarTentativa(db, ipHash, false);
      return { erro: NAO_CONFEREM, oferecerCadastro: true };
    }

    await registrarTentativa(db, ipHash, true);
    await criarSessao(db, inscricaoId, busca.evento.data_fim);
  } catch (e) {
    console.error("entrar:", e);
    return { erro: FALHA };
  }

  redirect("/sala");
}

export async function cadastrarNaSala(
  _anterior: EstadoEntrada,
  formData: FormData,
): Promise<EstadoEntrada> {
  const codigo = normalizarCodigo(formData.get("codigo"));
  const email = normalizarEmail(formData.get("email"));
  const nome = textoLimpo(formData.get("nome"), 120);
  const cargo = textoLimpo(formData.get("cargo"), 120) || null;
  const agencia = textoLimpo(formData.get("agencia"), 120) || null;

  if (!nome) return { erro: "Informe seu nome.", oferecerCadastro: true };
  if (!emailValido(email)) return { erro: "Confira o e-mail.", oferecerCadastro: true };

  try {
    const db = criarClienteServico();
    const ipHash = await hashIpAtual();

    const busca = await localizarEvento(db, ipHash, codigo);
    if ("mensagem" in busca) {
      if (busca.contaComoErro) await registrarTentativa(db, ipHash, false);
      return { erro: busca.mensagem, oferecerCadastro: busca.mensagem === NAO_CONFEREM };
    }
    const eventoId = busca.evento.id;

    let { pessoaId, inscricaoId } = await buscarInscricao(db, eventoId, email);

    // Pessoa nova. Se já existir (mesmo e-mail), é reaproveitada.
    if (!pessoaId) {
      const nova = await db.from("pessoas").insert({ nome, email, cargo }).select("id").single();
      if (nova.error && nova.error.code !== "23505") throw nova.error;
      pessoaId = nova.data?.id ?? (await buscarInscricao(db, eventoId, email)).pessoaId;
    }

    // Inscrição feita na sala: fica "não inscrito" até o instrutor confirmar.
    if (!inscricaoId) {
      const nova = await db
        .from("inscricoes")
        .insert({
          pessoa_id: pessoaId,
          evento_id: eventoId,
          agencia,
          origem: "cadastro_sala",
          confirmada: false,
        })
        .select("id")
        .single();
      if (nova.error && nova.error.code !== "23505") throw nova.error;
      inscricaoId = nova.data?.id ?? (await buscarInscricao(db, eventoId, email)).inscricaoId;
    }
    if (!inscricaoId) throw new Error("Inscrição não encontrada depois do cadastro");

    await registrarTentativa(db, ipHash, true);
    await criarSessao(db, inscricaoId, busca.evento.data_fim);
  } catch (e) {
    console.error("cadastrarNaSala:", e);
    return { erro: FALHA, oferecerCadastro: true };
  }

  redirect("/sala");
}

export async function sairDoAparelho() {
  await encerrarSessao();
  redirect("/");
}
