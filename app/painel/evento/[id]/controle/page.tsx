import { notFound, redirect } from "next/navigation";
import { AvisoErroConexao } from "@/components/ui";
import { uuidValido } from "@/lib/formatos";
import { usuarioAtual } from "@/utils/auth";
import { estadoControle, type EstadoControle } from "@/utils/controle";
import { criarClienteServidor } from "@/utils/supabase/server";
import Controle from "./controle";

// Tempo máximo das ações desta página: "Resumir com IA" pode fazer até 3 chamadas à OpenAI.
export const maxDuration = 180;

export default async function PaginaControle({ params }: PageProps<"/painel/evento/[id]/controle">) {
  const { id } = await params;
  if (!uuidValido(id)) notFound();

  const { user, erro } = await usuarioAtual();
  if (erro) return <AvisoErroConexao />;
  if (!user) redirect("/login");

  let inicial: EstadoControle | null;
  try {
    const supabase = await criarClienteServidor();
    // A atividade do telão (ou a primeira) já chega selecionada, com prévia e moderação.
    const atual = await supabase.from("eventos").select("atividade_atual_id").eq("id", id).maybeSingle();
    inicial = await estadoControle(supabase, id, atual.data?.atividade_atual_id ?? null);
  } catch {
    return <AvisoErroConexao />;
  }
  if (!inicial) notFound();

  return <Controle inicial={inicial} />;
}
