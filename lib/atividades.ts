// Tipos de atividade, validação da configuração e da resposta.
// Usado no navegador e no servidor. As mesmas regras valem no banco
// (config_atividade_valida e normalizar_resposta, migração 0014).

// Mesmas listas dos CHECK atividades_tipo_check e atividades_estado_check.
export type TipoAtividade = "multipla" | "selecao" | "escala" | "nuvem" | "ordenar" | "numero" | "aberta";
export type EstadoAtividade = "fechada" | "aberta" | "encerrada";

export const TIPOS: TipoAtividade[] = ["multipla", "selecao", "escala", "nuvem", "ordenar", "numero", "aberta"];

export const rotuloTipo: Record<TipoAtividade, string> = {
  multipla: "Múltipla escolha",
  selecao: "Seleção múltipla",
  escala: "Escala",
  nuvem: "Nuvem de palavras",
  ordenar: "Ordenar",
  numero: "Resposta numérica",
  aberta: "Resposta aberta",
};

// Tipos que aceitam "Nova rodada" (mesma lista de comandar_atividade, migração 0015).
export const TIPOS_COM_RODADAS: TipoAtividade[] = ["multipla", "selecao", "escala", "numero", "ordenar"];
// Tipos com referência que o instrutor revela no telão.
export const TIPOS_COM_REFERENCIA: TipoAtividade[] = ["escala", "numero"];

export const rotuloEstadoAtividade: Record<EstadoAtividade, string> = {
  fechada: "Fechada",
  aberta: "Aberta",
  encerrada: "Encerrada",
};

export type ConfigMultipla = { opcoes: string[] };
// Seleção múltipla: cada pessoa marca de min_escolhas a max_escolhas opções.
export type ConfigSelecao = { opcoes: string[]; min_escolhas: number; max_escolhas: number };
export type ConfigEscala = {
  min: number;
  max: number;
  passo: number;
  unidade?: string | null;
  referencia?: number | null;
};
export type ConfigNuvem = { max_palavras: number };
export type ConfigOrdenar = { itens: string[] };
export type ConfigNumero = {
  casas: number;
  unidade?: string | null;
  min?: number | null;
  max?: number | null;
  referencia?: number | null;
};
export type ConfigAberta = { max_caracteres: number };
export type ConfigAtividade =
  | ConfigMultipla
  | ConfigSelecao
  | ConfigEscala
  | ConfigNuvem
  | ConfigOrdenar
  | ConfigNumero
  | ConfigAberta;

export const LIMITE_OPCOES = { min: 2, max: 6 };
export const LIMITE_SELECAO = { min: 3, max: 10 };
export const LIMITE_ITENS = { min: 3, max: 6 };
export const LIMITE_CARACTERES = { min: 20, max: 500 };
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
  itens?: string[];
  min?: string;
  max?: string;
  passo?: string;
  unidade?: string;
  referencia?: string;
  casas?: string;
  max_palavras?: string;
  max_caracteres?: string;
  min_escolhas?: string;
  max_escolhas?: string;
};

function limparLista(lista: string[] | undefined) {
  return (lista ?? []).map((o) => o.replace(/\s+/g, " ").trim()).filter(Boolean);
}

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
    const opcoes = limparLista(entrada.opcoes);
    if (opcoes.length < LIMITE_OPCOES.min) return { erro: "Informe pelo menos duas opções." };
    if (opcoes.length > LIMITE_OPCOES.max) return { erro: "São no máximo seis opções." };
    if (opcoes.some((o) => o.length > 120)) return { erro: "Cada opção pode ter até 120 caracteres." };
    return { config: { opcoes } };
  }

  if (tipo === "selecao") {
    const opcoes = limparLista(entrada.opcoes);
    if (opcoes.length < LIMITE_SELECAO.min) return { erro: "Informe pelo menos três opções." };
    if (opcoes.length > LIMITE_SELECAO.max) return { erro: "São no máximo dez opções." };
    if (opcoes.some((o) => o.length > 120)) return { erro: "Cada opção pode ter até 120 caracteres." };
    const minimo = Number(entrada.min_escolhas);
    const maximo = Number(entrada.max_escolhas);
    if (!Number.isInteger(minimo) || !Number.isInteger(maximo) || minimo < 1) {
      return { erro: "Diga quantas opções cada pessoa marca." };
    }
    if (maximo < minimo) return { erro: "O máximo de opções marcadas não pode ser menor que o mínimo." };
    if (maximo > opcoes.length) return { erro: "O máximo de opções marcadas não pode passar do número de opções." };
    return { config: { opcoes, min_escolhas: minimo, max_escolhas: maximo } };
  }

  if (tipo === "ordenar") {
    const itens = limparLista(entrada.itens);
    if (itens.length < LIMITE_ITENS.min) return { erro: "Informe pelo menos três itens para ordenar." };
    if (itens.length > LIMITE_ITENS.max) return { erro: "São no máximo seis itens." };
    if (itens.some((o) => o.length > 120)) return { erro: "Cada item pode ter até 120 caracteres." };
    if (new Set(itens.map((i) => i.toLowerCase())).size !== itens.length) return { erro: "Há itens repetidos." };
    return { config: { itens } };
  }

  if (tipo === "numero") {
    const min = numero(entrada.min);
    const max = numero(entrada.max);
    const referencia = numero(entrada.referencia);
    const casas = Number(entrada.casas ?? "0");
    const unidade = (entrada.unidade ?? "").trim().slice(0, 20) || null;
    if ([min, max, referencia].some((n) => n !== null && Number.isNaN(n))) {
      return { erro: "Mínimo, máximo e referência precisam ser números." };
    }
    if (![0, 1, 2, 3, 4].includes(casas)) return { erro: "Escolha de 0 a 4 casas decimais." };
    if (min !== null && max !== null && max <= min) return { erro: "O máximo precisa ser maior que o mínimo." };
    if (referencia !== null && ((min !== null && referencia < min) || (max !== null && referencia > max))) {
      return { erro: "A referência precisa estar entre o mínimo e o máximo." };
    }
    return { config: { casas, unidade, min, max, referencia } };
  }

  if (tipo === "aberta") {
    const maxCaracteres = Number(entrada.max_caracteres);
    if (!Number.isInteger(maxCaracteres) || maxCaracteres < LIMITE_CARACTERES.min || maxCaracteres > LIMITE_CARACTERES.max) {
      return { erro: `O tamanho máximo precisa ficar entre ${LIMITE_CARACTERES.min} e ${LIMITE_CARACTERES.max} caracteres.` };
    }
    return { config: { max_caracteres: maxCaracteres } };
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
  if (![1, 2, 3, 4, 5].includes(maxPalavras)) return { erro: "Escolha de uma a cinco palavras." };
  return { config: { max_palavras: maxPalavras } };
}

// ---------------------------------------------------------------
// Resposta do participante
// ---------------------------------------------------------------

// Formato da resposta de cada tipo. Quem valida é o banco (normalizar_resposta,
// migração 0014); o celular só monta o valor.
export type ValorResposta =
  | { opcao: number }
  | { opcoes: number[] }
  | { numero: number }
  | { palavras: string[] }
  | { ordem: number[] }
  | { texto: string };
