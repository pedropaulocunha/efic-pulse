// Cronômetro das rotas da sala: devolve o tempo de cada etapa no cabeçalho
// Server-Timing (padrão da web). Serve para medir o servidor sob carga (k6)
// sem depender da internet de quem mede. Não carrega nenhum dado de participante.

export type Cronometro = {
  marcar: (etapa: string) => void;
  cabecalho: () => string;
};

// Primeira chamada desta máquina desde que ligou (arranque a frio).
let maquinaFria = true;

export function iniciarCronometro(): Cronometro {
  const fria = maquinaFria;
  maquinaFria = false;
  const inicio = performance.now();
  let ultimo = inicio;
  const marcas: string[] = [];

  return {
    marcar(etapa) {
      const agora = performance.now();
      marcas.push(`${etapa};dur=${Math.round(agora - ultimo)}`);
      ultimo = agora;
    },
    cabecalho() {
      const total = `total;dur=${Math.round(performance.now() - inicio)}`;
      return [...(fria ? ["fria"] : []), ...marcas, total].join(", ");
    },
  };
}
