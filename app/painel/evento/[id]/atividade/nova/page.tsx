import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CabecalhoPainel } from "@/components/cabecalho-painel";
import { AvisoErroConexao } from "@/components/ui";
import { uuidValido } from "@/lib/formatos";
import { usuarioAtual } from "@/utils/auth";
import { criarClienteServidor } from "@/utils/supabase/server";
import FormularioAtividade from "../formulario-atividade";

export default async function NovaAtividade({ params }: PageProps<"/painel/evento/[id]/atividade/nova">) {
  const { id } = await params;
  if (!uuidValido(id)) notFound();

  const { user, erro } = await usuarioAtual();
  if (erro) return <AvisoErroConexao />;
  if (!user) redirect("/login");

  const supabase = await criarClienteServidor();
  const evento = await supabase.from("eventos").select("id, nome_turma").eq("id", id).maybeSingle();
  if (evento.error) return <AvisoErroConexao />;
  if (!evento.data) notFound();

  return (
    <div className="flex flex-1 flex-col">
      <CabecalhoPainel />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <Link href={`/painel/evento/${id}#atividades`} className="text-sm text-slate-500 hover:underline">
          ← {evento.data.nome_turma}
        </Link>
        <h1 className="mt-4 text-2xl font-semibold">Nova atividade</h1>
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
          <FormularioAtividade eventoId={id} atividadeId={null} />
        </div>
      </main>
    </div>
  );
}
