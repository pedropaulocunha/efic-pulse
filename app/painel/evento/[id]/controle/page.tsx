import { notFound, redirect } from "next/navigation";
import { AvisoErroConexao } from "@/components/ui";
import { uuidValido } from "@/lib/formatos";
import { usuarioAtual } from "@/utils/auth";
import { estadoControle, type EstadoControle } from "@/utils/controle";
import { criarClienteServidor } from "@/utils/supabase/server";
import Controle from "./controle";

export default async function PaginaControle({ params }: PageProps<"/painel/evento/[id]/controle">) {
  const { id } = await params;
  if (!uuidValido(id)) notFound();

  const { user, erro } = await usuarioAtual();
  if (erro) return <AvisoErroConexao />;
  if (!user) redirect("/login");

  let inicial: EstadoControle | null;
  try {
    inicial = await estadoControle(await criarClienteServidor(), id);
  } catch {
    return <AvisoErroConexao />;
  }
  if (!inicial) notFound();

  return <Controle inicial={inicial} />;
}
