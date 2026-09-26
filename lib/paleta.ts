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

// Cor de cada palavra da nuvem: cada palavra nova pega a PRÓXIMA cor da fila
// (as seis primeiras nunca repetem) e fica com ela enquanto o telão estiver aberto,
// mesmo quando outras palavras passam à frente. Chame na ordem de frequência,
// para as mais citadas pegarem as primeiras cores.
const coresDasPalavras = new Map<string, string>();

export function corDaPalavra(palavra: string) {
  let cor = coresDasPalavras.get(palavra);
  if (!cor) {
    cor = CORES_TEXTO[coresDasPalavras.size % CORES_TEXTO.length];
    coresDasPalavras.set(palavra, cor);
  }
  return cor;
}
