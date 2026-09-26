import { redirect } from "next/navigation";
import { CabecalhoPainel } from "@/components/cabecalho-painel";
import { AvisoErroConexao } from "@/components/ui";
import { usuarioAtual } from "@/utils/auth";
import { criarClienteServidor } from "@/utils/supabase/server";
import FormularioEvento, { type Cooperativa } from "../formulario-evento";

export default async function NovoEvento() {
  const { user, erro } = await usuarioAtual();
  if (erro) return <AvisoErroConexao />;
  if (!user) redirect("/login");

  const supabase = await criarClienteServidor();
  const cooperativas = await supabase
    .from("cooperativas")
    .select("id, nome, uf")
    .order("nome")
    .returns<Cooperativa[]>();
  if (cooperativas.error) return <AvisoErroConexao />;

  return (
    <div className="flex flex-1 flex-col">
      <CabecalhoPainel />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <h1 className="text-2xl font-semibold">Novo evento</h1>
        <p className="mt-2 text-slate-600">
          O código interno e o código de acesso dos participantes são gerados sozinhos.
        </p>
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
          <FormularioEvento eventoId={null} cooperativas={cooperativas.data} voltarPara="/painel" />
        </div>
      </main>
    </div>
  );
}
