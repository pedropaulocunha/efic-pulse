import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CabecalhoPainel } from "@/components/cabecalho-painel";
import { AvisoErroConexao } from "@/components/ui";
import type { ConfigAtividade, EstadoAtividade, TipoAtividade } from "@/lib/atividades";
import { uuidValido } from "@/lib/formatos";
import { usuarioAtual } from "@/utils/auth";
import { criarClienteServidor } from "@/utils/supabase/server";
import FormularioAtividade from "../formulario-atividade";

type Atividade = {
  tipo: TipoAtividade;
  enunciado: string;
  config: ConfigAtividade;
  estado: EstadoAtividade;
  bloco_id: string | null;
  eventos: { nome_turma: string } | null;
};

export default async function EditarAtividade({
  params,
}: PageProps<"/painel/evento/[id]/atividade/[atividadeId]">) {
  const { id, atividadeId } = await params;
  if (!uuidValido(id) || !uuidValido(atividadeId)) notFound();

  const { user, erro } = await usuarioAtual();
  if (erro) return <AvisoErroConexao />;
  if (!user) redirect("/login");

  const supabase = await criarClienteServidor();
  const [atividade, blocos] = await Promise.all([
    supabase
      .from("atividades")
      .select("tipo, enunciado, config, estado, bloco_id, eventos(nome_turma)")
      .eq("id", atividadeId)
      .eq("evento_id", id)
      .maybeSingle<Atividade>(),
    supabase.from("blocos").select("id, ordem, titulo").eq("evento_id", id).order("ordem").order("id"),
  ]);
  if (atividade.error || blocos.error) return <AvisoErroConexao />;
  if (!atividade.data) notFound();
  const a = atividade.data;

  return (
    <div className="flex flex-1 flex-col">
      <CabecalhoPainel />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <Link href={`/painel/evento/${id}#atividades`} className="text-sm text-slate-500 hover:underline">
          ← {a.eventos?.nome_turma}
        </Link>
        <h1 className="mt-4 text-2xl font-semibold">Editar atividade</h1>
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
          {a.estado === "fechada" ? (
            <FormularioAtividade
              eventoId={id}
              atividadeId={atividadeId}
              atividade={a}
              blocos={blocos.data}
              blocoInicial={a.bloco_id}
            />
          ) : (
            <p className="text-slate-600">
              Esta atividade já foi aberta e não pode mais ser editada, porque as respostas estão ligadas às opções.
              Se precisar, crie outra atividade.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
