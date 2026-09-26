import { notFound, redirect } from "next/navigation";
import { CabecalhoPainel } from "@/components/cabecalho-painel";
import { AvisoErroConexao } from "@/components/ui";
import { uuidValido } from "@/lib/formatos";
import { usuarioAtual } from "@/utils/auth";
import { criarClienteServidor } from "@/utils/supabase/server";
import FormularioEvento, { type Cooperativa, type DadosEvento } from "../../formulario-evento";

export default async function EditarEvento({ params }: PageProps<"/painel/evento/[id]/editar">) {
  const { id } = await params;
  if (!uuidValido(id)) notFound();

  const { user, erro } = await usuarioAtual();
  if (erro) return <AvisoErroConexao />;
  if (!user) redirect("/login");

  const supabase = await criarClienteServidor();
  const [evento, cooperativas] = await Promise.all([
    supabase
      .from("eventos")
      .select("cooperativa_id, nome_turma, data_inicio, data_fim, local, tema, duracao_min")
      .eq("id", id)
      .maybeSingle<DadosEvento>(),
    supabase.from("cooperativas").select("id, nome, uf").order("nome").returns<Cooperativa[]>(),
  ]);
  if (evento.error || cooperativas.error) return <AvisoErroConexao />;
  if (!evento.data) notFound();

  return (
    <div className="flex flex-1 flex-col">
      <CabecalhoPainel />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <h1 className="text-2xl font-semibold">Editar evento</h1>
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
          <FormularioEvento
            eventoId={id}
            cooperativas={cooperativas.data}
            evento={evento.data}
            voltarPara={`/painel/evento/${id}`}
          />
        </div>
      </main>
    </div>
  );
}
