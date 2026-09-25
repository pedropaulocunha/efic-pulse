import { TelaAcesso } from "@/components/ui";
import FormularioLogin from "./formulario";

const mensagens: Record<string, string> = {
  "link-invalido":
    "Este link expirou ou já foi usado. Peça um novo em \"Esqueci minha senha\".",
  "sessao-expirada": "Sua sessão terminou. Entre de novo.",
};

export default async function PaginaLogin({ searchParams }: PageProps<"/login">) {
  const { erro } = await searchParams;
  const mensagem = typeof erro === "string" ? mensagens[erro] : undefined;

  return (
    <TelaAcesso titulo="Entrar">
      <FormularioLogin mensagemInicial={mensagem} />
    </TelaAcesso>
  );
}
