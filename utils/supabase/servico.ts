import "server-only";
import { createClient } from "@supabase/supabase-js";

// Cliente com a chave secreta: ignora as políticas de acesso (RLS).
// Use só no servidor, e só depois de conferir quem está pedindo.
// Hoje serve às telas do participante, que não tem login no Supabase.
export function criarClienteServico() {
  const chave = process.env.SUPABASE_SECRET_KEY;
  if (!chave) {
    throw new Error("Falta a variável SUPABASE_SECRET_KEY no servidor.");
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, chave, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
