import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CabecalhoPainel } from "@/components/cabecalho-painel";
import { AvisoErroConexao, estiloBotaoCompacto, estiloBotaoSecundario } from "@/components/ui";
import { formatarPeriodo, rotuloEstado, uuidValido, type EstadoEvento } from "@/lib/formatos";
import { usuarioAtual } from "@/utils/auth";
import { criarClienteServidor } from "@/utils/supabase/server";
import { confirmarInscricao } from "../acoes";
import BotaoNovoCodigo from "./botao-novo-codigo";

type Evento = {
  id: string;
  codigo_interno: string;
  codigo_acesso: string;
  nome_turma: string;
  tema: string | null;
  data_inicio: string;
  data_fim: string;
  local: string | null;
  duracao_min: number | null;
  estado: EstadoEvento;
  cooperativas: { nome: string; uf: string } | null;
};

type Inscrito = {
  id: string;
  agencia: string | null;
  origem: "lista" | "cadastro_sala";
  confirmada: boolean;
  pessoas: { nome: string; email: string; cargo: string | null } | null;
};

export default async function PaginaEvento({ params }: PageProps<"/painel/evento/[id]">) {
  const { id } = await params;
  if (!uuidValido(id)) notFound();

  const { user, erro } = await usuarioAtual();
  if (erro) return <AvisoErroConexao />;
  if (!user) redirect("/login");

  const supabase = await criarClienteServidor();
  const [evento, inscricoes] = await Promise.all([
    supabase
      .from("eventos")
      .select(
        "id, codigo_interno, codigo_acesso, nome_turma, tema, data_inicio, data_fim, local, duracao_min, estado, cooperativas(nome, uf)",
      )
      .eq("id", id)
      .maybeSingle<Evento>(),
    supabase
      .from("inscricoes")
      .select("id, agencia, origem, confirmada, pessoas(nome, email, cargo)")
      .eq("evento_id", id)
      .returns<Inscrito[]>(),
  ]);
  if (evento.error || inscricoes.error) return <AvisoErroConexao />;
  if (!evento.data) notFound();

  const e = evento.data;
  // Primeiro os que se cadastraram na sala e esperam confirmação; depois, por nome.
  const inscritos = [...inscricoes.data].sort((a, b) => {
    const pendenteA = a.origem === "cadastro_sala" && !a.confirmada ? 0 : 1;
    const pendenteB = b.origem === "cadastro_sala" && !b.confirmada ? 0 : 1;
    if (pendenteA !== pendenteB) return pendenteA - pendenteB;
    return (a.pessoas?.nome ?? "").localeCompare(b.pessoas?.nome ?? "", "pt-BR");
  });
  const pendentes = inscritos.filter((i) => i.origem === "cadastro_sala" && !i.confirmada).length;

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
          <Link href={`/painel/evento/${e.id}/editar`} className={estiloBotaoSecundario}>
            Editar evento
          </Link>
        </div>

        <section className="mt-8 flex flex-wrap items-center justify-between gap-6 rounded-2xl border border-slate-200 bg-white p-6">
          <div>
            <p className="text-sm font-medium text-slate-500">Código de acesso dos participantes</p>
            <p className="mt-1 font-mono text-5xl font-semibold tracking-[0.2em] text-slate-900">
              {e.codigo_acesso}
            </p>
          </div>
          <div className="flex flex-wrap items-start gap-3">
            <Link href={`/painel/evento/${e.id}/qrcode`} target="_blank" className={estiloBotaoCompacto}>
              Mostrar QR code
            </Link>
            <BotaoNovoCodigo eventoId={e.id} />
          </div>
        </section>

        <section className="mt-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-lg font-medium text-slate-700">
              Inscritos ({inscritos.length})
              {pendentes > 0 && (
                <span className="ml-2 rounded-full bg-amber-100 px-3 py-1 text-sm font-normal text-amber-800">
                  {pendentes} para confirmar
                </span>
              )}
            </h2>
            <Link href={`/painel/evento/${e.id}/importar`} className={estiloBotaoSecundario}>
              Importar inscritos
            </Link>
          </div>

          {inscritos.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-slate-500">
              Nenhum inscrito ainda. Importe a planilha da cooperativa.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {inscritos.map((i) => {
                const naoInscrito = i.origem === "cadastro_sala" && !i.confirmada;
                return (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {i.pessoas?.nome}
                        {naoInscrito && (
                          <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                            não inscrito
                          </span>
                        )}
                      </p>
                      <p className="truncate text-sm text-slate-500">
                        {i.pessoas?.email}
                        {i.pessoas?.cargo ? ` · ${i.pessoas.cargo}` : ""}
                        {i.agencia ? ` · Agência ${i.agencia}` : ""}
                        {" · "}
                        {i.origem === "lista" ? "Lista" : "Cadastro na sala"}
                      </p>
                    </div>
                    {naoInscrito && (
                      <form action={confirmarInscricao.bind(null, e.id, i.id)}>
                        <button type="submit" className={estiloBotaoSecundario}>
                          Confirmar
                        </button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
