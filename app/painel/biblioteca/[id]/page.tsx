import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CabecalhoPainel } from "@/components/cabecalho-painel";
import { AvisoErroConexao, estiloBotaoCompacto, estiloBotaoSecundario, estiloCampo } from "@/components/ui";
import {
  rotuloTipo,
  type ConfigAtividade,
  type ConfigMultipla,
  type ConfigOrdenar,
  type TipoAtividade,
} from "@/lib/atividades";
import { uuidValido } from "@/lib/formatos";
import { usuarioAtual } from "@/utils/auth";
import { criarClienteServidor } from "@/utils/supabase/server";
import { BotoesModelo, BotoesPerguntaModelo, TituloModelo } from "../componentes";

type Pergunta = { id: string; ordem: number; tipo: TipoAtividade; enunciado: string; config: ConfigAtividade };

function detalhe(p: Pergunta) {
  if (p.tipo === "multipla") return (p.config as ConfigMultipla).opcoes.join(" · ");
  if (p.tipo === "ordenar") return (p.config as ConfigOrdenar).itens.join(" · ");
  return "";
}

export default async function PaginaModelo({ params }: PageProps<"/painel/biblioteca/[id]">) {
  const { id } = await params;
  if (!uuidValido(id)) notFound();

  const { user, erro } = await usuarioAtual();
  if (erro) return <AvisoErroConexao />;
  if (!user) redirect("/login");

  const supabase = await criarClienteServidor();
  const [perfil, modelo, perguntas] = await Promise.all([
    supabase.from("perfis").select("papel").eq("id", user.id).maybeSingle(),
    supabase.from("modelos").select("id, titulo, arquivado").eq("id", id).maybeSingle(),
    supabase
      .from("modelo_perguntas")
      .select("id, ordem, tipo, enunciado, config")
      .eq("modelo_id", id)
      .order("ordem")
      .order("id")
      .returns<Pergunta[]>(),
  ]);
  if (perfil.error || modelo.error || perguntas.error) return <AvisoErroConexao />;
  if (perfil.data?.papel !== "admin") redirect("/painel");
  if (!modelo.data) notFound();

  // Onde o modelo já foi usado: eventos e cooperativas (para os filtros do comparativo).
  const ids = perguntas.data.map((p) => p.id);
  const usos =
    ids.length > 0
      ? await supabase
          .from("atividades")
          .select("modelo_pergunta_id, eventos!atividades_evento_id_fkey(id, cooperativa_id, cooperativas(nome, uf))")
          .in("modelo_pergunta_id", ids)
      : { data: [], error: null };
  if (usos.error) return <AvisoErroConexao />;

  type Uso = {
    modelo_pergunta_id: string;
    eventos: { id: string; cooperativa_id: string; cooperativas: { nome: string; uf: string } | null } | null;
  };
  const listaUsos = (usos.data ?? []) as unknown as Uso[];
  const usadas = new Set(listaUsos.map((u) => u.modelo_pergunta_id));
  const eventos = new Set(listaUsos.map((u) => u.eventos?.id).filter(Boolean));
  const cooperativas = [
    ...new Map(
      listaUsos
        .filter((u) => u.eventos?.cooperativas)
        .map((u) => [u.eventos!.cooperativa_id, `${u.eventos!.cooperativas!.nome} · ${u.eventos!.cooperativas!.uf}`]),
    ).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));

  const m = modelo.data;

  return (
    <div className="flex flex-1 flex-col">
      <CabecalhoPainel />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <Link href="/painel/biblioteca" className="text-sm text-slate-500 hover:underline">
          ← Biblioteca
        </Link>
        <TituloModelo modeloId={m.id} titulo={m.titulo} />
        <p className="mt-2 text-slate-600">
          {m.arquivado ? "Arquivado · " : ""}
          {eventos.size === 0
            ? "Ainda não usado em eventos."
            : eventos.size === 1
              ? "Usado em 1 evento."
              : `Usado em ${eventos.size} eventos.`}
        </p>
        <div className="mt-4">
          <BotoesModelo modeloId={m.id} arquivado={m.arquivado} />
        </div>

        <section className="mt-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-lg font-medium text-slate-700">Perguntas ({perguntas.data.length})</h2>
            <Link href={`/painel/biblioteca/${m.id}/pergunta/nova`} className={estiloBotaoSecundario}>
              Nova pergunta
            </Link>
          </div>
          {usadas.size > 0 && (
            <p className="mt-2 text-sm text-slate-500">
              Perguntas já usadas em eventos: só o texto pode mudar. Para mudar opções, duplique o modelo.
            </p>
          )}
          {perguntas.data.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-slate-500">
              Nenhuma pergunta ainda.
            </p>
          ) : (
            <ol className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {perguntas.data.map((p, i) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      <span className="mr-2 text-slate-400">{i + 1}.</span>
                      {p.enunciado}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {rotuloTipo[p.tipo]}
                      {detalhe(p) ? ` · ${detalhe(p)}` : ""}
                      {usadas.has(p.id) ? " · usada em eventos" : ""}
                    </p>
                  </div>
                  <BotoesPerguntaModelo
                    modeloId={m.id}
                    perguntaId={p.id}
                    primeira={i === 0}
                    ultima={i === perguntas.data.length - 1}
                    usada={usadas.has(p.id)}
                  />
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-medium text-slate-700">Comparativo entre eventos (Excel)</h2>
          {eventos.size === 0 ? (
            <p className="mt-2 text-slate-500">
              Aparece aqui quando o modelo for usado em algum evento (botão &quot;Bloco da biblioteca&quot; na
              página do evento).
            </p>
          ) : (
            // Formulário comum (GET): o navegador baixa o arquivo direto.
            <form action={`/painel/biblioteca/${m.id}/comparativo`} method="get" className="mt-4 space-y-5">
              <fieldset>
                <legend className="text-sm font-medium text-slate-700">
                  Cooperativas (nenhuma marcada = todas)
                </legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {cooperativas.map(([cid, nome]) => (
                    <label key={cid} className="flex items-center gap-2 text-slate-700">
                      <input type="checkbox" name="coop" value={cid} className="size-5" />
                      {nome}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Eventos a partir de</span>
                  <input type="date" name="de" className={estiloCampo} />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Até</span>
                  <input type="date" name="ate" className={estiloCampo} />
                </label>
              </div>
              <button type="submit" className={estiloBotaoCompacto}>
                Baixar comparativo (Excel)
              </button>
            </form>
          )}
        </section>
      </main>
    </div>
  );
}
