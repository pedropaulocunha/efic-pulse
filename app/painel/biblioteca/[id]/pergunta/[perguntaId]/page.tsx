import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CabecalhoPainel } from "@/components/cabecalho-painel";
import FormularioPergunta from "@/components/formulario-pergunta";
import { AvisoErroConexao } from "@/components/ui";
import type { ConfigAtividade, TipoAtividade } from "@/lib/atividades";
import { uuidValido } from "@/lib/formatos";
import { usuarioAtual } from "@/utils/auth";
import { criarClienteServidor } from "@/utils/supabase/server";
import { salvarPerguntaModelo } from "../../../acoes";

type Pergunta = {
  tipo: TipoAtividade;
  enunciado: string;
  observacao: string | null;
  config: ConfigAtividade;
  modelos: { titulo: string } | null;
};

export default async function EditarPerguntaModelo({
  params,
}: PageProps<"/painel/biblioteca/[id]/pergunta/[perguntaId]">) {
  const { id, perguntaId } = await params;
  if (!uuidValido(id) || !uuidValido(perguntaId)) notFound();

  const { user, erro } = await usuarioAtual();
  if (erro) return <AvisoErroConexao />;
  if (!user) redirect("/login");

  const supabase = await criarClienteServidor();
  const [pergunta, uso] = await Promise.all([
    supabase
      .from("modelo_perguntas")
      .select("tipo, enunciado, observacao, config, modelos(titulo)")
      .eq("id", perguntaId)
      .eq("modelo_id", id)
      .maybeSingle<Pergunta>(),
    supabase.from("atividades").select("id", { count: "exact", head: true }).eq("modelo_pergunta_id", perguntaId),
  ]);
  if (pergunta.error || uso.error) return <AvisoErroConexao />;
  if (!pergunta.data) notFound();

  return (
    <div className="flex flex-1 flex-col">
      <CabecalhoPainel />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <Link href={`/painel/biblioteca/${id}`} className="text-sm text-slate-500 hover:underline">
          ← {pergunta.data.modelos?.titulo}
        </Link>
        <h1 className="mt-4 text-2xl font-semibold">Editar pergunta do modelo</h1>
        {(uso.count ?? 0) > 0 && (
          <p className="mt-2 text-slate-600">
            Já usada em eventos: só o texto pode mudar, e os eventos continuam com o texto que usaram. Para mudar
            opções, escala ou itens, duplique o modelo.
          </p>
        )}
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
          <FormularioPergunta
            acaoSalvar={salvarPerguntaModelo.bind(null, id, perguntaId)}
            voltar={`/painel/biblioteca/${id}`}
            atividade={pergunta.data}
          />
        </div>
      </main>
    </div>
  );
}
