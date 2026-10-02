"use client";

import { useEffect, useState } from "react";

// Timer da pergunta. O servidor diz quanto falta (em ms, pelo relógio dele); aqui só
// se conta para baixo a partir disso. Cada consulta nova ao servidor recalibra, então
// o relógio errado de um celular não atrapalha. Devolve os segundos que faltam
// (0 = tempo esgotado) ou null se a pergunta não tem tempo.
export function useContagem(restanteMs: number | null | undefined) {
  const [segundos, setSegundos] = useState<number | null>(null);

  useEffect(() => {
    if (restanteMs === null || restanteMs === undefined) return;
    const prazo = Date.now() + restanteMs;
    const atualizar = () => setSegundos(Math.max(0, Math.ceil((prazo - Date.now()) / 1000)));
    const primeiro = setTimeout(atualizar, 0);
    const relogio = setInterval(atualizar, 250);
    return () => {
      clearTimeout(primeiro);
      clearInterval(relogio);
    };
  }, [restanteMs]);

  return restanteMs === null || restanteMs === undefined ? null : segundos;
}

// "1:05", "0:09"
export function formatarContagem(segundos: number) {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Últimos 10 segundos: muda de cor (coral) para chamar a atenção, sem som.
export const COR_FIM_TEMPO = "#c2410c";

// Timer do telão: canto superior direito, medidas proporcionais à caixa (cqw/cqh).
export function ContagemTelao({ restanteMs }: { restanteMs: number | null | undefined }) {
  const segundos = useContagem(restanteMs);
  if (segundos === null) return null;
  const acabando = segundos <= 10;
  return (
    <div
      className="absolute right-[4cqw] top-[4.5cqh] text-right leading-none"
      aria-live="off"
      style={{ color: acabando ? COR_FIM_TEMPO : "#0f4c64" }}
    >
      {segundos > 0 ? (
        <span className="font-marca-serif text-[min(4.2cqw,7cqh)] font-semibold tabular-nums">
          {formatarContagem(segundos)}
        </span>
      ) : (
        // Em duas linhas, para caber no mesmo espaço do número ao lado da pergunta.
        <span className="block text-[min(1.9cqw,3.6cqh)] font-semibold leading-tight">
          Tempo
          <br />
          esgotado
        </span>
      )}
    </div>
  );
}
