// Paleta do telão (fundo branco). Seis cores, na ORDEM FIXA das opções:
// a opção 1 é sempre petróleo, a 2 sempre coral, e assim por diante.
// A ordem faz parte da validação (daltonismo: vizinhas distinguíveis) — não reordene
// sem passar de novo no validador de paleta. Validada em 26/09/2026, superfície #ffffff.

export const CORES_OPCOES = [
  "#1b7aa0", // 1 petróleo (marca)
  "#eb6834", // 2 coral
  "#1baf7a", // 3 verde-água
  "#eda100", // 4 âmbar
  "#d6457e", // 5 magenta
  "#6a52c9", // 6 violeta
] as const;

// A mesma cor em tom próprio para TEXTO (nuvem de palavras, rótulos):
// todas com contraste de pelo menos 4:1 sobre o branco.
export const CORES_TEXTO = [
  "#1b7aa0", // petróleo
  "#c9501f", // coral escuro
  "#0f7d57", // verde-água escuro
  "#a86f00", // âmbar escuro
  "#d6457e", // magenta
  "#6a52c9", // violeta
] as const;

// Escala (uma medida só): barras em petróleo; referência em coral.
export const COR_ESCALA = CORES_OPCOES[0];
export const COR_REFERENCIA = CORES_OPCOES[1];
export const COR_REFERENCIA_TEXTO = CORES_TEXTO[1];

// Cor fixa de cada palavra da nuvem, calculada a partir da própria palavra:
// "prazo" tem sempre a mesma cor, mesmo quando outras palavras passam à frente.
export function corDaPalavra(palavra: string) {
  let h = 0;
  for (const c of palavra) h = (h * 31 + c.codePointAt(0)!) >>> 0;
  return CORES_TEXTO[h % CORES_TEXTO.length];
}
