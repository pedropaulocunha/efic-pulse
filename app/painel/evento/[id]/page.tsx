import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CabecalhoPainel } from "@/components/cabecalho-painel";
import { AvisoErroConexao, estiloBotaoCompacto, estiloBotaoSecundario } from "@/components/ui";
import { agruparPorBloco, type Bloco } from "@/lib/blocos";
import { formatarData, formatarPeriodo, rotuloEstado, uuidValido, type EstadoEvento } from "@/lib/formatos";
import { usuarioAtual } from "@/utils/auth";
import { criarClienteServidor } from "@/utils/supabase/server";
import {
  rotuloEstadoAtividade,
  rotuloTipo,
  type ConfigAberta,
  type ConfigAtividade,
  type ConfigEscala,
  type ConfigMultipla,
  type ConfigNumero,
  type ConfigNuvem,
  type ConfigOrdenar,
  type EstadoAtividade,
  type TipoAtividade,
} from "@/lib/atividades";
import BotaoNovoCodigo from "./botao-novo-codigo";
import {
  BotaoCopiarLink,
  BotaoEstadoEvento,
  BotaoNovoBloco,
  BotoesAtividade,
  CabecalhoBloco,
  SeletorBloco,
} from "./botoes-evento";

type Atividade = {
  id: string;
  ordem: number;
  bloco_id: string | null;
  tipo: TipoAtividade;
  enunciado: string;
  config: ConfigAtividade;
  estado: EstadoAtividade;
  rodada_atual: number;
};

// Resumo da configuração, numa linha.
function resumoConfig(a: Atividade) {
  switch (a.tipo) {
    case "multipla":
      return (a.config as ConfigMultipla).opcoes.join(" · ");
    case "ordenar":
      return (a.config as ConfigOrdenar).itens.join(" · ");
    case "escala": {
      const c = a.config as ConfigEscala;
      const u = c.unidade ? ` ${c.unidade}` : "";
      const ref = typeof c.referencia === "number" ? ` · referência ${c.referencia}${u}` : "";
      return `De ${c.min} a ${c.max}${u}, passo ${c.passo}${ref}`;
    }
    case "numero": {
      const c = a.config as ConfigNumero;
      const u = c.unidade ? ` em ${c.unidade}` : "";
      const limites =
        typeof c.min === "number" || typeof c.max === "number"
          ? `, de ${c.min ?? "…"} a ${c.max ?? "…"}`
          : "";
      const ref = typeof c.referencia === "number" ? ` · referência ${c.referencia}` : "";
      return `Número${u}${limites}${ref}`;
    }
    case "nuvem": {
      const n = (a.config as ConfigNuvem).max_palavras;
      return n === 1 ? "1 palavra" : `Até ${n} palavras`;
    }
    case "aberta":
      return `Texto de até ${(a.config as ConfigAberta).max_caracteres} caracteres, com aprovação`;
  }
}

const corEstadoAtividade: Record<EstadoAtividade, string> = {
  fechada: "bg-slate-100 text-slate-600",
  aberta: "bg-emerald-100 text-emerald-800",
  encerrada: "bg-sky-100 text-sky-800",
};

type Evento = {
  id: string;
  codigo_interno: string;
  codigo_acesso: string;
  projecao_token: string;
  nome_turma: string;
  tema: string | null;
  data_inicio: string;
  data_fim: string;
  local: string | null;
  duracao_min: number | null;
  estado: EstadoEvento;
  cooperativas: { nome: string; uf: string } | null;
};

