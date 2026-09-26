import Link from "next/link";
import { Marca } from "@/components/marca";

export const estiloCampo =
  "mt-1 block h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-marca focus:ring-2 focus:ring-marca/20";

export const estiloBotao =
  "inline-flex h-12 w-full items-center justify-center rounded-lg bg-marca px-6 text-base font-medium text-white hover:bg-marca-escura disabled:opacity-60";

export const estiloLink = "font-medium text-marca underline-offset-4 hover:underline";

// Botão secundário, para ações ao lado do botão principal.
export const estiloBotaoSecundario =
  "inline-flex h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-base font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60";

// Botão principal em tamanho natural (estiloBotao ocupa a largura toda).
export const estiloBotaoCompacto =
  "inline-flex h-11 items-center justify-center rounded-lg bg-marca px-5 text-base font-medium text-white hover:bg-marca-escura disabled:opacity-60";

// Moldura das telas de acesso: logo no topo e um cartão centralizado.
export function TelaAcesso({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-12">
      <Link href="/">
        <Marca className="text-3xl" />
      </Link>
      <div className="mt-8 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold">{titulo}</h1>
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}

export function Aviso({
  tipo,
  children,
}: {
  tipo: "erro" | "sucesso";
  children: React.ReactNode;
}) {
  const cores =
    tipo === "erro"
      ? "border-red-200 bg-red-50 text-red-800"
      : "border-emerald-200 bg-emerald-50 text-emerald-800";
  return (
    <p role={tipo === "erro" ? "alert" : "status"} className={`rounded-lg border px-4 py-3 text-sm ${cores}`}>
      {children}
    </p>
  );
}

// Mostrado quando usuarioAtual() devolve erro passageiro: não é logout.
export function AvisoErroConexao() {
  return (
    <TelaAcesso titulo="Não foi possível confirmar seu acesso agora">
      <p className="text-slate-600">
        Parece uma falha momentânea de conexão. Sua sessão continua válida.
      </p>
      <a href="" className={`${estiloBotao} mt-6`}>
        Tentar de novo
      </a>
    </TelaAcesso>
  );
}
