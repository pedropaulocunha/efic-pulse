// Tipos de atividade, validação da configuração e da resposta.
// Usado no navegador e no servidor. As mesmas regras valem no banco (0010 e 0011).

// Mesmas listas dos CHECK atividades_tipo_check e atividades_estado_check.
export type TipoAtividade = "multipla" | "escala" | "nuvem";
export type EstadoAtividade = "fechada" | "aberta" | "encerrada";

export const TIPOS: TipoAtividade[] = ["multipla", "escala", "nuvem"];

export const rotuloTipo: Record<TipoAtividade, string> = {
  multipla: "Múltipla escolha",
  escala: "Escala",
  nuvem: "Nuvem de palavras",
};

export const rotuloEstadoAtividade: Record<EstadoAtividade, string> = {
  fechada: "Fechada",
  aberta: "Aberta",
  encerrada: "Encerrada",
};

export type ConfigMultipla = { opcoes: string[] };
export type ConfigEscala = {
  min: number;
  max: number;
  passo: number;
  unidade?: string | null;
  referencia?: number | null;
};
export type ConfigNuvem = { max_palavras: number };
export type ConfigAtividade = ConfigMultipla | ConfigEscala | ConfigNuvem;

export const LIMITE_OPCOES = { min: 2, max: 6 };
export const LIMITE_DEGRAUS = 1000;
export const TAMANHO_PALAVRA = 40;

// ---------------------------------------------------------------
// Escala: números com casas decimais sem erro de arredondamento
// ---------------------------------------------------------------

export function casasDecimais(n: number) {
  const texto = String(n);
  return texto.includes(".") ? texto.split(".")[1].length : 0;
}

function arredondar(n: number, casas: number) {
  const fator = 10 ** casas;
  return Math.round(n * fator) / fator;
}

// Quantos passos cabem entre min e max (null se o passo não divide o intervalo).
export function degrausDaEscala(min: number, max: number, passo: number) {
  if (!(max > min) || !(passo > 0)) return null;
  const n = (max - min) / passo;
  return Math.abs(n - Math.round(n)) < 1e-9 ? Math.round(n) : null;
}

export function valoresDaEscala(c: ConfigEscala) {
  const n = degrausDaEscala(c.min, c.max, c.passo) ?? 0;
  const casas = Math.max(casasDecimais(c.min), casasDecimais(c.passo));
  return Array.from({ length: n + 1 }, (_, i) => arredondar(c.min + i * c.passo, casas));
}

export function formatarNumero(n: number, unidade?: string | null) {
  const texto = n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  if (!unidade) return texto;
  return unidade === "%" ? `${texto}%` : `${texto} ${unidade}`;
}

// ---------------------------------------------------------------
// Configuração (formulário do instrutor)
// ---------------------------------------------------------------

export type EntradaConfig = {
  opcoes?: string[];
  min?: string;
  max?: string;
  passo?: string;
  unidade?: string;
  referencia?: string;
  max_palavras?: string;
};

function numero(texto: string | undefined) {
  const limpo = (texto ?? "").trim().replace(",", ".");
  if (limpo === "") return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : NaN;
}

