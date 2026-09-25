import Link from "next/link";
import { Marca } from "@/components/marca";

export default function Inicio() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <h1 className="text-5xl">
        <Marca />
      </h1>
      <p className="mt-3 text-lg text-slate-600">
        Treinamentos presenciais da Efic Soluções
      </p>
      <Link
        href="/login"
        className="mt-10 inline-flex h-12 items-center rounded-lg bg-marca px-6 text-base font-medium text-white hover:bg-marca-escura"
      >
        Entrar como instrutor
      </Link>
    </main>
  );
}
