import { NextResponse } from "next/server";

// Resposta JSON que nunca fica guardada em cache (o estado da sala muda o tempo todo).
// Opcional: tempos das etapas no cabeçalho Server-Timing (utils/cronometro.ts).
export function json(dados: unknown, status = 200, serverTiming?: string) {
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (serverTiming) headers["Server-Timing"] = serverTiming;
  return NextResponse.json(dados, { status, headers });
}
