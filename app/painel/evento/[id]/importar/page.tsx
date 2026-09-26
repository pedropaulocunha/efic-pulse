import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CabecalhoPainel } from "@/components/cabecalho-painel";
import { AvisoErroConexao, estiloLink } from "@/components/ui";
import { uuidValido } from "@/lib/formatos";
import { usuarioAtual } from "@/utils/auth";
import { criarClienteServidor } from "@/utils/supabase/server";
import Importador from "./importador";

export default async function ImportarInscritos({ params }: PageProps<"/painel/evento/[id]/importar">) {
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
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <Link href={`/painel/evento/${id}`} className="text-sm text-slate-500 hover:underline">
          ← {evento.data.nome_turma}
        </Link>
        <h1 className="mt-4 text-2xl font-semibold">Importar inscritos</h1>
        <div className="mt-3 space-y-1 text-slate-600">
          <p>
            Planilha em CSV, com as colunas <strong>Nome;Email;Cargo;Agencia</strong> separadas por ponto e
            vírgula. No Excel, use Salvar como → “CSV UTF-8”.
          </p>
          <p>
            Você vê uma prévia antes de gravar.{" "}
            <a href="/modelo-inscritos.csv" download className={estiloLink}>
              Baixar planilha modelo
            </a>
          </p>
        </div>
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
          <Importador eventoId={id} />
        </div>
      </main>
    </div>
  );
}
