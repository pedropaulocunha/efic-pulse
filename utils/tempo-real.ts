import "server-only";

// Avisa as telas de um evento que algo mudou (Supabase Realtime, canal Broadcast).
// O aviso NÃO carrega dado: quem recebe consulta o servidor e redesenha.
//   "estado"   — abrir, encerrar, mostrar resultado, revelar referência...
//   "resposta" — chegou uma resposta
// Se o aviso falhar, nada quebra: toda tela também consulta a cada 15 segundos.

export type TipoAviso = "estado" | "resposta";

export function canalDoEvento(eventoId: string) {
  return `evento:${eventoId}`;
}

export async function avisarEvento(eventoId: string, tipo: TipoAviso) {
  try {
    const resposta = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        apikey: process.env.SUPABASE_SECRET_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [{ topic: canalDoEvento(eventoId), event: "aviso", payload: { tipo }, private: false }],
      }),
      cache: "no-store",
    });
    if (!resposta.ok) {
      console.error("avisarEvento:", resposta.status, await resposta.text());
    }
  } catch (e) {
    console.error("avisarEvento:", e);
  }
}
