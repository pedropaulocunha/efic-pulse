import Link from "next/link";
import { Marca } from "@/components/marca";

export function CabecalhoPainel() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
        <Link href="/painel">
          <Marca className="text-2xl" />
        </Link>
        <form action="/auth/sair" method="post">
          <button type="submit" className="h-11 rounded-lg px-4 text-slate-600 hover:bg-slate-100">
            Sair
          </button>
        </form>
      </div>
    </header>
  );
}
