import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Cliente com a chave secreta: ignora as políticas de acesso (RLS).
// Use só no servidor, e só depois de conferir quem está pedindo.
// Hoje serve às telas do participante, que não tem login no Supabase.
//
// Criado uma vez e reaproveitado entre chamadas: montar o cliente gasta
// processador, e com 40 celulares ao mesmo tempo isso vira fila. Ele não guarda
// sessão de ninguém (só a chave do servidor), então reaproveitar é seguro.
let cliente: SupabaseClient | null = null;

export function criarClienteServico() {
  if (cliente) return cliente;
  const chave = process.env.SUPABASE_SECRET_KEY;
  if (!chave) {
    throw new Error("Falta a variável SUPABASE_SECRET_KEY no servidor.");
  }
  cliente = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, chave, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return cliente;
}
