import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CabecalhoPainel } from "@/components/cabecalho-painel";
import FormularioPergunta from "@/components/formulario-pergunta";
import { AvisoErroConexao } from "@/components/ui";
import { uuidValido } from "@/lib/formatos";
import { usuarioAtual } from "@/utils/auth";
import { criarClienteServidor } from "@/utils/supabase/server";
import { salvarPerguntaModelo } from "../../../acoes";

export default async function NovaPerguntaModelo({ params }: PageProps<"/painel/biblioteca/[id]/pergunta/nova">) {
  const { id } = await params;
  if (!uuidValido(id)) notFound();

  const { user, erro } = await usuarioAtual();
  if (erro) return <AvisoErroConexao />;
  if (!user) redirect("/login");

  const supabase = await criarClienteServidor();
  const modelo = await supabase.from("modelos").select("titulo").eq("id", id).maybeSingle();
  if (modelo.error) return <AvisoErroConexao />;
  if (!modelo.data) notFound();

  return (
    <div className="flex flex-1 flex-col">
      <CabecalhoPainel />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <Link href={`/painel/biblioteca/${id}`} className="text-sm text-slate-500 hover:underline">
          ← {modelo.data.titulo}
        </Link>
        <h1 className="mt-4 text-2xl font-semibold">Nova pergunta do modelo</h1>
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
          <FormularioPergunta acaoSalvar={salvarPerguntaModelo.bind(null, id, null)} voltar={`/painel/biblioteca/${id}`} />
        </div>
      </main>
    </div>
  );
}
