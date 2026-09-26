import { redirect } from "next/navigation";
import { sairDoAparelho } from "@/app/acoes-entrada";
import { Marca } from "@/components/marca";
import { participanteAtual } from "@/utils/participante";

export default async function Sala() {
  const { participante, erro } = await participanteAtual();

  if (erro) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
        <Marca className="text-3xl" />
        <p className="mt-8 text-lg text-slate-700">Sem conexão com o Pulse agora.</p>
        <a href="" className="mt-6 font-medium text-marca underline-offset-4 hover:underline">
          Tentar de novo
        </a>
      </main>
    );
  }
  if (!participante) redirect("/");

  const { evento } = participante;
  const encerrado = evento.estado === "encerrado";

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-2xl items-center justify-between px-5">
          <Marca className="text-2xl" />
          <span className="rounded-lg bg-slate-100 px-3 py-1 font-mono text-lg tracking-widest text-slate-700">
            {evento.codigo_acesso}
          </span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-6 py-12 text-center">
        <p className="text-sm uppercase tracking-wide text-slate-500">{evento.cooperativa}</p>
        <h1 className="mt-2 text-2xl font-semibold">{evento.nome_turma}</h1>
        <p className="mt-10 text-xl text-slate-600">
          {encerrado ? "Este evento já terminou." : "A próxima atividade aparece aqui sozinha."}
        </p>
      </main>

      <footer className="pb-8 text-center">
        <form action={sairDoAparelho}>
          <button type="submit" className="text-sm text-slate-400 underline-offset-4 hover:underline">
            Sair deste aparelho
          </button>
        </form>
      </footer>
    </div>
  );
}
