import Link from "next/link";
import { redirect } from "next/navigation";
import { Marca } from "@/components/marca";
import { normalizarCodigo } from "@/lib/formatos";
import { participanteAtual } from "@/utils/participante";
import FormularioEntrada from "./entrada/formulario";

export default async function Entrada({ searchParams }: PageProps<"/">) {
  // Volta ao mesmo aparelho: com sessão válida, vai direto para a sala.
  const { participante } = await participanteAtual();
  if (participante && participante.evento.estado !== "encerrado") redirect("/sala");

  const { c } = await searchParams;
  const codigoInicial = typeof c === "string" ? normalizarCodigo(c).slice(0, 4) : "";

  return (
    <main className="flex flex-1 flex-col items-center px-6 py-10 sm:justify-center">
      <Marca className="text-4xl" />
      <div className="mt-8 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-xl font-semibold">Entrar no evento</h1>
        <p className="mt-2 text-sm text-slate-600">
          Suas respostas aparecem para a turma sem o seu nome.
        </p>
        <div className="mt-6">
          <FormularioEntrada codigoInicial={codigoInicial} />
        </div>
      </div>
      <Link href="/login" className="mt-8 text-sm text-slate-500 underline-offset-4 hover:underline">
        Sou instrutor
      </Link>
    </main>
  );
}
