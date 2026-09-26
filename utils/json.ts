import { NextResponse } from "next/server";

// Resposta JSON que nunca fica guardada em cache (o estado da sala muda o tempo todo).
export function json(dados: unknown, status = 200) {
  return NextResponse.json(dados, { status, headers: { "Cache-Control": "no-store" } });
}
