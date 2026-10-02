import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CabecalhoPainel } from "@/components/cabecalho-painel";
import { AvisoErroConexao } from "@/components/ui";
import type { ConfigAtividade, EstadoAtividade, TipoAtividade } from "@/lib/atividades";
import { uuidValido } from "@/lib/formatos";
import { usuarioAtual } from "@/utils/auth";
import { criarClienteServidor } from "@/utils/supabase/server";
import FormularioPergunta from "@/components/formulario-pergunta";
import { salvarAtividade } from "../../../acoes-atividades";
import FormularioAjustes from "./ajustes";

type Atividade = {
  tipo: TipoAtividade;
  enunciado: string;
  observacao: string | null;
  tempo_resposta_seg: number | null;
  config: ConfigAtividade;
  estado: EstadoAtividade;
  bloco_id: string | null;
  modelo_pergunta_id: string | null;
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
      .select("tipo, enunciado, observacao, tempo_resposta_seg, config, estado, bloco_id, modelo_pergunta_id, eventos!atividades_evento_id_fkey(nome_turma)")
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
          {a.modelo_pergunta_id || a.estado !== "fechada" ? (
            <>
              <p className="font-medium text-slate-800">{a.enunciado}</p>
              <p className="mt-2 text-slate-600">
                {a.modelo_pergunta_id
                  ? "Esta pergunta vem da biblioteca e é igual em todos os eventos que usam o modelo, para que as respostas possam ser comparadas. Aqui só dá para mudar o tempo para responder."
                  : "Esta pergunta já foi aberta: o texto, o tipo e as opções ficam travados, porque as respostas estão ligadas a eles. O tempo para responder e a observação podem mudar."}{" "}
                Para mudar de bloco, use o campo &quot;Bloco&quot; na lista de atividades.
              </p>
              <div className="mt-6">
                <FormularioAjustes
                  eventoId={id}
                  atividadeId={atividadeId}
                  tempo={a.tempo_resposta_seg}
                  observacaoInicial={a.observacao}
                  daBiblioteca={Boolean(a.modelo_pergunta_id)}
                />
              </div>
            </>
          ) : (
            <FormularioPergunta
              acaoSalvar={salvarAtividade.bind(null, id, atividadeId)}
              voltar={`/painel/evento/${id}#atividades`}
              atividade={a}
              blocos={blocos.data}
              blocoInicial={a.bloco_id}
            />
          )}
        </div>
      </main>
    </div>
  );
}
