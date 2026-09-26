import "server-only";
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
  entradaBloqueada,
  hashIpAtual,
  registrarTentativa,
} from "@/utils/participante";
import { criarClienteServico } from "@/utils/supabase/servico";

// Entrada do participante: usada pelo formulário da página inicial
// (app/acoes-entrada.ts) e pela API /api/sala/entrar (teste de carga).

export type ResultadoEntrada =
  | { ok: true }
  | {
      ok: false;
      erro: string;
      // Depois de "não conferem", a tela oferece o cadastro "Não estou na lista".
      oferecerCadastro?: boolean;
    };

const NAO_CONFEREM = "Código ou e-mail não conferem.";
const MUITAS_TENTATIVAS = "Muitas tentativas. Espere alguns minutos.";
const TERMINOU = "Este evento já terminou.";
const FALHA = "Não foi possível entrar agora. Tente de novo em instantes.";

type EventoAberto = { id: string; data_fim: string };

// Confere o limite de tentativas e procura o evento pelo código, as duas consultas juntas.
async function localizarEvento(
  db: SupabaseClient,
  ipHash: string,
  codigo: string,
): Promise<{ evento: EventoAberto } | { mensagem: string; contaComoErro: boolean }> {
  const codigoValido = CODIGO_ACESSO_REGEX.test(codigo);
  const [bloqueada, eventos] = await Promise.all([
    entradaBloqueada(db, ipHash),
    // Todos os eventos com esse código: no máximo um aberto, e talvez encerrados antigos.
    codigoValido
      ? db.from("eventos").select("id, data_fim, estado").eq("codigo_acesso", codigo)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (bloqueada) return { mensagem: MUITAS_TENTATIVAS, contaComoErro: false };
  if (eventos.error) throw eventos.error;

  const aberto = eventos.data?.find((e) => e.estado !== "encerrado");
  if (aberto) return { evento: aberto };
  if (eventos.data?.length) return { mensagem: TERMINOU, contaComoErro: false };
  return { mensagem: NAO_CONFEREM, contaComoErro: true };
}

// Inscrição da pessoa (pelo e-mail) no evento, numa consulta só.
async function inscricaoPorEmail(db: SupabaseClient, eventoId: string, email: string) {
  const { data, error } = await db
    .from("inscricoes")
    .select("id, pessoas!inner(email)")
    .eq("evento_id", eventoId)
    .eq("pessoas.email", email)
    .maybeSingle();
  if (error) throw error;
  return (data?.id as string) ?? null;
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

export async function tentarEntrada(codigoBruto: unknown, emailBruto: unknown): Promise<ResultadoEntrada> {
  const codigo = normalizarCodigo(codigoBruto);
  const email = normalizarEmail(emailBruto);

  try {
    const db = criarClienteServico();
    const ipHash = await hashIpAtual();

    const busca = await localizarEvento(db, ipHash, codigo);
    if ("mensagem" in busca) {
      if (busca.contaComoErro) await registrarTentativa(db, ipHash, false);
      return { ok: false, erro: busca.mensagem, oferecerCadastro: busca.mensagem === NAO_CONFEREM };
    }

    const inscricaoId = emailValido(email) ? await inscricaoPorEmail(db, busca.evento.id, email) : null;

    if (!inscricaoId) {
      await registrarTentativa(db, ipHash, false);
      return { ok: false, erro: NAO_CONFEREM, oferecerCadastro: true };
    }

    await Promise.all([
      registrarTentativa(db, ipHash, true),
      criarSessao(db, inscricaoId, busca.evento.data_fim),
    ]);
    return { ok: true };
  } catch (e) {
    console.error("tentarEntrada:", e);
    return { ok: false, erro: FALHA };
  }
}

export async function tentarCadastroNaSala(dados: {
  codigo: unknown;
  email: unknown;
  nome: unknown;
  cargo: unknown;
  agencia: unknown;
}): Promise<ResultadoEntrada> {
  const codigo = normalizarCodigo(dados.codigo);
  const email = normalizarEmail(dados.email);
  const nome = textoLimpo(dados.nome, 120);
  const cargo = textoLimpo(dados.cargo, 120) || null;
  const agencia = textoLimpo(dados.agencia, 120) || null;

  if (!nome) return { ok: false, erro: "Informe seu nome.", oferecerCadastro: true };
  if (!emailValido(email)) return { ok: false, erro: "Confira o e-mail.", oferecerCadastro: true };

  try {
    const db = criarClienteServico();
    const ipHash = await hashIpAtual();

    const busca = await localizarEvento(db, ipHash, codigo);
    if ("mensagem" in busca) {
      if (busca.contaComoErro) await registrarTentativa(db, ipHash, false);
      return { ok: false, erro: busca.mensagem, oferecerCadastro: busca.mensagem === NAO_CONFEREM };
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

    await Promise.all([
      registrarTentativa(db, ipHash, true),
      criarSessao(db, inscricaoId, busca.evento.data_fim),
    ]);
    return { ok: true };
  } catch (e) {
    console.error("tentarCadastroNaSala:", e);
    return { ok: false, erro: FALHA, oferecerCadastro: true };
  }
}