export function validarConfig(
  tipo: TipoAtividade,
  entrada: EntradaConfig,
): { config: ConfigAtividade } | { erro: string } {
  if (tipo === "multipla") {
    const opcoes = (entrada.opcoes ?? []).map((o) => o.replace(/\s+/g, " ").trim()).filter(Boolean);
    if (opcoes.length < LIMITE_OPCOES.min) return { erro: "Informe pelo menos duas opções." };
    if (opcoes.length > LIMITE_OPCOES.max) return { erro: "São no máximo seis opções." };
    if (opcoes.some((o) => o.length > 120)) return { erro: "Cada opção pode ter até 120 caracteres." };
    return { config: { opcoes } };
  }

  if (tipo === "escala") {
    const min = numero(entrada.min);
    const max = numero(entrada.max);
    const passo = numero(entrada.passo);
    const referencia = numero(entrada.referencia);
    const unidade = (entrada.unidade ?? "").trim().slice(0, 20) || null;

    if (min === null || max === null || passo === null) return { erro: "Informe mínimo, máximo e passo." };
    if ([min, max, passo].some(Number.isNaN)) return { erro: "Mínimo, máximo e passo precisam ser números." };
    if (max <= min) return { erro: "O máximo precisa ser maior que o mínimo." };
    if (passo <= 0) return { erro: "O passo precisa ser maior que zero." };
    const degraus = degrausDaEscala(min, max, passo);
    if (degraus === null) {
      return { erro: `O passo ${passo} não divide o intervalo de ${min} a ${max}. Ajuste o passo ou os limites.` };
    }
    if (degraus > LIMITE_DEGRAUS) return { erro: "Passo pequeno demais: a escala teria mais de 1000 posições." };
    if (referencia !== null) {
      if (Number.isNaN(referencia)) return { erro: "A referência precisa ser um número." };
      if (referencia < min || referencia > max) return { erro: "A referência precisa estar entre o mínimo e o máximo." };
    }
    return { config: { min, max, passo, unidade, referencia } };
  }

  const maxPalavras = Number(entrada.max_palavras);
  if (![1, 2, 3].includes(maxPalavras)) return { erro: "Escolha de uma a três palavras." };
  return { config: { max_palavras: maxPalavras } };
}

// O celular nunca recebe a referência da escala.
export function configParaParticipante(tipo: TipoAtividade, config: ConfigAtividade): ConfigAtividade {
  if (tipo !== "escala") return config;
  const resto: ConfigEscala = { ...(config as ConfigEscala) };
  delete resto.referencia;
  return resto;
}

// ---------------------------------------------------------------
// Resposta do participante
// ---------------------------------------------------------------

export type ValorResposta = { opcao: number } | { numero: number } | { palavras: string[] };

export function normalizarPalavra(p: string) {
  return p.replace(/\s+/g, " ").trim().toLowerCase().slice(0, TAMANHO_PALAVRA);
}

export function validarValor(
  tipo: TipoAtividade,
  config: ConfigAtividade,
  valor: unknown,
): { valor: ValorResposta } | { erro: string } {
  const v = (valor ?? {}) as Record<string, unknown>;

  if (tipo === "multipla") {
    const opcao = v.opcao;
    const total = (config as ConfigMultipla).opcoes.length;
    if (typeof opcao !== "number" || !Number.isInteger(opcao) || opcao < 0 || opcao >= total) {
      return { erro: "Escolha uma das opções." };
    }
    return { valor: { opcao } };
  }

  if (tipo === "escala") {
    const c = config as ConfigEscala;
    const n = v.numero;
    if (typeof n !== "number" || !Number.isFinite(n) || n < c.min || n > c.max) {
      return { erro: "Escolha um valor da escala." };
    }
    const passos = (n - c.min) / c.passo;
    if (Math.abs(passos - Math.round(passos)) > 1e-6) return { erro: "Escolha um valor da escala." };
    const casas = Math.max(casasDecimais(c.min), casasDecimais(c.passo));
    return { valor: { numero: arredondar(c.min + Math.round(passos) * c.passo, casas) } };
  }

  const maximo = (config as ConfigNuvem).max_palavras;
  const lista = Array.isArray(v.palavras) ? v.palavras : [];
  const palavras = [
    ...new Set(lista.filter((p): p is string => typeof p === "string").map(normalizarPalavra).filter(Boolean)),
  ];
  if (palavras.length === 0) return { erro: "Escreva pelo menos uma palavra." };
  if (palavras.length > maximo) return { erro: `No máximo ${maximo} palavra${maximo > 1 ? "s" : ""}.` };
  return { valor: { palavras } };
}
