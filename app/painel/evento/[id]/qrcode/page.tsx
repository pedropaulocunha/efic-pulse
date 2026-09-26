import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { Marca } from "@/components/marca";
import { AvisoErroConexao } from "@/components/ui";
import { uuidValido } from "@/lib/formatos";
import { usuarioAtual } from "@/utils/auth";
import { criarClienteServidor } from "@/utils/supabase/server";

// Tela para projetar: QR code grande, código em letras grandes e o endereço por extenso.
export default async function QrCodeEvento({ params }: PageProps<"/painel/evento/[id]/qrcode">) {
  const { id } = await params;
  if (!uuidValido(id)) notFound();

  const { user, erro } = await usuarioAtual();
  if (erro) return <AvisoErroConexao />;
  if (!user) redirect("/login");

  const supabase = await criarClienteServidor();
  const evento = await supabase
    .from("eventos")
    .select("id, nome_turma, codigo_acesso")
    .eq("id", id)
    .maybeSingle();
  if (evento.error) return <AvisoErroConexao />;
  if (!evento.data) notFound();

  // Em produção, o endereço é pulse.efic.com.br; em testes, o do próprio servidor.
  const host = (await headers()).get("host") ?? "pulse.efic.com.br";
  const protocolo = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  const { codigo_acesso: codigo, nome_turma: nomeTurma } = evento.data;
  const endereco = `${protocolo}://${host}/?c=${codigo}`;

  const svg = await QRCode.toString(endereco, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#0f172a", light: "#ffffff" },
  });

  return (
    <main className="flex min-h-screen flex-1 flex-col bg-white px-8 py-6">
      <div className="flex items-center justify-between">
        <Marca className="text-3xl" />
        <Link href={`/painel/evento/${id}`} className="text-sm text-slate-400 hover:underline">
          Voltar ao evento
        </Link>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-10 lg:flex-row lg:gap-20">
        <div
          className="aspect-square w-[min(70vw,60vh)] [&>svg]:h-full [&>svg]:w-full"
          role="img"
          aria-label={`QR code para entrar no evento ${nomeTurma}`}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <div className="text-center lg:text-left">
          <p className="text-2xl text-slate-600">{nomeTurma}</p>
          <p className="mt-6 text-xl text-slate-500">Código do evento</p>
          <p className="font-mono text-8xl font-semibold tracking-[0.15em] text-slate-900 lg:text-9xl">{codigo}</p>
          <p className="mt-8 text-xl text-slate-500">ou entre em</p>
          <p className="text-4xl font-medium text-slate-800">{host}</p>
        </div>
      </div>
    </main>
  );
}
