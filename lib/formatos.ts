// Regras de formato usadas no navegador e no servidor.

// Mesmo alfabeto do banco (0007): sem 0, O, 1, I e L.
export const CODIGO_ACESSO_REGEX = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/;

export function normalizarCodigo(valor: unknown) {
  return String(valor ?? "").replace(/\s+/g, "").toUpperCase();
}

export function textoLimpo(valor: unknown, maximo = 200) {
  return String(valor ?? "").replace(/\s+/g, " ").trim().slice(0, maximo);
}

export function uuidValido(valor: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valor);
}

export function formatarData(iso: string) {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

export function formatarPeriodo(inicio: string, fim: string) {
  return inicio === fim ? formatarData(inicio) : `${formatarData(inicio)} a ${formatarData(fim)}`;
}

// Mesma lista do CHECK eventos_estado_check no banco.
export type EstadoEvento = "planejamento" | "ao_vivo" | "encerrado";

export const rotuloEstado: Record<EstadoEvento, string> = {
  planejamento: "Planejamento",
  ao_vivo: "Ao vivo",
  encerrado: "Encerrado",
};

export const UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA",
  "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
];
