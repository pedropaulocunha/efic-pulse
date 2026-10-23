import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CabecalhoPainel } from "@/components/cabecalho-painel";
import { AvisoErroConexao } from "@/components/ui";
import { contarPorEvento, itensDoConsolidado, type DadosConsolidado } from "@/lib/consolidado";
import { uuidValido } from "@/lib/formatos";
import { iaConfigurada } from "@/utils/ia";
import { usuarioAtual } from "@/utils/auth";
import { criarClienteServidor } from "@/utils/supabase/server";
import PainelConsolidado from "./painel";

// Consolidado por IA de uma pergunta do modelo, com todas as turmas, e a
// comparação de um grupo de eventos com os outros do período (docs/consolidado.md).
export const maxDuration = 300; // a IA classifica em lotes; com muitas respostas, demora.

export default async function Consolidado({ params }: PageProps<"/painel/biblioteca/[id]/pergunta/[perguntaId]/consolidado">) {
  const { id, perguntaId } = await params;
  if (!uuidValido(id) || !uuidValido(perguntaId)) notFound();

  const { user, erro } = await usuarioAtual();
  if (erro) return <AvisoErroConexao />;
  if (!user) redirect("/login");

  const supabase = await criarClienteServidor();
  const [perfil, pergunta, guardado] = await Promise.all([
    supabase.from("perfis").select("papel").eq("id", user.id).maybeSingle(),
    supabase
      .from("modelo_perguntas")
      .select("enunciado, tipo, modelos(titulo)")
      .eq("id", perguntaId)
      .eq("modelo_id", id)
      .maybeSingle(),
    supabase
      .from("consolidados")
      .select("de, ate, sintese, temas, mapa, gerado_em, modelo")
      .eq("modelo_pergunta_id", perguntaId)
      .maybeSingle(),
  ]);
  if (perfil.error || pergunta.error || guardado.error) return <AvisoErroConexao />;
  if (perfil.data?.papel !== "admin") redirect("/painel");
  if (!pergunta.data) notFound();
  const modeloTitulo = (pergunta.data.modelos as unknown as { titulo: string } | null)?.titulo ?? "";

  const voltar = (
    <Link href={`/painel/biblioteca/${id}`} className="text-sm text-slate-500 hover:underline">
      ← {modeloTitulo}
    </Link>
  );
  if (!["aberta", "nuvem"].includes(pergunta.data.tipo)) {
    return (
      <div className="flex flex-1 flex-col">
        <CabecalhoPainel />
        <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
          {voltar}
          <p className="mt-6 text-slate-600">
            O consolidado por IA vale para perguntas de texto livre e de nuvem. Para as outras, use o comparativo em
            Excel na página do modelo.
          </p>
        </main>
      </div>
    );
  }

  // As respostas do recorte do consolidado guardado (ou de todo o período, se ainda não há).
  const c = guardado.data;
  const dados = await supabase.rpc("consolidado_respostas", { pergunta: perguntaId, de: c?.de ?? null, ate: c?.ate ?? null });
  if (dados.error || dados.data === null) return <AvisoErroConexao />;
  const d = dados.data as DadosConsolidado;
  const itens = itensDoConsolidado(d);

  let consolidado = null;
  if (c) {
    const temas = c.temas as string[];
    const mapa = c.mapa as Record<string, number>;
    const porEvento = contarPorEvento(d, temas.length, mapa);
    // Exemplos por tema: respostas (texto livre) ou as palavras mais citadas (nuvem).
    const exemplos: string[][] = Array.from({ length: temas.length + 1 }, () => []);
    for (const it of [...itens].sort((a, b) => b.vezes - a.vezes || a.texto.length - b.texto.length)) {
      const t = mapa[it.chave];
      if (t === undefined) continue;
      if (exemplos[t].length < (d.tipo === "aberta" ? 2 : 6)) exemplos[t].push(it.texto);
    }
    consolidado = {
      temas,
      sintese: c.sintese as string | null,
      de: c.de as string | null,
      ate: c.ate as string | null,
      geradoEm: c.gerado_em as string,
      exemplos,
      novos: itens.filter((x) => !(x.chave in mapa)).length,
      contagens: Object.fromEntries(porEvento),
    };
  }

  return (
    <div className="flex flex-1 flex-col">
      <CabecalhoPainel />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        {voltar}
        <h1 className="mt-4 text-2xl font-semibold">Consolidado: {pergunta.data.enunciado}</h1>
        <p className="mt-2 text-slate-600">
          Todas as turmas que responderam a esta pergunta do modelo ({d.eventos.length}{" "}
          {d.eventos.length === 1 ? "evento" : "eventos"}, {itens.length}{" "}
          {d.tipo === "aberta" ? "respostas" : "palavras diferentes"}). A IA define um único conjunto de temas para
          todas; o Pulse conta as pessoas por tema e por evento.
        </p>
        <PainelConsolidado
          modeloId={id}
          perguntaId={perguntaId}
          tipo={d.tipo}
          eventos={d.eventos}
          consolidado={consolidado}
          iaConfigurada={iaConfigurada()}
        />
      </main>
    </div>
  );
}
