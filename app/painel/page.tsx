import Link from "next/link";
import { redirect } from "next/navigation";
import { Marca } from "@/components/marca";
import { AvisoErroConexao } from "@/components/ui";
import { usuarioAtual } from "@/utils/auth";
import { criarClienteServidor } from "@/utils/supabase/server";

type EventoResumo = {
  id: string;
  codigo_interno: string;
  nome_turma: string;
  data_inicio: string;
  local: string | null;
  estado: "planejamento" | "ao_vivo" | "encerrado";
  cooperativas: { nome: string } | null;
};

const rotuloEstado: Record<EventoResumo["estado"], string> = {
  planejamento: "Planejamento",
  ao_vivo: "Ao vivo",
  encerrado: "Encerrado",
};

function formatarData(iso: string) {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

export default async function Painel() {
  const { user, erro } = await usuarioAtual();
  if (erro) return <AvisoErroConexao />;
  if (!user) redirect("/login");

  const supabase = await criarClienteServidor();
  const [perfil, eventos] = await Promise.all([
    supabase.from("perfis").select("nome").eq("id", user.id).maybeSingle(),
    supabase
      .from("eventos")
      .select("id, codigo_interno, nome_turma, data_inicio, local, estado, cooperativas(nome)")
      .eq("instrutor_id", user.id)
      .order("data_inicio", { ascending: false })
      .returns<EventoResumo[]>(),
  ]);
  if (perfil.error || eventos.error) return <AvisoErroConexao />;

  const nome = perfil.data?.nome ?? user.email;
  const lista = eventos.data ?? [];

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-6">
          <Link href="/painel" className="text-2xl">
            <Marca />
          </Link>
          <form action="/auth/sair" method="post">
            <button type="submit" className="h-11 rounded-lg px-4 text-slate-600 hover:bg-slate-100">
              Sair
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        <h1 className="text-3xl font-semibold">Olá, {nome}</h1>

        <section className="mt-10">
          <h2 className="text-lg font-medium text-slate-700">Seus eventos</h2>
          {lista.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-slate-500">
              Nenhum evento ainda
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {lista.map((evento) => (
                <li key={evento.id} className="flex items-center justify-between gap-4 px-6 py-4">
                  <div>
                    <p className="font-medium">{evento.nome_turma}</p>
                    <p className="text-sm text-slate-500">
                      {evento.cooperativas?.nome} · {formatarData(evento.data_inicio)}
                      {evento.local ? ` · ${evento.local}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
                    {rotuloEstado[evento.estado]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
