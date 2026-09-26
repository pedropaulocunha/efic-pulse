import Link from "next/link";
import { redirect } from "next/navigation";
import { CabecalhoPainel } from "@/components/cabecalho-painel";
import { AvisoErroConexao, estiloBotaoCompacto } from "@/components/ui";
import { formatarPeriodo, rotuloEstado, type EstadoEvento } from "@/lib/formatos";
import { usuarioAtual } from "@/utils/auth";
import { criarClienteServidor } from "@/utils/supabase/server";

type EventoResumo = {
  id: string;
  codigo_interno: string;
  codigo_acesso: string;
  nome_turma: string;
  data_inicio: string;
  data_fim: string;
  local: string | null;
  estado: EstadoEvento;
  cooperativas: { nome: string } | null;
};

export default async function Painel() {
  const { user, erro } = await usuarioAtual();
  if (erro) return <AvisoErroConexao />;
  if (!user) redirect("/login");

  const supabase = await criarClienteServidor();
  const [perfil, eventos] = await Promise.all([
    supabase.from("perfis").select("nome").eq("id", user.id).maybeSingle(),
    supabase
      .from("eventos")
      .select(
        "id, codigo_interno, codigo_acesso, nome_turma, data_inicio, data_fim, local, estado, cooperativas(nome)",
      )
      .eq("instrutor_id", user.id)
      .order("data_inicio", { ascending: false })
      .returns<EventoResumo[]>(),
  ]);
  if (perfil.error || eventos.error) return <AvisoErroConexao />;

  const nome = perfil.data?.nome ?? user.email;
  const lista = eventos.data ?? [];

  return (
    <div className="flex flex-1 flex-col">
      <CabecalhoPainel />

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <h1 className="text-3xl font-semibold">Olá, {nome}</h1>

        <section className="mt-10">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-medium text-slate-700">Seus eventos</h2>
            <Link href="/painel/evento/novo" className={estiloBotaoCompacto}>
              Novo evento
            </Link>
          </div>
          {lista.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-slate-500">
              Nenhum evento ainda
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {lista.map((evento) => (
                <li key={evento.id}>
                  <Link
                    href={`/painel/evento/${evento.id}`}
                    className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{evento.nome_turma}</p>
                      <p className="truncate text-sm text-slate-500">
                        {evento.cooperativas?.nome} · {formatarPeriodo(evento.data_inicio, evento.data_fim)}
                        {evento.local ? ` · ${evento.local}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="font-mono text-lg tracking-widest text-slate-700">
                        {evento.codigo_acesso}
                      </span>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
                        {rotuloEstado[evento.estado]}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
