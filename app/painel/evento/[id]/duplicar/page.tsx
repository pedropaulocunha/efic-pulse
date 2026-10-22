import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CabecalhoPainel } from "@/components/cabecalho-painel";
import { AvisoErroConexao } from "@/components/ui";
import { uuidValido } from "@/lib/formatos";
import { usuarioAtual } from "@/utils/auth";
import { criarClienteServidor } from "@/utils/supabase/server";
import FormularioDuplicar from "./formulario";

// Duplicar evento: mesmo conteúdo (blocos e perguntas), turma e datas novas.
export default async function DuplicarEvento({ params }: PageProps<"/painel/evento/[id]/duplicar">) {
  const { id } = await params;
  if (!uuidValido(id)) notFound();

  const { user, erro } = await usuarioAtual();
  if (erro) return <AvisoErroConexao />;
  if (!user) redirect("/login");

  const supabase = await criarClienteServidor();
  const [evento, cooperativas, blocos, atividades] = await Promise.all([
    supabase.from("eventos").select("nome_turma, local, cooperativa_id").eq("id", id).maybeSingle(),
    supabase.from("cooperativas").select("id, nome, uf").order("nome"),
    supabase.from("blocos").select("id", { count: "exact", head: true }).eq("evento_id", id),
    supabase.from("atividades").select("id", { count: "exact", head: true }).eq("evento_id", id),
  ]);
  if (evento.error || cooperativas.error || blocos.error || atividades.error) return <AvisoErroConexao />;
  if (!evento.data) notFound();

  const nBlocos = blocos.count ?? 0;
  const nPerguntas = atividades.count ?? 0;

  return (
    <div className="flex flex-1 flex-col">
      <CabecalhoPainel />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <Link href={`/painel/evento/${id}`} className="text-sm text-slate-500 hover:underline">
          ← {evento.data.nome_turma}
        </Link>
        <h1 className="mt-4 text-2xl font-semibold">Duplicar evento</h1>
        <p className="mt-2 text-slate-600">
          O evento novo recebe {nBlocos === 1 ? "o bloco" : `os ${nBlocos} blocos`} e{" "}
          {nPerguntas === 1 ? "a pergunta" : `as ${nPerguntas} perguntas`} de &quot;{evento.data.nome_turma}&quot;,
          com observação, tempo e opções, todas <strong>fechadas e sem respostas</strong>, e um código de acesso novo.
          O tema também vem junto.
        </p>
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
          <FormularioDuplicar
            origemId={id}
            sugestao={{
              nome_turma: evento.data.nome_turma,
              local: evento.data.local,
              cooperativa_id: evento.data.cooperativa_id,
            }}
            cooperativas={cooperativas.data}
          />
        </div>
      </main>
    </div>
  );
}
