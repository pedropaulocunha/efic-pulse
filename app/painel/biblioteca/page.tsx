import Link from "next/link";
import { redirect } from "next/navigation";
import { CabecalhoPainel } from "@/components/cabecalho-painel";
import { AvisoErroConexao } from "@/components/ui";
import { usuarioAtual } from "@/utils/auth";
import { criarClienteServidor } from "@/utils/supabase/server";
import { NovoModelo } from "./componentes";

// Biblioteca de modelos de bloco (docs/biblioteca-modelos.md). Só o admin.
export default async function Biblioteca() {
  const { user, erro } = await usuarioAtual();
  if (erro) return <AvisoErroConexao />;
  if (!user) redirect("/login");

  const supabase = await criarClienteServidor();
  const [perfil, modelos] = await Promise.all([
    supabase.from("perfis").select("papel").eq("id", user.id).maybeSingle(),
    supabase.from("modelos").select("id, titulo, arquivado, modelo_perguntas(count)").order("titulo"),
  ]);
  if (perfil.error || modelos.error) return <AvisoErroConexao />;
  if (perfil.data?.papel !== "admin") redirect("/painel");

  const lista = modelos.data.map((m) => ({
    ...m,
    perguntas: (m.modelo_perguntas as unknown as { count: number }[])[0]?.count ?? 0,
  }));
  const ativos = lista.filter((m) => !m.arquivado);
  const arquivados = lista.filter((m) => m.arquivado);

  const listaDe = (itens: typeof lista) => (
    <ul className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {itens.map((m) => (
        <li key={m.id}>
          <Link
            href={`/painel/biblioteca/${m.id}`}
            className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-slate-50"
          >
            <span className="font-medium">{m.titulo}</span>
            <span className="text-sm text-slate-500">
              {m.perguntas === 1 ? "1 pergunta" : `${m.perguntas} perguntas`}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="flex flex-1 flex-col">
      <CabecalhoPainel />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <Link href="/painel" className="text-sm text-slate-500 hover:underline">
          ← Seus eventos
        </Link>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-3xl font-semibold">Biblioteca de modelos</h1>
          <NovoModelo />
        </div>
        <p className="mt-2 max-w-3xl text-slate-600">
          Blocos de perguntas prontos para usar em vários eventos, com perguntas iguais em todos eles. Assim as
          respostas de turmas e cooperativas diferentes podem ser comparadas no comparativo de cada modelo.
        </p>

        {ativos.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-slate-500">
            Nenhum modelo ainda. Crie o primeiro, por exemplo &quot;Quebra gelo&quot;.
          </p>
        ) : (
          listaDe(ativos)
        )}

        {arquivados.length > 0 && (
          <section className="mt-10">
            <h2 className="text-lg font-medium text-slate-500">Arquivados</h2>
            {listaDe(arquivados)}
          </section>
        )}
      </main>
    </div>
  );
}
