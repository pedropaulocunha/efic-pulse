import { redirect } from "next/navigation";
import { AvisoErroConexao, TelaAcesso } from "@/components/ui";
import { usuarioAtual } from "@/utils/auth";
import FormularioSenha from "./formulario";

export default async function PaginaDefinirSenha() {
  const { user, erro } = await usuarioAtual();
  if (erro) return <AvisoErroConexao />;
  if (!user) redirect("/login?erro=link-invalido");

  return (
    <TelaAcesso titulo="Defina sua senha">
      <p className="mb-6 text-slate-600">
        Conta: <strong className="font-medium text-slate-800">{user.email}</strong>
      </p>
      <FormularioSenha />
    </TelaAcesso>
  );
}
