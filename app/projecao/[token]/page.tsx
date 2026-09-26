import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { estadoProjecao, type EstadoProjecao } from "@/utils/projecao";
import Telao from "./telao";

export const metadata: Metadata = {
  title: "Projeção · Pulse",
  robots: { index: false, follow: false },
};

// Telão do evento. Sem login e sem nenhum botão: o link só mostra, não comanda.
export default async function Projecao({ params }: PageProps<"/projecao/[token]">) {
  const { token } = await params;

  let inicial: EstadoProjecao | null;
  try {
    inicial = await estadoProjecao(token);
  } catch {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white text-3xl text-slate-500">
        Sem conexão com o Pulse. Recarregue a página.
      </main>
    );
  }
  if (!inicial) notFound();

  const host = (await headers()).get("host") ?? "pulse.efic.com.br";
  return <Telao token={token} inicial={inicial} endereco={host} />;
}