export default async function PaginaEvento({ params }: PageProps<"/painel/evento/[id]">) {
  const { id } = await params;
  if (!uuidValido(id)) notFound();

  const { user, erro } = await usuarioAtual();
  if (erro) return <AvisoErroConexao />;
  if (!user) redirect("/login");

  const supabase = await criarClienteServidor();
  const [evento, participantes, atividades, blocos, perfil] = await Promise.all([
    supabase
      .from("eventos")
      .select(
        "id, codigo_interno, codigo_acesso, projecao_token, nome_turma, tema, data_inicio, data_fim, local, duracao_min, estado, cooperativas(nome, uf)",
      )
      .eq("id", id)
      .maybeSingle<Evento>(),
    supabase.from("inscricoes").select("id", { count: "exact", head: true }).eq("evento_id", id),
    supabase
      .from("atividades")
      .select("id, ordem, bloco_id, tipo, enunciado, config, estado, rodada_atual")
      .eq("evento_id", id)
      .returns<Atividade[]>(),
    supabase.from("blocos").select("id, ordem, titulo").eq("evento_id", id).returns<Bloco[]>(),
    supabase.from("perfis").select("papel").eq("id", user.id).maybeSingle(),
  ]);
  if (evento.error || participantes.error || atividades.error || blocos.error || perfil.error) {
    return <AvisoErroConexao />;
  }
  const ehAdmin = perfil.data?.papel === "admin";
  if (!evento.data) notFound();

  const e = evento.data;
  const grupos = agruparPorBloco(atividades.data, blocos.data);
  const totalAtividades = atividades.data.length;
  const encerrado = e.estado === "encerrado";
  const nParticipantes = participantes.count ?? 0;

  // Numeração corrida (1, 2, 3...) em todos os blocos.
  const numero = new Map(grupos.flatMap((g) => g.atividades).map((a, i) => [a.id, i + 1]));

  return (
    <div className="flex flex-1 flex-col">
      <CabecalhoPainel />

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <Link href="/painel" className="text-sm text-slate-500 hover:underline">
          ← Seus eventos
        </Link>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm uppercase tracking-wide text-slate-500">
              {e.cooperativas?.nome} · {e.cooperativas?.uf}
            </p>
            <h1 className="mt-1 text-3xl font-semibold">{e.nome_turma}</h1>
            <p className="mt-2 text-slate-600">
              {formatarPeriodo(e.data_inicio, e.data_fim)}
              {e.local ? ` · ${e.local}` : ""}
              {e.duracao_min ? ` · ${e.duracao_min} min` : ""}
            </p>
            {e.tema && <p className="mt-1 text-slate-600">Tema: {e.tema}</p>}
            <p className="mt-2 text-sm text-slate-500">
              Código interno {e.codigo_interno} · {rotuloEstado[e.estado]}
            </p>
          </div>
          <div className="flex flex-wrap items-start gap-3">
            <Link href={`/painel/evento/${e.id}/editar`} className={estiloBotaoSecundario}>
              Editar evento
            </Link>
            <BotaoEstadoEvento eventoId={e.id} encerrado={encerrado} podeReabrir={ehAdmin} />
          </div>
        </div>

        <section className="mt-8 flex flex-wrap items-center justify-between gap-6 rounded-2xl border border-slate-200 bg-white p-6">
          <div>
            <p className="text-sm font-medium text-slate-500">Código de acesso dos participantes</p>
            <p className="mt-1 font-mono text-5xl font-semibold tracking-[0.2em] text-slate-900">
              {e.codigo_acesso}
            </p>
            <p className="mt-2 text-sm text-slate-500">
              {encerrado
                ? "Evento encerrado: o código não vale mais."
                : `Entrada só com o código, sem e-mail. Vale até 23h59 de ${formatarData(e.data_fim)}.`}
              {" · "}
              {nParticipantes === 1 ? "1 participante entrou" : `${nParticipantes} participantes entraram`}
            </p>
          </div>
          <div className="flex flex-wrap items-start gap-3">
            <Link href={`/painel/evento/${e.id}/qrcode`} target="_blank" className={estiloBotaoCompacto}>
              Mostrar QR code
            </Link>
            <BotaoNovoCodigo eventoId={e.id} />
          </div>
        </section>

        <section className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-6">
          <p className="mr-auto text-sm font-medium text-slate-500">Sala ao vivo</p>
          <Link href={`/painel/evento/${e.id}/controle`} className={estiloBotaoCompacto}>
            Controle da sala
          </Link>
          <Link href={`/projecao/${e.projecao_token}`} target="_blank" className={estiloBotaoSecundario}>
            Abrir projeção
          </Link>
          <BotaoCopiarLink caminho={`/projecao/${e.projecao_token}`} />
          {/* Arquivo para baixar: link comum, não Link do Next. */}
          <a href={`/painel/evento/${e.id}/relatorio`} className={estiloBotaoSecundario}>
            Baixar relatório (Excel)
          </a>
        </section>

        <section id="atividades" className="mt-10 scroll-mt-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-lg font-medium text-slate-700">Atividades ({totalAtividades})</h2>
            <div className="flex flex-wrap items-start gap-3">
              <BotaoNovoBloco eventoId={e.id} />
              {blocos.data.length > 0 && (
                <Link href={`/painel/evento/${e.id}/atividade/nova`} className={estiloBotaoSecundario}>
                  Nova atividade
                </Link>
              )}
            </div>
          </div>

          {grupos.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-slate-500">
              Nenhuma atividade ainda. Toda pergunta fica dentro de um bloco: comece em <strong>Novo bloco</strong>
              (ex.: Abertura) e depois toque em <strong>+ Atividade</strong> no bloco.
            </p>
          ) : (
            <div className="mt-4 space-y-6">
              {grupos.map((g, gi) => (
                <div key={g.bloco?.id ?? "sem-bloco"}>
                  {g.bloco ? (
                    <CabecalhoBloco
                      eventoId={e.id}
                      bloco={g.bloco}
                      quantidade={g.atividades.length}
                      primeiro={gi === 0}
                      ultimo={gi === grupos.length - 1}
                    />
                  ) : (
                    blocos.data.length > 0 && (
                      <p className="mb-2 text-sm font-medium uppercase tracking-wide text-slate-400">Sem bloco</p>
                    )
                  )}

                  {g.atividades.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-6 text-center text-sm text-slate-500">
                      Bloco vazio. Crie uma atividade nele ou traga uma com as setas ↑ ↓.
                    </p>
                  ) : (
                    <ol className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                      {g.atividades.map((a, i) => (
                          <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
                            <div className="min-w-0 flex-1">
                              <p className="font-medium">
                                <span className="mr-2 text-slate-400">{numero.get(a.id)}.</span>
                                {a.enunciado}
                              </p>
                              <p className="mt-1 text-sm text-slate-500">
                                {rotuloTipo[a.tipo]} · {resumoConfig(a)}
                              </p>
                              {a.bloco_id && blocos.data.length > 1 && (
                                <SeletorBloco
                                  eventoId={e.id}
                                  atividadeId={a.id}
                                  blocoAtual={a.bloco_id}
                                  blocos={[...blocos.data].sort((x, y) => x.ordem - y.ordem)}
                                />
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`rounded-full px-3 py-1 text-sm ${corEstadoAtividade[a.estado]}`}>
                                {rotuloEstadoAtividade[a.estado]}
                                {a.rodada_atual > 1 ? ` · rodada ${a.rodada_atual}` : ""}
                              </span>
                              {a.estado === "fechada" && (
                                <Link
                                  href={`/painel/evento/${e.id}/atividade/${a.id}`}
                                  className="inline-flex h-11 items-center rounded-lg border border-slate-300 bg-white px-3 text-slate-600 hover:bg-slate-50"
                                >
                                  Editar
                                </Link>
                              )}
                              {/* As setas atravessam blocos: na ponta, a atividade passa para o bloco vizinho. */}
                              <BotoesAtividade
                                eventoId={e.id}
                                atividadeId={a.id}
                                primeira={gi === 0 && i === 0}
                                ultima={gi === grupos.length - 1 && i === g.atividades.length - 1}
                                podeExcluir={a.estado !== "aberta"}
                              />
                            </div>
                          </li>
                      ))}
                    </ol>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
